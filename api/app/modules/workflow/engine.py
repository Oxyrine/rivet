"""The one place a job changes lifecycle state. Every move is checked against the job's pinned workflow
version, bumps the job's version, and writes an event carrying from_state / to_state."""
from contract.errors import DomainError
from contract.state import emit
from contract import lifecycle as L

SERVICE_DEFAULT = 'repair'


def _book(s):
    return s.metadata.setdefault('workflows', {})


def current_version(s, service_type=SERVICE_DEFAULT):
    return _book(s).get(service_type, {}).get('current', 1)


def definition(s, service_type=SERVICE_DEFAULT, version=None):
    """The workflow as saved for this service type (or the built-in one), at a given version."""
    base = L.default_definition(service_type)
    entry = _book(s).get(service_type)
    if not entry: return {**base, 'version': 1}
    number = str(version or entry['current'])
    saved = entry['versions'].get(number) or entry['versions'][str(entry['current'])]
    return {**base, **saved, 'rules': {**base['rules'], **saved.get('rules', {})}, 'version': int(number)}


def job_definition(s, job):
    return definition(s, job.get('service_type', SERVICE_DEFAULT), job.get('workflow_version'))


def rule(s, key, job=None, service_type=SERVICE_DEFAULT):
    """One tunable number. A value an admin saved wins; otherwise the older metadata setting; otherwise the built-in default."""
    entry = _book(s).get((job or {}).get('service_type', service_type))
    if entry:
        saved = entry['versions'].get(str((job or {}).get('workflow_version') or entry['current'])) or entry['versions'][str(entry['current'])]
        if saved.get('rules', {}).get(key) is not None: return saved['rules'][key]
    legacy = s.metadata.get(key)
    return legacy if legacy is not None else L.DEFAULT_RULES[key]


def pin(s, job):
    """A new job keeps the workflow version it started under, so editing the workflow never moves an open job."""
    job.setdefault('service_type', SERVICE_DEFAULT)
    job['workflow_version'] = current_version(s, job['service_type'])
    job.setdefault('version', 1)


def bump(s, job, actor, change):
    job['version'] = job.get('version', 1) + 1
    job['last_change'] = {'by': actor, 'at': s.now, 'change': change, 'version': job['version']}


def check_version(job, expected):
    """Optimistic concurrency: a stale client is told who changed the job, not just that it lost."""
    if expected is None or expected == job.get('version', 1): return
    last = job.get('last_change') or {}
    who = last.get('by', 'someone else')
    raise DomainError('VERSION_CONFLICT', f"{who} changed this job ({last.get('change', 'update')}) at {last.get('at', 'an earlier time')}. Review the latest and try again.",
                      {'current_version': job.get('version', 1), 'expected_version': expected, 'changed_by': last.get('by'), 'changed_at': last.get('at'), 'change': last.get('change')})


def transition(s, job, to, actor, event_type, details=None, request=None):
    frm = job.get('state')
    allowed = job_definition(s, job)['edges'].get(frm, [])
    if to not in allowed:
        raise DomainError('ILLEGAL_TRANSITION', f"A job cannot go from {L.LABELS.get(frm, frm)} to {L.LABELS.get(to, to)}",
                          {'from_state': frm, 'to_state': to, 'allowed': allowed})
    job['state'] = to
    if request is not None and to in ('approved', 'rejected', 'cancelled'): request['state'] = to
    bump(s, job, actor, event_type)
    return emit(s, event_type, job['machine_id'], {'job_id': job['id'], 'from_state': frm, 'to_state': to, 'workflow_version': job.get('workflow_version', 1),
                                                   'job_version': job['version'], **(details or {})}, actor)


def open_jobs(s, machine_id, except_id=None):
    return [j for j in s.jobs.values() if j['machine_id'] == machine_id and j['id'] != except_id and j.get('request_id') and j.get('state') not in L.DONE]
