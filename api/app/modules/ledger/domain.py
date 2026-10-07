from datetime import datetime, timedelta
from math import ceil
from contract.errors import DomainError
from contract.state import emit
from api.app.core.clock import now

def move(state, source, dest, resource, quantity, actor='system'):
    if not isinstance(quantity, int) or isinstance(quantity,bool) or quantity <= 0: raise DomainError('BAD_QUANTITY', 'Quantity must be a positive integer')
    source_key, dest_key = source+'|'+resource, dest+'|'+resource
    available = state.balances.get(source_key, 0)
    if available < quantity: raise DomainError('INSUFFICIENT_BALANCE', 'Resource is no longer available', {'available': available, 'resource':resource})
    state.balances[source_key] = available-quantity
    state.balances[dest_key] = state.balances.get(dest_key,0)+quantity
    tx = f'move-{len(state.entries)//2+1:06d}'
    state.entries.extend([{'transaction_id':tx,'account':source,'resource':resource,'quantity':-quantity,'actor':actor,'occurred_at':state.now}, {'transaction_id':tx,'account':dest,'resource':resource,'quantity':quantity,'actor':actor,'occurred_at':state.now}])

def invariants(state):
    if any(not isinstance(v,int) or v < 0 for v in state.balances.values()): raise DomainError('LEDGER_INVARIANT', 'Negative or fractional balance')
    groups={}
    for entry in state.entries:
        key=(entry['transaction_id'],entry['resource'])
        groups[key]=groups.get(key,0)+entry['quantity']
    if any(groups.values()): raise DomainError('LEDGER_INVARIANT','Unbalanced journal')
    totals={}
    for key,value in state.balances.items():
        resource=key.rsplit('|',1)[1]; totals[resource]=totals.get(resource,0)+value
    for resource,total in state.metadata.get('initial_resource_totals',{}).items():
        if totals.get(resource,0)!=total: raise DomainError('LEDGER_INVARIANT','Resource units are not conserved',{'resource':resource})
    return True

def hold(state, command):
    job=state.jobs[command['job_id']]
    source=command['source']; resource=command['resource']; qty=command.get('quantity',1)
    move(state,source,f"job:{job['id']}:reserved",resource,qty,command.get('actor','system'))
    ident=f"hold-{len(state.commitments)+1:05d}"
    same=[v['id'] for v in state.commitments.values() if v.get('source')==source and v.get('resource')==resource]
    if 'time:'+job['id'] in state.commitments:same.append('time:'+job['id'])
    item={'id':ident,'type':command.get('type','PART_HOLD'),'job_id':job['id'],'resource':resource,'quantity':qty,'source':source,'owner':job.get('technician_id'),'state':'HELD','physical_location':source.split(':')[1] if ':' in source else source,'expires_at':command.get('expires_at') or (now(state)+timedelta(hours=4)).isoformat(),'depends_on':same}
    state.commitments[ident]=item
    emit(state,'ResourceHeld',job['machine_id'],item,command.get('actor','system'))
    return item

def release(state, ident, actor='system'):
    item=state.commitments[ident]
    if item['state'] not in ('HELD','ACTIVE'): return item
    move(state,f"job:{item['job_id']}:reserved",item['source'],item['resource'],item['quantity'],actor)
    item['state']='RELEASED'; emit(state,'ResourceReleased',state.jobs[item['job_id']]['machine_id'],item,actor)
    return item

def candidates(state, job):
    skill='hydraulics' if job['fault']=='hydraulic_leak' else 'gearbox'
    result=[]
    for tech in state.technicians.values():
        reasons=[]
        if not tech['available']: reasons.append('UNAVAILABLE')
        if not tech['certificate_valid'] or tech.get('certificate_expires','9999') < state.now[:10]: reasons.append('CERT_EXPIRED')
        if tech['skills'].get(skill,0)<2: reasons.append('SKILL_MISMATCH')
        if tech.get('distance_km',0)>100: reasons.append('OUTSIDE_RADIUS')
        projected_start=now(state)+timedelta(minutes=tech.get('travel_minutes',0))
        projected_end=projected_start+timedelta(minutes=job.get('duration_minutes',60))
        for existing in state.jobs.values():
            if existing['id']==job['id'] or existing.get('technician_id')!=tech['id'] or existing['state'] in ('closed','cancelled','completed') or not existing.get('planned_start'):continue
            start=datetime.fromisoformat(existing['planned_start']);end=start+timedelta(minutes=existing.get('duration_minutes',60))
            if projected_start<end and projected_end>start:
                reasons.append('TIME_CONFLICT');break
        if state.balances.get(f"tech:{tech['id']}:{state.now[:10]}:free|TIME",0)<ceil(job.get('duration_minutes',60)/15):reasons.append('SHIFT_CAPACITY')
        result.append({**tech,'eligible':not reasons,'reason_codes':reasons})
    return sorted(result,key=lambda t:(not t['eligible'],t.get('travel_minutes',0),t['id']))

def create_request(state, command):
    machine=state.machines.get(command['machine_id'])
    if not machine or not machine.get('eligible'): raise DomainError('MACHINE_INELIGIBLE','Machine is not covered')
    duplicate=next((j for j in state.jobs.values() if j['machine_id']==machine['id'] and j['state'] not in ('closed','cancelled') and j['fault']==command.get('fault','hydraulic_leak')),None)
    if duplicate:return {'id':duplicate.get('request_id',duplicate['id']),'job_id':duplicate['id'],'duplicate':True}
    number=state.metadata.get('next_request',2231); state.metadata['next_request']=number+1
    ident=f'R-{number}'; job_id=f'J-{number}'; contract=state.contracts[machine['contract_id']]
    parts=command.get('planned_parts', {'HS-40':1} if command.get('fault','hydraulic_leak')=='hydraulic_leak' else {})
    job={'id':job_id,'request_id':ident,'machine_id':machine['id'],'site_id':machine['site_id'],'priority':command.get('priority',machine['contract_id']),'fault':command.get('fault','hydraulic_leak'),'created_at':state.now,'deadline':(now(state)+timedelta(minutes=contract['resolution_minutes'])).isoformat(),'state':'pending_approval','technician_id':None,'duration_minutes':state.metadata['durations'].get(command.get('fault','hydraulic_leak'),60),'planned_parts':parts,'issued_parts':{},'evidence':[],'tasks':[],'checklist':[],'acceptance':'Pending','on_site':False}
    state.jobs[job_id]=job
    checks={'eligible':True,'skills':any(c['eligible'] for c in candidates(state,job)),'parts':all(state.balances.get('store:site-b:available|'+r,0)>=q for r,q in parts.items()),'tools':state.balances.get('store:site-b:available|JACK',0)>0,'priority':job['priority'],'site_id':machine['site_id'],'contention':"HS-40: 1 left after J-2240's hold"}
    request={'id':ident,'job_id':job_id,'machine_id':machine['id'],'source':command.get('source','portal'),'description':command.get('description',''),'state':'pending_approval','validation':checks}
    state.requests[ident]=request;machine['status']='Fault detected'
    emit(state,'RequestCreated',machine['id'],request,command.get('actor','system'));emit(state,'SlaStarted',machine['id'],{'job_id':job_id,'contract':contract},command.get('actor','system'))
    estimate=sum(state.metadata['part_costs_paise'].get(r,0)*q for r,q in parts.items())
    request['auto_approved']=checks['skills'] and checks['parts'] and checks['tools'] and estimate<=contract['auto_approve_paise']
    if request['auto_approved']: approve(state,ident,command.get('actor','system'))
    return request

def approve(state, ident, actor='system'):
    request=state.requests[ident];job=state.jobs[request['job_id']]
    if request['state']=='approved':return request
    request['state']='approved';job['state']='approved'
    for kind in ('ACCESS_WINDOW','SHUTDOWN_WINDOW','PERMIT_TO_WORK'):
        cid=f"{kind.lower()}:{job['id']}"
        state.commitments[cid]={'id':cid,'type':kind,'job_id':job['id'],'state':'PROPOSED','owner':'supervisor','depends_on':[]}
    emit(state,'RequestApproved',job['machine_id'],{'request_id':ident,'job_id':job['id']},actor)
    return request

def assign(state, job_id, technician_id=None, actor='system'):
    job=state.jobs[job_id]
    if job['state']=='assigned':return job
    if job['state']!='approved': raise DomainError('APPROVAL_REQUIRED','Approve request before assigning')
    eligible=[c for c in candidates(state,job) if c['eligible'] and (not technician_id or c['id']==technician_id)]
    if not eligible:raise DomainError('NO_FEASIBLE_TECHNICIAN','No qualified technician is available')
    tech=eligible[0];job['technician_id']=tech['id']; job['state']='assigned';job['planned_start']=(now(state)+timedelta(minutes=tech['travel_minutes'])).isoformat()
    account=f"tech:{tech['id']}:{state.now[:10]}:free";slots=ceil(job['duration_minutes']/15)
    move(state,account,f'job:{job_id}:allocated','TIME',slots,actor)
    prior=['time:'+j['id'] for j in sorted(state.jobs.values(),key=lambda x:x.get('planned_start','')) if j.get('technician_id')==tech['id'] and j['id']!=job_id and j.get('planned_start','')<job['planned_start']]
    state.commitments['time:'+job_id]={'id':'time:'+job_id,'type':'TECH_TIME','job_id':job_id,'owner':tech['id'],'resource':'TIME','quantity':slots,'source':account,'reservation_account':f'job:{job_id}:allocated','starts_at':job['planned_start'],'ends_at':(datetime.fromisoformat(job['planned_start'])+timedelta(minutes=job['duration_minutes'])).isoformat(),'state':'HELD','depends_on':prior}
    for item in state.commitments.values():
        if item['type']=='TECH_TIME' and item.get('owner')==tech['id'] and item.get('job_id')!=job_id and item.get('starts_at','')>job['planned_start']:
            item.setdefault('depends_on',[]).append('time:'+job_id)
    for resource,qty in job['planned_parts'].items():hold(state,{'job_id':job_id,'source':'store:site-b:available','resource':resource,'quantity':qty,'actor':actor})
    hold(state,{'job_id':job_id,'source':'store:site-b:available','resource':'JACK','quantity':1,'type':'TOOL_HOLD','actor':actor})
    state.commitments['sla:'+job_id]={'id':'sla:'+job_id,'type':'SLA_WINDOW','job_id':job_id,'state':'ACTIVE','deadline':job['deadline'],'depends_on':[v['id'] for v in state.commitments.values() if v.get('job_id')==job_id]}
    emit(state,'JobAssigned',job['machine_id'],{'job_id':job_id,'technician_id':tech['id']},actor)
    return job

def apply(state, command):
    result=state.clone(); start=len(result.events); cmd=command.model_dump() if hasattr(command,'model_dump') else dict(command); kind=cmd.get('type') or command.__class__.__name__
    if kind in ('Hold','PART_HOLD','TOOL_HOLD'):hold(result,cmd)
    elif kind in ('CreateRequest','RequestCreated'):create_request(result,cmd)
    elif kind=='AssignJob':assign(result,cmd['job_id'],cmd.get('technician_id'),cmd.get('actor','system'))
    elif kind=='Release':release(result,cmd['commitment_id'],cmd.get('actor','system'))
    else:raise DomainError('UNKNOWN_COMMAND','Unknown ledger command',{'type':kind})
    invariants(result)
    return result,result.events[start:]
