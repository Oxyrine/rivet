"""Reconciliation and customer acceptance. All mutators run inside Store transactions."""
from datetime import timedelta
from math import ceil
from hashlib import sha256
from contract.canonical import canonical_json
from contract.errors import DomainError
from contract.state import emit
from contract.sla import instant, outcome

def report_hash(report):
    return sha256(canonical_json(report).encode()).hexdigest()

def job_event(s, j, kind, payload, actor):
    return emit(s, kind, j['machine_id'], {'job_id': j['id'], **payload}, actor)

def reconcile(s, job_id):
    j = s.jobs[job_id]; report = j.get('report', {})
    rows = []; unresolved = False
    for part in sorted(set(report.get('parts', {})) | set(j.get('issued_parts', {}))):
        claim = report.get('parts', {}).get(part, 0)
        store_records=[e for e in s.events if e['type']=='StoreIssued' and e['payload'].get('job_id')==job_id and e['payload'].get('resource')==part]
        issued=sum(e['payload']['quantity'] for e in store_records)
        v = s.variances.get(f'{job_id}:{part}', {})
        explained = v.get('approved') and v.get('quantity') == claim-issued
        unconfirmed=not store_records and part in j.get('planned_parts',{}) and not explained
        label = 'Unconfirmed' if unconfirmed else 'Clean' if claim == issued else 'Explained variance' if explained else 'Unexplained'
        unresolved |= label == 'Unexplained'
        rows.append({'check': part, 'planned': j.get('planned_parts', {}).get(part, 0), 'reported': claim, 'corroborated': issued, 'outcome': label, 'strength': 'provider store ledger', 'reason': v.get('reason')})
    missing = sorted(set(s.metadata.get('required_checklist', []))-set(report.get('checklist', [])))
    unresolved |= bool(missing)
    rows.append({'check': 'Mandatory checklist', 'missing': missing, 'outcome': 'Unexplained' if missing else 'Clean', 'strength': 'technician report'})
    required = {'before_photo', 'after_photo'}
    evidence_types=set()
    from api.app.modules.ledger.uploads import data_dir
    for identifier in j.get('evidence',[]):
        evidence=s.evidence.get(identifier,{})
        if evidence.get('job_id')!=job_id or not evidence.get('authentic') or not evidence.get('sha256'):continue
        path=data_dir()/evidence['sha256']
        if path.is_file() and sha256(path.read_bytes()).hexdigest()==evidence['sha256']:
            evidence_types.add(evidence.get('type'))
    missing_photos = sorted(required-evidence_types)
    unresolved |= bool(missing_photos)
    rows.append({'check': 'Photos', 'missing': missing_photos, 'outcome': 'Unexplained' if missing_photos else 'Clean', 'strength': 'technician device'})
    work_start=j.get('started_at') or j.get('check_in_at')
    if work_start and j.get('checkout_at'):
        pauses=[p for p in s.pauses.values() if p.get('job_id')==job_id]
        from contract.sla import running_seconds
        measured=running_seconds(work_start,j['checkout_at'],pauses)//60
        mismatch=abs(report.get('minutes',0)-measured)>15
        unresolved |= mismatch
        rows.append({'check':'Work duration','reported':report.get('minutes'),'corroborated':measured,'outcome':'Unexplained' if mismatch else 'Clean','strength':'server-received work events; device clock flags shown separately'})
    label = 'Unexplained' if unresolved else 'Explained variance' if any(r['outcome']=='Explained variance' for r in rows) else 'Clean'
    result = {'outcome': label, 'rows': rows, 'presence': j.get('presence_strength','strong' if j.get('presence_confirmed') else 'weak; customer confirmation required'), 'fix': j.get('fix_source', 'unconfirmed'),'flags':j.get('flags',[])}
    j['reconciliation'] = result
    return result

def submit_report(s, job_id, payload, actor):
    j = s.jobs[job_id]
    parts = payload.get('parts', {})
    if any(not isinstance(q, int) or isinstance(q, bool) or q<0 for q in parts.values()):
        raise DomainError('INVALID_QUANTITY', 'Part quantities must be nonnegative integers', status=422)
    if not isinstance(payload.get('minutes',60),int) or isinstance(payload.get('minutes',60),bool) or payload.get('minutes',60)<0:
        raise DomainError('INVALID_DURATION','Report duration must be nonnegative integer minutes',status=422)
    report = {'parts': parts, 'checklist': payload.get('checklist', []), 'minutes': payload.get('minutes', 60), 'notes': payload.get('notes', '')}
    j.update(report=report, report_hash=report_hash(report), report_submitted_at=s.now, state='awaiting_acceptance', acceptance='Pending', reminders=[])
    job_event(s,j,'ReportSubmitted',{'report':report,'report_hash':j['report_hash']},actor)
    for commitment in s.commitments.values():
        if commitment.get('job_id')==job_id and commitment.get('type')=='TECH_TIME' and commitment.get('state') in ('HELD','ACTIVE'):
            from api.app.modules.ledger.domain import move
            account=commitment.get('reservation_account',f'job:{job_id}:allocated')
            available=s.balances.get(account+'|TIME',0)
            if available:
                allocated=min(available,commitment['quantity'])
                worked=min(allocated,ceil(max(0,report['minutes'])/15))
                if worked: move(s,account,commitment['source'].rsplit(':',1)[0]+':worked','TIME',worked,actor)
                if allocated>worked: move(s,account,commitment['source'],'TIME',allocated-worked,actor)
            commitment['state']='FULFILLED'
            job_event(s,j,'TechnicianReleased',{'commitment_id':commitment['id']},actor)
    result=reconcile(s,job_id)
    if result['outcome']=='Unexplained':
        j['state']='closure_blocked'
        job_event(s,j,'ClosureBlocked',{'reconciliation':result,'report_hash':j['report_hash']},actor)
    return {'job':j, 'reconciliation':result}

def check_in(s, job_id, payload, actor):
    from api.app.modules.ledger.sync import command
    j=s.jobs[job_id]; principal=s.users[actor]
    if principal.get('role')!='technician': raise DomainError('TECHNICIAN_REQUIRED','Only the assigned technician can check in',status=403)
    command(s,s.devices[principal['device_id']],{'type':'CheckIn','job_id':job_id,'device_ts':s.now,'idempotency_key':f'direct-{len(s.events)}','payload':payload},principal)
    return j

def check_out(s, job_id, payload, actor):
    j=s.jobs[job_id]; j.update(on_site=False,checkout_at=s.now)
    job_event(s,j,'CheckOut',payload,actor)
    if j.get('machine_running_at'): service_restored(s,j,actor)
    return j

def attach_evidence(s,job_id,payload,actor):
    from api.app.modules.ledger.uploads import attach_uploaded
    return attach_uploaded(s,job_id,payload,actor)

def store_issue(s,job_id,payload,principal):
    from api.app.modules.ledger.domain import move
    j=s.jobs.get(job_id)
    if not j or principal.get('tenant_id')!=s.tenant_id: raise DomainError('NOT_FOUND','Job not found',status=404)
    resource=payload.get('resource');quantity=payload.get('quantity',1)
    held=next((c for c in s.commitments.values() if c.get('job_id')==job_id and c.get('resource')==resource and c.get('type')=='PART_HOLD' and c.get('state') in ('HELD','ACTIVE')),None)
    if not held or held.get('physical_location') not in principal.get('sites',[]): raise DomainError('STORE_SCOPE','Part must be reserved from a store in your scope',status=403)
    move(s,f'job:{job_id}:reserved',f'job:{job_id}:issued',resource,quantity,principal['user_id'])
    j.setdefault('issued_parts',{})[resource]=j.get('issued_parts',{}).get(resource,0)+quantity
    job_event(s,j,'StoreIssued',{'resource':resource,'quantity':quantity,'store_site':held['physical_location'],'technician_id':j.get('technician_id')},principal['user_id'])
    return {'job_id':job_id,'resource':resource,'quantity':quantity,'issued_parts':j['issued_parts']}

def service_restored(s,j,actor):
    if j.get('state')=='closed':return  # acceptance seals the outcome; later readings cannot move the clock
    checkout=instant(j['checkout_at']); running=instant(j['machine_running_at'])
    if running<checkout:
        j.pop('restored_at',None);j.pop('sla',None);j['fix_source']='unconfirmed';return
    stop=j['checkout_at'] if running<=checkout+timedelta(minutes=15) else j['machine_running_at']; j['restored_at']=stop
    contract=s.contracts[s.machines[j['machine_id']]['contract_id']]
    pauses=[p for p in s.pauses.values() if p.get('job_id')==j['id']]
    j['sla']=outcome(j['created_at'],stop,contract,pauses)
    job_event(s,j,'ServiceRestored',{'started_at':j['created_at'],'restored_at':stop,'sla':j['sla'],'contract':contract,'pauses':pauses},actor)

def machine_running(s,job_id,source,actor):
    j=s.jobs[job_id]
    if j.get('state')=='closed':return j
    j.update(machine_running_at=s.now,fix_source=source)
    s.machines[j['machine_id']]['status']='Running'
    job_event(s,j,'MachineRunning',{'source':source},actor)
    if j.get('checkout_at'): service_restored(s,j,actor)
    return j

def fix_failed(s,job_id,actor):
    j=s.jobs[job_id];j.update(fix_source='unconfirmed',state='reopened',acceptance='Pending')
    for key in ('machine_running_at','restored_at','sla'):j.pop(key,None)
    s.machines[j['machine_id']]['status']='Fault detected'
    job_event(s,j,'SlaReopened',{'reason':'post-service fault; prior restoration no longer confirms fix'},actor)
    return j

def explain_variance(s,job_id,payload,actor,manager=False):
    j=s.jobs[job_id]; part=payload['part']; quantity=j.get('report',{}).get('parts',{}).get(part,0)-j.get('issued_parts',{}).get(part,0)
    if quantity==0: raise DomainError('NO_VARIANCE','Reported and issued quantities already agree')
    key=f'{job_id}:{part}'
    if s.variances.get(key,{}).get('approved'): return s.variances[key]
    tech=j.get('technician_id'); reason=payload.get('reason'); balance=f'van:{tech}:stock|{part}'
    week=instant(s.now).isocalendar()[:2]
    count=sum(1 for v in s.variances.values() if v.get('technician_id')==tech and v.get('auto') and instant(v['at']).isocalendar()[:2]==week)
    # Van stock enters only through a store issue into the van (no job attached), never a job issue.
    backing=any(e['type']=='StoreIssued' and not e['payload'].get('job_id') and e['payload'].get('technician_id')==tech and e['payload'].get('resource')==part for e in s.events)
    auto=quantity>0 and reason=='Used van stock' and backing and s.balances.get(balance,0)>=quantity and count<3
    if auto:
        from api.app.modules.ledger.domain import move
        move(s,f'van:{tech}:stock',f'job:{job_id}:consumed',part,quantity,actor)
    v={'job_id':job_id,'part':part,'quantity':quantity,'reason':reason,'approved':auto or manager,'auto':auto,'technician_id':tech,'at':s.now,'requires_manager':not(auto or manager)}
    s.variances[key]=v; job_event(s,j,'VarianceExplained',v,actor); reconcile(s,job_id); return v

def accept(s,job_id,payload,principal):
    j=s.jobs[job_id]; u=s.users[principal['user_id']]
    if payload.get('device_id')!=u.get('device_id') or payload.get('pin')!=u.get('pin'):
        raise DomainError('ACCEPTANCE_IDENTITY','Acceptance requires the registered device and supervisor PIN',status=403)
    if payload.get('report_hash')!=j.get('report_hash'): raise DomainError('REPORT_CHANGED','Accept the exact report displayed')
    reconciliation=reconcile(s,job_id)
    if reconciliation['outcome']=='Unexplained' or any(r['outcome']=='Unconfirmed' for r in reconciliation['rows']): raise DomainError('UNRESOLVED_EVIDENCE','Resolve missing evidence and unexplained variances first')
    if not (j.get('presence_confirmed') or j.get('presence_strength') in ('strong','medium')) and not payload.get('confirm_presence'): raise DomainError('CONFIRM_PRESENCE','Weak presence evidence requires customer confirmation')
    confirmed=j.get('restored_at') and j.get('fix_source') in ('simulated telemetry','customer confirmation','plant telemetry')
    j['acceptance']='Verified' if confirmed else 'Accepted, fix not independently confirmed'
    event=job_event(s,j,'AcceptanceRecorded',{'acceptance':j['acceptance'],'report_hash':j['report_hash'],'device_id':payload['device_id']},principal['user_id'])
    receipt={'job_id':job_id,'machine_id':j['machine_id'],'report_hash':j['report_hash'],'machine_seq':event['machine_seq'],'machine_hash':event['machine_hash'],'at':s.now,'acceptance':j['acceptance']}
    s.receipts.append(receipt); j['state']='closed'; return receipt

def alternate_accept(s,job_id,payload,principal):
    j=s.jobs[job_id];mode=payload.get('mode')
    if payload.get('report_hash')!=j.get('report_hash'): raise DomainError('REPORT_CHANGED','Accept the exact report displayed')
    if reconcile(s,job_id)['outcome']=='Unexplained': raise DomainError('UNRESOLVED_EVIDENCE','Resolve mandatory evidence and unexplained variances first')
    if mode=='email':
        if payload.get('otp')!=s.metadata.get('demo_credentials',{}).get('otp'): raise DomainError('INVALID_OTP','Email acceptance OTP is invalid',status=403)
        label='Accepted by email'
    elif mode=='paper':
        evidence=s.evidence.get(payload.get('evidence_id'),{})
        if evidence.get('job_id')!=job_id or evidence.get('type')!='signed_sheet': raise DomainError('SIGNED_SHEET_REQUIRED','Attach a signed job sheet to this job first')
        label='Accepted on paper'
    else: raise DomainError('ACCEPTANCE_MODE','Choose email or paper')
    j.update(acceptance=label,state='closed');job_event(s,j,'AcceptanceRecorded',{'acceptance':label,'report_hash':j['report_hash']},principal['user_id']);return j

def reminders(s):
    changed=[]
    for j in s.jobs.values():
        if j.get('acceptance')!='Pending' or not j.get('report_submitted_at'): continue
        hours=(instant(s.now)-instant(j['report_submitted_at'])).total_seconds()/3600
        sent=j.setdefault('reminders',[])
        for threshold in (12,20):
            if hours>=threshold and threshold not in sent:
                sent.append(threshold); job_event(s,j,'AcceptanceReminder',{'hours':threshold,'channel':'in-app escalation'},'system')
        if hours>=24 and sent==[12,20] and reconcile(s,j['id'])['outcome']!='Unexplained':
            j['acceptance']='Deemed accepted'; j['state']='closed'; job_event(s,j,'AcceptanceDeemed',{'not_verified':True},'system'); changed.append(j['id'])
    return {'deemed':changed}

def dispute(s,job_id,payload,actor):
    j=s.jobs[job_id]; lines=payload.get('lines',[])
    valid=set(j.get('report',{}).get('parts',{}))|{'labour','sla','presence','fix'}
    if not lines or not set(lines)<=valid: raise DomainError('NAMED_LINES_REQUIRED','Name the report or invoice lines being contested')
    if j.get('report_submitted_at') and instant(s.now)>instant(j['report_submitted_at'])+timedelta(days=7): raise DomainError('DISPUTE_WINDOW','The seven-day dispute window has ended')
    j.update(acceptance='Disputed',held_lines=lines,dispute_reason=payload.get('reason',''))
    job_event(s,j,'DisputeOpened',{'lines':lines,'reason':payload.get('reason',''),'holds_whole_invoice':False},actor); return j
