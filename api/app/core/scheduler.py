"""One idempotent tick, shared by the background loop and deterministic demo clock."""
from datetime import timedelta,datetime
from .clock import now
from contract.state import emit

def tick(state):
    from api.app.modules.ledger.domain import release
    changed=[]
    for ident,item in list(state.commitments.items()):
        if not item.get('expires_at') or item['state']!='HELD' or item['type'] not in ('PART_HOLD','TOOL_HOLD'):continue
        if datetime.fromisoformat(item['expires_at'])>now(state):continue
        # A store issue/field scan may have already moved the reserved units.
        available=state.balances.get(f"job:{item['job_id']}:reserved|{item['resource']}",0)
        if available>=item['quantity']:
            release(state,ident,'expiry-worker');changed.append(ident)
        else:
            item['state']='FULFILLED'
            emit(state,'ReservationConsumed',state.jobs[item['job_id']]['machine_id'],{'commitment_id':ident},'expiry-worker')
    for pause in state.pauses.values():
        if pause.get('state') in ('confirmed','contested'):continue
        start=pause.get('start') or pause.get('started_at')
        if not start:continue
        elapsed=(now(state)-datetime.fromisoformat(start)).total_seconds()/3600
        sent=pause.setdefault('reminders',[])
        for hour in (12,20):
            if elapsed>=hour and hour not in sent:
                sent.append(hour)
                emit(state,'PauseConfirmationReminder',state.jobs[pause['job_id']]['machine_id'],{'pause_id':pause['id'],'hours':hour},'reminder-worker')
    from api.app.modules.proof.service import reminders
    result=reminders(state)
    late=set()
    for job in state.jobs.values():
        if job.get('state')!='assigned' or job.get('check_in_at') or not job.get('planned_start'):continue
        if now(state)>datetime.fromisoformat(job['planned_start'])+timedelta(minutes=20):
            technician_id=job.get('technician_id')
            if technician_id and state.technicians[technician_id].get('available'):late.add(technician_id)
    from api.app.modules.exceptions.domain import dropout
    for technician_id in sorted(late):
        updated,events,outcome=dropout(state,technician_id,reason='Missed check-in after 20-minute grace',actor='checkin-worker')
        state.__dict__.update(updated.__dict__)
        changed.append(outcome.get('breach_id'))
    return {'expired_holds':changed,'deemed':result.get('deemed',[]),'missed_checkin_technicians':sorted(late)}
