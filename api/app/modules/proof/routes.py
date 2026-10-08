from fastapi import APIRouter, Depends, Request
from api.app.core.runtime import store
from api.app.core.security import require_roles, scoped_job, scoped_machine
from contract.errors import DomainError
from contract.state import emit
from contract.lifecycle import DONE
from . import service as domain
from api.app.core.views import machine_view
from .package import make_package, public_key

router=APIRouter(tags=['Completion verification'])
read= require_roles('coordinator','manager','supervisor','requester','auditor','admin','technician')
write= require_roles('coordinator','manager','admin','technician')
customer=require_roles('supervisor','admin')

@router.post('/stores/issue')
def store_issue(body:dict,request:Request,p=Depends(require_roles('storekeeper','admin'))):
    key=request.headers.get('Idempotency-Key')
    return store.mutate(lambda s:domain.store_issue(s,body['job_id'],body,p),key=f"{p['user_id']}:{key}" if key else None,body={'path':request.url.path,'body':body})

def mutate(job_id, principal, fn, request=None, body=None):
    def action(s):
        scoped_job(s,job_id,principal)
        return fn(s)
    key=request.headers.get('Idempotency-Key') if request else None
    return store.mutate(action,key=f"{principal['user_id']}:{key}" if key else None,body={'path':request.url.path,'body':body} if request else body)

@router.post('/jobs/{job_id}/report')
def report(job_id:str, body:dict, request:Request, p=Depends(write)):
    return mutate(job_id,p,lambda s:domain.submit_report(s,job_id,body,p['user_id']),request,body)

@router.post('/jobs/{job_id}/checkin')
def checkin(job_id:str, body:dict, request:Request, p=Depends(write)):
    return mutate(job_id,p,lambda s:domain.check_in(s,job_id,body,p['user_id']),request,body)

@router.post('/jobs/{job_id}/checkout')
def checkout(job_id:str, body:dict, request:Request, p=Depends(write)):
    return mutate(job_id,p,lambda s:domain.check_out(s,job_id,body,p['user_id']),request,body)

@router.post('/jobs/{job_id}/evidence')
def evidence(job_id:str, body:dict, request:Request, p=Depends(write)):
    return mutate(job_id,p,lambda s:domain.attach_evidence(s,job_id,body,p['user_id']),request,body)

@router.get('/jobs/{job_id}/reconciliation')
def reconciliation(job_id:str,p=Depends(read)):
    s=store.read(); scoped_job(s,job_id,p); return domain.reconcile(s,job_id)

@router.post('/jobs/{job_id}/variance')
def variance(job_id:str,body:dict,request:Request,p=Depends(write)):
    return mutate(job_id,p,lambda s:domain.explain_variance(s,job_id,body,p['user_id'],p['role'] in ('manager','admin')),request,body)

@router.post('/jobs/{job_id}/accept')
def accept(job_id:str,body:dict,request:Request,p=Depends(customer)):
    return mutate(job_id,p,lambda s:domain.accept(s,job_id,body,p),request,body)

@router.post('/jobs/{job_id}/accept-alternative')
def accept_alternative(job_id:str,body:dict,request:Request,p=Depends(customer)):
    return mutate(job_id,p,lambda s:domain.alternate_accept(s,job_id,body,p),request,body)

@router.post('/jobs/{job_id}/machine-running')
def running(job_id:str,request:Request,p=Depends(customer)):
    def confirm(s):
        if not s.jobs[job_id].get('checkout_at'):raise DomainError('NOTHING_TO_CONFIRM','The technician has not finished this job yet, so there is nothing to confirm.',status=409)
        return domain.machine_running(s,job_id,'customer confirmation',p['user_id'])
    return mutate(job_id,p,confirm,request,{})

@router.post('/jobs/{job_id}/dispute')
def dispute(job_id:str,body:dict,request:Request,p=Depends(customer)):
    return mutate(job_id,p,lambda s:domain.dispute(s,job_id,body,p['user_id']),request,body)

@router.get('/jobs/{job_id}/package')
def package(job_id:str,p=Depends(read)):
    s=store.read(); scoped_job(s,job_id,p); return make_package(s,job_id)

@router.get('/machines/{machine_id}/passport')
def passport(machine_id:str,p=Depends(read)):
    s=store.read(); scoped_machine(s,machine_id,p)
    return {'machine':machine_view(s,s.machines[machine_id]),'jobs':[j for j in s.jobs.values() if j['machine_id']==machine_id],'events':[e for e in s.events if e['machine']==machine_id]}

@router.get('/machines/{machine_id}/package')
def machine_package(machine_id:str,p=Depends(read)):
    s=store.read(); scoped_machine(s,machine_id,p)
    job=next((j for j in reversed(list(s.jobs.values())) if j['machine_id']==machine_id),None)
    if not job: raise DomainError('NO_SERVICE_HISTORY','This machine has no service history',status=404)
    return make_package(s,job['id'])

@router.get('/.well-known/rivet-keys.json')
def keys(): return {'keys':[public_key()]}

@router.post('/proof/reminders')
def reminders(p=Depends(require_roles('coordinator','manager','admin'))):
    return store.mutate(domain.reminders)

@router.post('/telemetry')
def telemetry(body:dict,p=Depends(require_roles('coordinator','admin'))):
    def action(s):
        machine_id=body['machine_id']; scoped_machine(s,machine_id,p)
        if not s.adapters.get('telemetry',{}).get('enabled'): raise DomainError('ADAPTER_DISABLED','Telemetry adapter is disabled')
        if body.get('reading_id') in s.metadata.setdefault('telemetry_ids',[]): return {'duplicate':True}
        s.metadata['telemetry_ids'].append(body.get('reading_id')); emit(s,'TelemetryReceived',machine_id,{**body,'source':'simulator'},p['user_id'])
        if body.get('status')=='fault':
            from api.app.modules.ledger.domain import create_request
            previous=next((j for j in reversed(list(s.jobs.values())) if j['machine_id']==machine_id and j.get('checkout_at')),None)
            if previous and previous.get('state') in ('completed','verified','closed'):
                return domain.fix_failed(s,previous['id'],p['user_id'])
            return create_request(s,{'machine_id':machine_id,'fault':'hydraulic_leak','source':'simulated telemetry'})
        j=next((j for j in reversed(list(s.jobs.values())) if j['machine_id']==machine_id and j['state'] not in DONE),None)
        normal=body.get('status')=='running' and isinstance(body.get('pressure_bar'),int) and 120<=body['pressure_bar']<=160
        return domain.machine_running(s,j['id'],'simulated telemetry',p['user_id']) if j and normal else {'recorded':True,'fix_confirmed':False}
    return store.mutate(action,key=f"telemetry:{body.get('reading_id')}",body=body)
