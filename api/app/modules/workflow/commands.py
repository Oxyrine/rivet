"""Lifecycle commands: reject, cancel, reschedule, reopen, close, hold/resume and extra stage gates.
Each runs inside the caller's single store transaction, so a failure anywhere leaves nothing half-done."""
from datetime import timedelta
from contract.errors import DomainError
from contract.sla import instant
from contract import lifecycle as L
from api.app.modules.ledger.domain import move, release
from . import engine

PART_TYPES = {'PART_HOLD', 'TOOL_HOLD'}
TIME_TYPES = {'TECH_TIME', 'TECH_ASSIGN', 'TECHNICIAN_TIME', 'TIME_HOLD'}
LIVE = ('HELD', 'ACTIVE', 'PROPOSED')
REOPEN_WINDOW = timedelta(hours=24)


def _job(s, request_id):
    request = s.requests.get(request_id)
    job = s.jobs.get(request['job_id'] if request else request_id)
    if not job: raise DomainError('NOT_FOUND', 'Request not found', status=404)
    return request or s.requests.get(job.get('request_id')), job


def _reason(body):
    reason = str((body or {}).get('reason') or '').strip()
    if not reason: raise DomainError('REASON_REQUIRED', 'Say why: the reason is kept on the record', status=422)
    return reason


def release_resources(s, job, actor, customer=True):
    """Give back everything this job was holding: parts and tools to their store, technician time to the shift, customer windows."""
    released = []
    for c in list(s.commitments.values()):
        if c.get('job_id') != job['id'] or c.get('state') not in LIVE: continue
        if c.get('type') in PART_TYPES:
            if c['state'] == 'HELD' and s.balances.get(f"job:{job['id']}:reserved|{c['resource']}", 0) >= c['quantity']: release(s, c['id'], actor)
            else: c['state'] = 'FULFILLED'  # the units were already issued or used on site
        elif c.get('type') in TIME_TYPES:
            account = c.get('reservation_account', f"job:{job['id']}:allocated")
            left = min(s.balances.get(account + '|TIME', 0), c.get('quantity', 0))
            if left:
                target = c['source']
                if not s.technicians.get(c.get('owner'), {}).get('available', True): target = f"tech:{c['owner']}:{s.now[:10]}:unavailable"
                move(s, account, target, 'TIME', left, actor)
            c['state'] = 'RELEASED'
        elif customer:
            c['state'] = 'RELEASED'
        else:
            continue
        released.append(c['id'])
    return released


def _settle_machine(s, job):
    """With no other open request on the machine, a withdrawn request no longer holds it in a fault state."""
    if not engine.open_jobs(s, job['machine_id'], job['id']): s.machines[job['machine_id']]['status'] = 'Running'


def _exit(s, request_id, body, actor, to, event):
    request, job = _job(s, request_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    reason = _reason(body)
    engine.transition(s, job, to, actor, event, {'reason': reason, 'request_id': job.get('request_id')}, request)
    released = release_resources(s, job, actor)
    _settle_machine(s, job)
    return {'job_id': job['id'], 'state': job['state'], 'version': job['version'], 'released': released}


def reject(s, request_id, body, actor):
    return _exit(s, request_id, body, actor, 'rejected', 'RequestRejected')


def cancel(s, request_id, body, actor):
    return _exit(s, request_id, body, actor, 'cancelled', 'RequestCancelled')


def reschedule(s, request_id, body, actor):
    request, job = _job(s, request_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    reason = _reason(body)
    engine.transition(s, job, 'approved', actor, 'JobRescheduled', {'reason': reason, 'previous_start': job.get('planned_start'), 'window': (body or {}).get('window')}, request)
    released = release_resources(s, job, actor, customer=False)
    job.update(technician_id=None, requested_window=(body or {}).get('window'))
    job.pop('planned_start', None)
    return {'job_id': job['id'], 'state': job['state'], 'version': job['version'], 'released': released}


def reopen(s, job_id, body, actor, event='JobReopened', check_window=True):
    _, job = _job(s, job_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    if job['state'] not in ('completed', 'verified', 'closed'): raise DomainError('REOPEN_NOT_ALLOWED', 'Only finished work can be reopened')
    if check_window:
        started = job.get('verified_at') or job.get('report_submitted_at')
        if started and instant(s.now) > instant(started) + REOPEN_WINDOW: raise DomainError('REOPEN_WINDOW_CLOSED', 'The contract window for reopening this job has passed')
    reason = (body or {}).get('reason') or 'Reopened'
    job.update(fix_source='unconfirmed', acceptance='Pending', closure_blocked=False)
    for key in ('machine_running_at', 'restored_at', 'sla'): job.pop(key, None)
    s.machines[job['machine_id']]['status'] = 'Fault detected'
    engine.transition(s, job, 'in_progress', actor, event, {'reason': reason})
    return job


def close(s, job_id, body, actor):
    _, job = _job(s, job_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    engine.transition(s, job, 'closed', actor, 'JobClosed', {'invoice_ref': (body or {}).get('invoice_ref')})
    job['closed_at'] = s.now
    return {'job_id': job['id'], 'state': job['state'], 'version': job['version']}


def hold(s, job_id, body, actor, event='JobOnHold'):
    _, job = _job(s, job_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    reason = _reason(body)
    if job['state'] not in ('assigned', 'in_progress'): raise DomainError('HOLD_NOT_ALLOWED', 'Only a job that is assigned or in progress can be put on hold')
    job['held_from'] = job['state']
    engine.transition(s, job, 'on_hold', actor, event, {'reason': reason})
    return job


def resume(s, job_id, body, actor):
    _, job = _job(s, job_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    if job['state'] != 'on_hold': raise DomainError('NOT_ON_HOLD', 'This job is not on hold')
    engine.transition(s, job, job.pop('held_from', 'in_progress'), actor, 'JobResumed', {'note': (body or {}).get('note', '')})
    job.pop('safety_hold', None)
    return {'job_id': job['id'], 'state': job['state'], 'version': job['version']}


def complete_stage(s, job_id, stage, body, actor):
    _, job = _job(s, job_id)
    engine.check_version(job, (body or {}).get('expected_version'))
    gates = engine.job_definition(s, job)['required_stages']
    if stage not in gates: raise DomainError('UNKNOWN_STAGE', 'This workflow has no such stage', {'stages': gates})
    done = job.setdefault('stages_done', [])
    if stage not in done:
        done.append(stage)
        engine.bump(s, job, actor, 'StageCompleted')
        from contract.state import emit
        emit(s, 'StageCompleted', job['machine_id'], {'job_id': job['id'], 'stage': stage, 'job_version': job['version']}, actor)
    return {'job_id': job['id'], 'stages_done': done, 'version': job['version']}


def pending_stages(s, job):
    return [x for x in engine.job_definition(s, job)['required_stages'] if x not in job.get('stages_done', [])]
