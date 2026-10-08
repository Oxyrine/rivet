"""HTTP surface for the versioned service workflow and its lifecycle commands."""
from copy import deepcopy

from fastapi import APIRouter, Depends, Header, Query

from contract import lifecycle as L
from contract.errors import DomainError
from api.app.core.auth import require_roles, scoped_job, scoped_machine
from api.app.core.runtime import store
from api.app.core.views import job_view
from . import commands, engine


router = APIRouter()
read = require_roles()
ops = require_roles('coordinator', 'manager')
admin = require_roles('admin')
stage_actors = require_roles('technician', 'coordinator', 'manager')


def _mutate(fn, body, principal, key=None):
    return store.mutate(fn, key=principal['user_id'] + ':' + key if key else None, body=body)


def _job_for_request(state, ident, principal):
    request = state.requests.get(ident)
    if not request:
        raise DomainError('NOT_FOUND', 'Request not found', status=404)
    scoped_machine(state, request['machine_id'], principal)
    return request


@router.get('/requests')
def requests(tab: str | None = None, state: str | None = None, site: str | None = None, priority: str | None = None, technician: str | None = None, cursor: int = 0, limit: int = Query(default=100, ge=1, le=100), p=Depends(read)):
    """The lifecycle board, ordered by creation and constrained to the caller's sites."""
    snapshot = store.read()
    items = []
    for request in snapshot.requests.values():
        if request.get('machine_id') not in snapshot.machines:
            continue
        if snapshot.machines[request['machine_id']]['site_id'] not in p['sites']:
            continue
        job = snapshot.jobs.get(request.get('job_id'))
        if not job or (state and job.get('state') != state) or (site and job.get('site_id') != site) or (priority and job.get('priority') != priority) or (technician and job.get('technician_id') != technician):
            continue
        groups = {
            'pending': {'created', 'approved'}, 'active': {'assigned', 'in_progress', 'on_hold'},
            'completed': {'completed'}, 'verified': {'verified'}, 'closed': {'closed'},
        }
        if tab in groups and job.get('state') not in groups[tab]:
            continue
        if tab == 'delayed':
            from api.app.modules.exceptions.domain import risk
            risks = {row['job_id']: row for row in risk(snapshot)}
            if risks.get(job['id'], {}).get('tier') != 'critical':
                continue
        items.append({**request, 'state': job.get('state'), 'job': job_view(job, p['role'])})
    items.sort(key=lambda item: (item['job'].get('created_at', ''), item['id']), reverse=True)
    return {'items': items[cursor:cursor + limit], 'next_cursor': cursor + limit if len(items) > cursor + limit else None}


@router.get('/jobs/{ident}/timeline')
def timeline(ident: str, p=Depends(read)):
    snapshot = store.read()
    scoped_job(snapshot, ident, p)
    events = [event for event in snapshot.events if event.get('payload', {}).get('job_id') == ident]
    return {'job_id': ident, 'events': events}


@router.post('/requests/{ident}/reject')
def reject_request(ident: str, body: dict, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        _job_for_request(state, ident, p)
        return commands.reject(state, ident, body, p['user_id'])
    return _mutate(fn, body, p, idempotency_key)


@router.post('/requests/{ident}/cancel')
def cancel_request(ident: str, body: dict, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        _job_for_request(state, ident, p)
        return commands.cancel(state, ident, body, p['user_id'])
    return _mutate(fn, body, p, idempotency_key)


@router.post('/requests/{ident}/reschedule')
def reschedule_request(ident: str, body: dict, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        _job_for_request(state, ident, p)
        return commands.reschedule(state, ident, body, p['user_id'])
    return _mutate(fn, body, p, idempotency_key)


@router.post('/jobs/{ident}/reopen')
def reopen_job(ident: str, body: dict, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        scoped_job(state, ident, p)
        job = commands.reopen(state, ident, body, p['user_id'])
        return {'job_id': job['id'], 'state': job['state'], 'version': job['version']}
    return _mutate(fn, body, p, idempotency_key)


@router.post('/jobs/{ident}/close')
def close_job(ident: str, body: dict = {}, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        scoped_job(state, ident, p)
        return commands.close(state, ident, body, p['user_id'])
    return _mutate(fn, body, p, idempotency_key)


@router.post('/jobs/{ident}/hold')
def hold_job(ident: str, body: dict, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        scoped_job(state, ident, p)
        job = commands.hold(state, ident, body, p['user_id'])
        return {'job_id': job['id'], 'state': job['state'], 'version': job['version']}
    return _mutate(fn, body, p, idempotency_key)


@router.post('/jobs/{ident}/resume')
def resume_job(ident: str, body: dict = {}, p=Depends(ops), idempotency_key: str | None = Header(None)):
    def fn(state):
        scoped_job(state, ident, p)
        return commands.resume(state, ident, body, p['user_id'])
    return _mutate(fn, body, p, idempotency_key)


@router.post('/jobs/{ident}/stages/{stage}/complete')
def complete_stage(ident: str, stage: str, body: dict = {}, p=Depends(stage_actors), idempotency_key: str | None = Header(None)):
    def fn(state):
        scoped_job(state, ident, p)
        return commands.complete_stage(state, ident, stage, body, p['user_id'])
    return _mutate(fn, body, p, idempotency_key)


def _normalise_definition(service_type: str, body: dict, current: dict):
    if service_type not in L.SERVICE_TYPES:
        raise DomainError('UNKNOWN_SERVICE_TYPE', 'Unknown service type', {'service_types': L.SERVICE_TYPES}, status=422)
    proposed = deepcopy(current)
    if 'edges' in body:
        edges = body['edges']
        if not isinstance(edges, dict) or set(edges) != set(L.DEFAULT_EDGES):
            raise DomainError('INVALID_WORKFLOW', 'Edges must include every lifecycle state exactly once', status=422)
        for source, targets in edges.items():
            if not isinstance(targets, list) or source not in L.DEFAULT_EDGES or any(target not in L.DEFAULT_EDGES for target in targets):
                raise DomainError('INVALID_WORKFLOW', 'Workflow edges contain an unknown lifecycle state', status=422)
        proposed['edges'] = {source: list(dict.fromkeys(targets)) for source, targets in edges.items()}
    if 'required_stages' in body:
        stages = body['required_stages']
        if not isinstance(stages, list) or any(not isinstance(stage, str) or not stage.strip() for stage in stages):
            raise DomainError('INVALID_WORKFLOW', 'Required stages must be named', status=422)
        proposed['required_stages'] = list(dict.fromkeys(stage.strip() for stage in stages))
    if 'rules' in body:
        rules = body['rules']
        if not isinstance(rules, dict) or any(key not in L.DEFAULT_RULES for key in rules):
            raise DomainError('INVALID_WORKFLOW', 'Workflow contains an unknown rule', status=422)
        proposed['rules'].update(rules)
    if 'locked' in body and any(body['locked'].get(name) is not True for name in L.LOCKED_RULES):
        raise DomainError('CONFIG_LOCKED', 'The audit, role and ledger protections cannot be disabled', {'locked': L.LOCKED_RULES}, status=422)
    return {key: proposed[key] for key in ('service_type', 'edges', 'required_stages', 'rules', 'locked')}


@router.get('/admin/workflows')
def workflows(p=Depends(admin)):
    snapshot = store.read()
    return {'items': [engine.definition(snapshot, service_type) for service_type in L.SERVICE_TYPES]}


@router.put('/admin/workflows/{service_type}')
def update_workflow(service_type: str, body: dict, p=Depends(admin), idempotency_key: str | None = Header(None)):
    def fn(state):
        current = engine.definition(state, service_type)
        proposed = _normalise_definition(service_type, body, current)
        book = state.metadata.setdefault('workflows', {}).setdefault(service_type, {'current': 1, 'versions': {'1': {key: current[key] for key in proposed}}})
        version = int(book['current']) + 1
        book['versions'][str(version)] = proposed
        book['current'] = version
        from contract.state import emit
        emit(state, 'WorkflowConfigChanged', None, {'service_type': service_type, 'old': current, 'new': proposed, 'version': version}, p['user_id'])
        return {**proposed, 'version': version}
    return _mutate(fn, body, p, idempotency_key)
