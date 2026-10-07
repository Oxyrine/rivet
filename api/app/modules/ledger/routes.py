import os
import base64
import hashlib
from datetime import timedelta
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from contract.commands import CreateRequest, AssignJob, Hold, DeviceBatch
from contract.errors import DomainError
from contract.state import emit
from api.app.core.runtime import store
from api.app.core.auth import require_roles, scoped_job, scoped_machine, tokens, hosted, SECRET
from api.app.core.clock import now, iso, demo_controls
from .domain import create_request, approve, assign, hold, release, candidates, move
from .sync import replay, command
from .uploads import record_upload,uploaded_content
from fastapi.responses import Response
from urllib.parse import quote

router=APIRouter()
read= require_roles()
ops=require_roles('coordinator','manager')
customer=require_roles('supervisor','requester')

@router.post('/evidence/uploads')
def upload_evidence(body:dict,p=Depends(require_roles('technician','coordinator','manager','supervisor','storekeeper'))):
    return store.mutate(lambda s:record_upload(s,body,p))

@router.get('/evidence/uploads/{ident}')
def evidence_file(ident:str,p=Depends(read)):
    content,record=uploaded_content(store.read(),ident,p)
    return Response(content,media_type=record['content_type'],headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(record['filename']),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})

def mutate(fn, body, principal, key=None):
    return store.mutate(fn,key=principal['user_id']+':'+key if key else None,body=body)

@router.post('/auth/otp')
def otp(body:dict):
    if os.getenv('ENV','demo') not in ('demo','test'):raise DomainError('AUTH_PROVIDER_REQUIRED','Production OTP provider is not configured',status=503)
    if body.get('user_id') not in store.read().users:raise DomainError('UNKNOWN_USER','Unknown account',status=401)
    return {'sent':True,'demo_otp':'246810'}

@router.post('/auth/token')
def token(body:dict):
    if os.getenv('ENV','demo') not in ('demo','test'):raise DomainError('AUTH_PROVIDER_REQUIRED','Production authentication is not configured',status=503)
    state=store.read();user=state.users.get(body.get('user_id'))
    if not user or body.get('otp')!=state.metadata['demo_credentials']['otp']:raise DomainError('INVALID_OTP','Invalid account or OTP',status=401)
    return tokens(user)

@router.get('/auth/me')
def me(p=Depends(read)):
    return {k:v for k,v in p.items() if k!='pin'}

@router.get('/admin/users')
def list_users(p=Depends(require_roles('admin'))):
    return [{'user_id':u['user_id'],'role':u['role'],'sites':u.get('sites',[]),'technician_id':u.get('technician_id'),'email':u.get('email'),'phone':u.get('phone'),'linked':bool(u.get('email') or u.get('phone'))} for u in store.read().users.values()]

@router.post('/admin/users/{ident}/link')
def link_user(ident:str,body:dict,p=Depends(require_roles('admin'))):
    """Connects a Supabase sign-in (email or phone) to a Rivet user, who carries the role and site scope."""
    email=str(body.get('email') or '').strip().lower();phone=str(body.get('phone') or '').strip()
    if not email and not phone:raise DomainError('VALIDATION_FAILED','Provide an email or phone number',status=422)
    def fn(s):
        user=s.users.get(ident)
        if not user:raise DomainError('NOT_FOUND','User not found',status=404)
        for other in s.users.values():
            if other['user_id']!=ident and ((email and (other.get('email') or '').lower()==email) or (phone and other.get('phone')==phone)):
                raise DomainError('ALREADY_LINKED','That sign-in is already linked to another user',status=409)
        if email:user['email']=email
        if phone:user['phone']=phone
        # The audit chain keeps only a hash, so the address can be erased without breaking history.
        emit(s,'UserLinked',None,{'user_id':ident,'identity_sha256':hashlib.sha256((email or phone).encode()).hexdigest()},p['user_id'])
        return {'user_id':ident,'linked':True}
    return store.mutate(fn)

def _demo_account_emails(p,body,s):
    base=str(body.get('base_email') or s.users.get(p['user_id'],{}).get('email') or os.getenv('BOOTSTRAP_ADMIN_EMAIL','')).strip().lower()
    if '@' not in base:raise DomainError('VALIDATION_FAILED','Provide base_email: the inbox the demo sign-ins will be variants of',status=422)
    from . import demo_accounts
    wanted=[u for u in demo_accounts.DEMO_USERS if u in s.users]
    # A user holds one email, so a real person's link is never replaced by a demo account.
    skipped=[u for u in wanted if s.users[u].get('email') and not demo_accounts.is_demo_email(s.users[u]['email'])]
    return {u:demo_accounts.demo_email(base,u) for u in wanted if u not in skipped},skipped

def _demo_accounts_allowed():
    if not demo_controls():raise DomainError('FORBIDDEN','Demo accounts are disabled: demo controls are off on this server',status=403)
    if not hosted():raise DomainError('NOT_NEEDED','This server signs in with the demo code, so it needs no accounts',status=409)

@router.post('/admin/demo-accounts')
def create_demo_accounts(body:dict={},p=Depends(require_roles('admin'))):
    """Real sign-ins for the seeded demo roles, shown once. Re-running gives every account a fresh password."""
    _demo_accounts_allowed()
    from . import demo_accounts
    emails,skipped=_demo_account_emails(p,body,store.read())
    results=demo_accounts.provision(emails)
    ready=[r['user_id'] for r in results if r.get('password')]
    def fn(s):
        for user_id in ready:
            email=emails[user_id]
            if any(o['user_id']!=user_id and (o.get('email') or '').lower()==email for o in s.users.values()):continue
            s.users[user_id]['email']=email
            emit(s,'UserLinked',None,{'user_id':user_id,'identity_sha256':hashlib.sha256(email.encode()).hexdigest()},p['user_id'])
        return {'linked':ready}
    store.mutate(fn)  # the passwords stay out of the stored result: only who was linked is recorded
    people={u:store.read().users[u] for u in emails}
    accounts=[{**r,'role':people[r['user_id']]['role']} for r in results]
    return JSONResponse({'accounts':accounts,'skipped':skipped},headers={'Cache-Control':'no-store'})

@router.delete('/admin/demo-accounts')
def delete_demo_accounts(body:dict={},p=Depends(require_roles('admin'))):
    """Delete the demo sign-ins after the demo and unlink them from their Rivet users."""
    _demo_accounts_allowed()
    from . import demo_accounts
    s=store.read()
    emails={u['user_id']:u['email'] for u in s.users.values() if demo_accounts.is_demo_email(u.get('email'))}
    gone=demo_accounts.remove(emails)
    def fn(state):
        for user_id in gone:state.users[user_id].pop('email',None)
        return {'removed':gone}
    store.mutate(fn)
    return {'removed':gone,'kept':sorted(set(emails)-set(gone))}

_entry_hits={}

def _throttle_entry(request,limit=20,window=60):
    """One visitor cannot hammer the unauthenticated demo entry: {limit} tries a minute per address."""
    import time
    who=(request.headers.get('x-forwarded-for','').split(',')[0].strip() or (request.client.host if request.client else 'unknown'))
    stamp=time.monotonic();hits=[t for t in _entry_hits.get(who,[]) if stamp-t<window]
    if len(hits)>=limit:raise DomainError('RATE_LIMITED','Too many demo sign-in attempts. Wait a minute and try again.',status=429)
    hits.append(stamp);_entry_hits[who]=hits
    if len(_entry_hits)>1000:_entry_hits.clear()

def _entry_open():return hosted() and demo_controls()

@router.get('/auth/demo-entry')
def demo_entry_options():
    """Which demo roles the sign-in screen may offer as one-click buttons. Names only, nothing secret."""
    if not _entry_open():return {'enabled':False,'roles':[]}
    from . import demo_accounts
    s=store.read()
    roles=[{'user_id':u,'role':s.users[u]['role']} for u in demo_accounts.entry_users() if u in s.users and demo_accounts.is_demo_email(s.users[u].get('email'))]
    return {'enabled':bool(roles),'roles':roles}

@router.post('/auth/demo-entry')
def demo_entry(body:dict,request:Request):
    """One-click sign-in for a demo account: a one-time Supabase token, only while demo controls are on. A real person's account is never offered."""
    if not _entry_open():raise DomainError('FORBIDDEN','Demo entry is off on this server',status=403)
    _throttle_entry(request)
    from . import demo_accounts
    user_id=str(body.get('user_id') or '')
    if user_id not in demo_accounts.entry_users():raise DomainError('FORBIDDEN','That role is not available for demo entry',status=403)
    user=store.read().users.get(user_id)
    if not user or not demo_accounts.is_demo_email(user.get('email')):
        raise DomainError('NOT_READY','Demo logins are not set up yet. An administrator can create them on the Team access page.',status=409)
    return JSONResponse(demo_accounts.entry_link(user['email']),headers={'Cache-Control':'no-store'})

@router.post('/auth/refresh')
def refresh(body:dict):
    import jwt
    try:
        claims=jwt.decode(body['refresh_token'],SECRET,algorithms=['HS256'])
        if claims['kind']!='refresh':raise ValueError()
        return tokens(store.read().users[claims['sub']])
    except Exception:raise DomainError('UNAUTHENTICATED','Refresh token expired or invalid',status=401)

@router.post('/requests')
def request(body:CreateRequest,p=Depends(require_roles('coordinator','manager','requester','supervisor')),idempotency_key:str|None=Header(None)):
    data=body.model_dump()
    def fn(s):scoped_machine(s,data['machine_id'],p);return create_request(s,{**data,'actor':p['user_id']})
    return mutate(fn,data,p,idempotency_key)

@router.get('/requests/{ident}')
def get_request(ident:str,p=Depends(read)):
    s=store.read();r=s.requests.get(ident)
    if not r:raise DomainError('NOT_FOUND','Request not found',status=404)
    scoped_machine(s,r['machine_id'],p);return r

@router.post('/requests/{ident}/approve')
def approve_request(ident:str,p=Depends(ops)):
    def fn(s):
        if ident not in s.requests:raise DomainError('NOT_FOUND','Request not found',status=404)
        scoped_machine(s,s.requests[ident]['machine_id'],p);return approve(s,ident,p['user_id'])
    return store.mutate(fn)

@router.get('/jobs')
def jobs(state:str|None=None,cursor:int=0,p=Depends(read)):
    s=store.read();items=[]
    for job in s.jobs.values():
        try:scoped_job(s,job['id'],p)
        except DomainError:continue
        if not state or job['state']==state:items.append(job)
    return {'items':items[cursor:cursor+100],'next_cursor':cursor+100 if len(items)>cursor+100 else None}

@router.get('/jobs/{ident}')
def get_job(ident:str,p=Depends(read)):
    s=store.read();job=scoped_job(s,ident,p);return {**job,'commitments':[c for c in s.commitments.values() if c.get('job_id')==ident],'candidates':candidates(s,job)}

@router.post('/jobs/{ident}/assign')
def assign_job(ident:str,body:AssignJob,p=Depends(ops),idempotency_key:str|None=Header(None)):
    def fn(s):scoped_job(s,ident,p);return assign(s,ident,body.technician_id,p['user_id'])
    return mutate(fn,body.model_dump(),p,idempotency_key)

@router.post('/commitments/hold')
def hold_resource(body:Hold,p=Depends(ops),idempotency_key:str|None=Header(None)):
    def fn(s):scoped_job(s,body.job_id,p);return hold(s,{**body.model_dump(),'actor':p['user_id']})
    return mutate(fn,body.model_dump(),p,idempotency_key)

@router.post('/commitments/{ident}/release')
def release_resource(ident:str,p=Depends(ops)):
    def fn(s):
        if ident not in s.commitments:raise DomainError('NOT_FOUND','Commitment not found',status=404)
        scoped_job(s,s.commitments[ident]['job_id'],p);return release(s,ident,p['user_id'])
    return store.mutate(fn)

@router.post('/commitments/{ident}/transfer')
def transfer_resource(ident:str,body:dict,p=Depends(ops),idempotency_key:str|None=Header(None)):
    def fn(s):
        if ident not in s.commitments:raise DomainError('NOT_FOUND','Commitment not found',status=404)
        item=s.commitments[ident];old=scoped_job(s,item['job_id'],p);new=scoped_job(s,body['job_id'],p)
        if item['state']!='HELD':raise DomainError('INVALID_HOLD','Only held resources can transfer')
        move(s,f"job:{old['id']}:reserved",f"job:{new['id']}:reserved",item['resource'],item['quantity'],p['user_id'])
        item['job_id']=new['id'];item['owner']=new['technician_id'];emit(s,'HoldTransferred',new['machine_id'],item,p['user_id']);return item
    return mutate(fn,body,p,idempotency_key)

@router.post('/customer-commitments/{ident}/{action}')
def customer_commitment(ident:str,action:str,body:dict={},p=Depends(customer)):
    if action not in ('confirm','fulfil'):raise DomainError('NOT_FOUND','Unknown action',status=404)
    def fn(s):
        item=s.commitments.get(ident)
        if not item:raise DomainError('NOT_FOUND','Commitment not found',status=404)
        job=scoped_job(s,item['job_id'],p);item['state']='FULFILLED' if action=='fulfil' else 'HELD';item[action+'_at']=s.now
        emit(s,'CustomerCommitmentFulfilled' if action=='fulfil' else 'CustomerCommitmentConfirmed',job['machine_id'],item,p['user_id'])
        if action=='fulfil' and item['type']=='PERMIT_TO_WORK':
            for pause in s.pauses.values():
                if pause['job_id']==job['id'] and not pause.get('end'):
                    pause['end']=pause['ended_at']=s.now;duration=(now(s)-__import__('datetime').datetime.fromisoformat(pause['start'])).total_seconds()
                    pause['confirmed']=duration<=1800;pause['state']='confirmed' if duration<=1800 else 'confirmation_required';emit(s,'SlaResumed',job['machine_id'],pause,p['user_id'])
        if action=='fulfil' and job.get('checkout_at') and job.get('machine_running_at'):
            from api.app.modules.proof.service import service_restored
            service_restored(s,job,p['user_id'])
        return item
    return store.mutate(fn)

@router.post('/pauses/{ident}/contest')
def contest(ident:str,body:dict,p=Depends(customer)):
    def fn(s):
        if ident not in s.pauses:raise DomainError('NOT_FOUND','Pause not found',status=404)
        pause=s.pauses[ident];job=scoped_job(s,pause['job_id'],p);pause.update(state='contested',confirmed=False,reason_contested=body.get('reason',''))
        emit(s,'PauseContested',job['machine_id'],pause,p['user_id'])
        if job.get('checkout_at') and job.get('machine_running_at'):
            from api.app.modules.proof.service import service_restored
            service_restored(s,job,p['user_id'])
        return pause
    return store.mutate(fn)

@router.post('/pauses/{ident}/confirm')
def confirm_pause(ident:str,p=Depends(customer)):
    def fn(s):
        if ident not in s.pauses:raise DomainError('NOT_FOUND','Pause not found',status=404)
        pause=s.pauses[ident];job=scoped_job(s,pause['job_id'],p);pause.update(state='confirmed',confirmed=True);emit(s,'PauseConfirmed',job['machine_id'],pause,p['user_id'])
        if job.get('checkout_at') and job.get('machine_running_at'):
            from api.app.modules.proof.service import service_restored
            service_restored(s,job,p['user_id'])
        return pause
    return store.mutate(fn)

def device_scope(s,ident,p):
    device=s.devices.get(ident)
    if not device or p.get('tenant_id')!=s.tenant_id or (p['role']!='admin' and p.get('device_id')!=ident):raise DomainError('FORBIDDEN','Device belongs to another user',status=403)
    return device

@router.get('/devices/{ident}/shift-cache')
def shift(ident:str,p=Depends(require_roles('technician'))):
    s=store.read();device_scope(s,ident,p)
    assigned=[j for j in s.jobs.values() if j.get('technician_id')==p.get('technician_id')];ids={j['id'] for j in assigned}
    return {'cached_at':s.now,'jobs':assigned,'commitments':[c for c in s.commitments.values() if c.get('job_id') in ids],'last_seq':s.devices[ident]['last_seq']}

@router.post('/devices/{ident}/commands')
def commands(ident:str,body:DeviceBatch,p=Depends(require_roles('technician'))):
    def fn(s):device_scope(s,ident,p);return replay(s,ident,[c.model_dump() for c in body.commands],p)
    return store.mutate(fn)

@router.post('/jobs/{ident}/actions/{kind}')
def action(ident:str,kind:str,body:dict,p=Depends(require_roles('technician')),idempotency_key:str|None=Header(None)):
    def fn(s):
        scoped_job(s,ident,p);device=s.devices[p['device_id']]
        cmd={'idempotency_key':idempotency_key or f'online-{len(s.events)}','device_ts':s.now,'type':kind,'job_id':ident,'payload':body}
        return command(s,device,cmd,p)
    return mutate(fn,body,p,idempotency_key)

@router.post('/sites/{ident}/gate-key')
def gate_key(ident:str,body:dict,p=Depends(require_roles('supervisor'))):
    def fn(s):
        if ident not in p['sites']:raise DomainError('FORBIDDEN','Site outside scope',status=403)
        try:
            if len(base64.b64decode(body['public_key'],validate=True))!=32:raise ValueError()
        except Exception:raise DomainError('INVALID_KEY','Ed25519 public key must be 32 bytes',status=422)
        existing=s.metadata.setdefault('gate_keys',{}).get(ident)
        if existing and existing!=body['public_key']:raise DomainError('KEY_ALREADY_ENROLLED','Gate key replacement requires administrator rotation')
        s.metadata['gate_keys'][ident]=body['public_key'];emit(s,'GateKeyEnrolled',None,{'site_id':ident},p['user_id']);return {'enrolled':True}
    return store.mutate(fn)

@router.get('/dashboard/summary')
def dashboard(p=Depends(read)):
    s=store.read();visible=[j for j in s.jobs.values() if j['site_id'] in p['sites'] and (p['role']!='technician' or j.get('technician_id')==p.get('technician_id'))]
    ids={j['id'] for j in visible}
    return {'now':s.now,'jobs':visible,'machines':[m for m in s.machines.values() if m['site_id'] in p['sites']],'sites':[v for k,v in s.sites.items() if k in p['sites']],'technicians':list(s.technicians.values()) if p['role'] in ('coordinator','manager','admin') else [],'breaches':[b for b in s.breaches.values() if not b.get('job_id') or b['job_id'] in ids],'commitments':[c for c in s.commitments.values() if c.get('job_id') in ids],'event_cursor':len(s.events)}

@router.get('/adapters')
def adapters(p=Depends(read)):return store.read().adapters

@router.post('/adapters/{name}/enable')
def enable_adapter(name:str,p=Depends(ops)):
    def fn(s):
        if name not in s.adapters:raise DomainError('NOT_FOUND','Adapter not registered',status=404)
        s.adapters[name]['enabled']=True;emit(s,'AdapterEnabled',None,{'name':name},p['user_id']);return s.adapters[name]
    return store.mutate(fn)

@router.get('/subscriptions/{name}/events')
def feed(name:str,after:int=0,p=Depends(require_roles('coordinator','manager','auditor'))):
    s=store.read()
    if name not in s.adapters or not s.adapters[name]['enabled']:return {'events':[],'cursor':after}
    events=[e for e in s.events if e['tenant_seq']>after and (not e['machine'] or s.machines[e['machine']]['site_id'] in p['sites'])]
    return {'events':events[:100],'cursor':events[min(99,len(events)-1)]['tenant_seq'] if events else after}

@router.get('/admin/clock')
def get_clock(p=Depends(read)):return {'now':store.read().now}

@router.post('/admin/clock')
def set_clock(body:dict,p=Depends(require_roles('admin'))):
    if not demo_controls():raise DomainError('FORBIDDEN','Demo clock is disabled',status=403)
    def fn(s):
        s.now=iso(body['set']) if 'set' in body else (now(s)+timedelta(seconds=body.get('advance',0))).isoformat()
        from api.app.core.scheduler import tick
        changes=tick(s)
        return {'now':s.now,'scheduler':changes}
    return store.mutate(fn)

@router.post('/admin/reset')
def reset(p=Depends(require_roles('admin'))):
    if not demo_controls():raise DomainError('FORBIDDEN','Demo reset is disabled',status=403)
    return store.reset()
