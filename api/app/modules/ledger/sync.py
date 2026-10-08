import base64
from math import radians,sin,cos,atan2,sqrt
from datetime import datetime
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from contract.state import emit
from contract.errors import DomainError
from api.app.core.clock import now
from api.app.modules.workflow import engine, commands

def presence(state, job, payload):
    site=job['site_id'];key=state.metadata.get('gate_keys',{}).get(site)
    code=payload.get('arrival_code')
    valid=False
    if code and key:
        try:
            window=int(code['window']);current=int(now(state).timestamp())//30
            if window not in (current,current-1): raise ValueError('Code expired')
            Ed25519PublicKey.from_public_bytes(base64.b64decode(key)).verify(base64.b64decode(code['signature']),f'{site}|{window}'.encode())
            valid=True
        except Exception: raise DomainError('ARRIVAL_CODE_EXPIRED','Arrival code is invalid or expired')
    gps_payload=payload.get('gps') if isinstance(payload.get('gps'),dict) else payload
    lat=gps_payload.get('lat_e6');lng=gps_payload.get('lng_e6');gps=False
    if isinstance(lat,int) and isinstance(lng,int) and not isinstance(lat,bool) and not isinstance(lng,bool):
        point=state.sites[site];a1=radians(lat/1000000);a2=radians(point['lat_e6']/1000000);delta=radians((lng-point['lng_e6'])/1000000)
        h=sin((a1-a2)/2)**2+cos(a1)*cos(a2)*sin(delta/2)**2
        distance=6371000*2*atan2(sqrt(h),sqrt(max(0,1-h)))
        gps=distance<=500
        job['gps_distance_metres']=round(distance)
    return 'strong' if valid and gps else 'medium' if payload.get('machine_qr') and gps else 'weak'

def command(state, device, cmd, principal):
    job=state.jobs.get(cmd['job_id']);payload=cmd.get('payload',{});kind=cmd['type'];actor=principal['user_id']
    if not job or job['site_id'] not in principal['sites']:raise DomainError('NOT_FOUND','Job outside your scope',status=404)
    if job.get('technician_id')!=principal.get('technician_id'):
        # Only a technician the job moved away from may leave facts, and they stay pending evidence:
        # they never change the job's own tasks, checklist, parts or status.
        if principal.get('technician_id') not in job.get('reassigned_from',[]):raise DomainError('NOT_FOUND','Job outside your scope',status=404)
        if payload:
            saved={'id':'pending-'+cmd['idempotency_key'],'job_id':job['id'],'payload':payload,'actor':actor,'pending':True}
            state.evidence[saved['id']]=saved;job['evidence'].append(saved['id'])
        raise DomainError('JOB_REASSIGNED','This job moved to another technician. Your evidence is attached.',{'technician_id':job.get('technician_id'),'evidence_count':len(job['evidence'])})
    if job['state'] in ('cancelled','rejected'):raise DomainError('JOB_CANCELLED','Job has been cancelled')
    try:
        captured=datetime.fromisoformat(cmd['device_ts'].replace('Z','+00:00'))
        if captured.tzinfo is None: raise ValueError()
    except ValueError:raise DomainError('DEVICE_TIME_INVALID','Device timestamp requires timezone')
    if abs((now(state)-captured).total_seconds())>300:
        job.setdefault('flags',[]).append('DEVICE_CLOCK_SKEW')
    if kind=='CheckIn':
        strength=presence(state,job,payload);job['presence_strength']=strength;job['presence_confirmed']=strength=='strong';job['on_site']=True;job['check_in_at']=state.now
        pending=[c for c in state.commitments.values() if c.get('job_id')==job['id'] and c['type']=='PERMIT_TO_WORK' and c['state']!='FULFILLED']
        if pending and strength=='strong':
            pause_id='pause:'+job['id'];state.pauses[pause_id]={'id':pause_id,'job_id':job['id'],'start':state.now,'started_at':state.now,'end':None,'ended_at':None,'state':'provisional','reason':'PERMIT_PENDING','confirmed':False}
            emit(state,'SlaPaused',job['machine_id'],state.pauses[pause_id],actor)
        emit(state,'CheckInRecorded',job['machine_id'],{'job_id':job['id'],'presence_strength':strength},actor)
    elif kind=='StartWork':
        if any(c['type']=='PERMIT_TO_WORK' and c.get('job_id')==job['id'] and c['state']!='FULFILLED' for c in state.commitments.values()):raise DomainError('PERMIT_PENDING','Permit to work has not been issued')
        if not job['on_site']:raise DomainError('CHECKIN_REQUIRED','Check in before starting work')
        waiting=commands.pending_stages(state,job)
        if waiting:raise DomainError('STAGE_PENDING','Complete the required stage first: '+', '.join(waiting),{'stages':waiting})
        engine.transition(state,job,'in_progress',actor,'WorkStarted');job['started_at']=state.now;state.machines[job['machine_id']]['status']='Under repair'
    elif kind=='PartScanned':
        from .domain import move
        resource=payload.get('resource') or payload.get('part_id');qty=payload.get('quantity',1)
        if not resource:raise DomainError('PART_REQUIRED','Provide a resource barcode')
        source=payload.get('source',f"job:{job['id']}:issued")
        if source==f"job:{job['id']}:issued" and not state.balances.get(source+'|'+resource,0):
            source=f"job:{job['id']}:reserved"
        if source.startswith('van:') and source!=f"van:{principal['technician_id']}:stock":raise DomainError('FORBIDDEN','Van belongs to another technician')
        allowed=(f"job:{job['id']}:issued",f"job:{job['id']}:reserved",f"van:{principal['technician_id']}:stock")
        if source not in allowed:raise DomainError('PART_CONFLICT','Part is not reserved to this job')
        move(state,source,f"job:{job['id']}:consumed",resource,qty,actor)
        job.setdefault('scanned_parts',{})[resource]=job.setdefault('scanned_parts',{}).get(resource,0)+qty
        if source==f"job:{job['id']}:reserved":
            job.setdefault('store_unconfirmed_parts',[]).append(resource)
        emit(state,'PartScanned',job['machine_id'],{'job_id':job['id'],'resource':resource,'quantity':qty,'source':source},actor)
    elif kind in ('EvidenceAttached','TaskLogged','ReadingRecorded'):
        if kind=='EvidenceAttached':
            from .uploads import attach_uploaded
            return attach_uploaded(state,job['id'],{**payload,'captured_at':cmd['device_ts']},actor)
        elif kind=='TaskLogged':job['tasks'].append({'at':state.now,**payload});job['checklist']=list(dict.fromkeys(job['checklist']+payload.get('checklist',[])))
        else:job.setdefault('readings',[]).append(payload)
        emit(state,kind,job['machine_id'],{'job_id':job['id'],**payload},actor)
    elif kind in ('SubmitReport','CheckOut'):
        from api.app.modules.proof import service
        if kind=='SubmitReport': return service.submit_report(state,job['id'],payload,actor)
        return service.check_out(state,job['id'],payload,actor)
    elif kind=='ReportDropout':
        from api.app.modules.exceptions.domain import dropout
        updated,events,result=dropout(state,principal['technician_id'],actor=actor)
        state.__dict__.update(updated.__dict__)
        return result
    elif kind=='IssueReported':
        from api.app.modules.exceptions.domain import report_issue
        return report_issue(state, job['id'], payload, actor)
    elif kind=='SiteAccessRefused':
        job.setdefault('flags',[]).append('ACCESS_REFUSED');emit(state,'SiteAccessRefused',job['machine_id'],{'job_id':job['id'],**payload},actor)
    else:raise DomainError('UNKNOWN_COMMAND','Unknown field action',{'type':kind})
    return {'job_id':job['id'],'state':job['state']}

def replay(state, device_id, commands, principal, rebase=False):
    device=state.devices[device_id];results=[];pending=device.setdefault('pending',{});history=device.setdefault('results',{});fingerprints=device.setdefault('fingerprints',{})
    lowest=min((c['device_seq'] for c in commands),default=0)
    # After a data reset the server has no history for this device while the phone's numbering carries on. Only a device the server has
    # never accepted anything from may be re-based, so a real gap in a live sequence is still held.
    if rebase and not history and lowest>device['last_seq']+1:device['last_seq']=lowest-1
    from contract.canonical import canonical_json
    for cmd in commands:
        key=cmd['idempotency_key'];encoded=canonical_json(cmd)
        if key in fingerprints and fingerprints[key]!=encoded:raise DomainError('IDEMPOTENCY_CONFLICT','Command key was reused with different content')
        if key in history:results.append({'idempotency_key':key,'status':'duplicate','original':history[key]});continue
        seq=cmd['device_seq']
        if seq<=device['last_seq']:results.append({'idempotency_key':key,'status':'rejected','code':'SEQUENCE_REUSED'});continue
        existing=pending.get(str(seq))
        if existing and existing['idempotency_key']!=key:raise DomainError('SEQUENCE_REUSED','Sequence already has a different command')
        pending[str(seq)]=cmd;fingerprints[key]=encoded
    count=0
    while str(device['last_seq']+1) in pending and count<10:
        seq=device['last_seq']+1;cmd=pending.pop(str(seq));key=cmd['idempotency_key']
        try:outcome={'idempotency_key':key,'status':'accepted','result':command(state,device,cmd,principal)}
        except DomainError as exc:outcome={'idempotency_key':key,'status':'rejected',**exc.as_dict()}
        history[key]=outcome;device['last_seq']=seq;results.append(outcome);count+=1
    keys={r['idempotency_key'] for r in results}
    contiguous=str(device['last_seq']+1) in pending  # the next command is here: leftovers only wait for the per-request rate limit
    for cmd in commands:
        if cmd['idempotency_key'] not in keys:results.append({'idempotency_key':cmd['idempotency_key'],'status':'deferred' if contiguous else 'held_gap','expected_seq':device['last_seq']+1})
    device['last_sync']=state.now
    return {'results':results,'last_seq':device['last_seq'],'sequence_gaps':0 if contiguous else len(pending)}
