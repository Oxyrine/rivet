from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from api.app.core.runtime import store
from api.app.core.security import require_roles, scoped_job
from contract.errors import DomainError
from .domain import impact, recovery, dropout, approve_plan, risk, fingerprint

router = APIRouter(tags=['exceptions'])
READ = ('coordinator', 'manager', 'admin', 'auditor')
WRITE = ('coordinator', 'manager', 'admin')

class DropoutBody(BaseModel):
    reason: str = 'Technician reported unavailable'
    job_id: str | None = None

def scoped_impact(state, technician_id, principal):
    result = impact(state, technician_id)
    for jid in result['affected_jobs']: scoped_job(state, jid, principal)
    return result

def commit(state, result):
    new, events, response = result
    state.__dict__.update(new.__dict__)
    return response

@router.get('/exceptions/impact/{technician_id}')
def get_impact(technician_id: str, principal=Depends(require_roles(*READ))):
    return scoped_impact(store.read(), technician_id, principal)

@router.get('/exceptions/plans/{technician_id}')
def get_plans(technician_id: str, principal=Depends(require_roles(*READ))):
    state = store.read(); scoped_impact(state, technician_id, principal)
    return recovery(state, technician_id)

@router.get('/exceptions/risk')
def get_risk(principal=Depends(require_roles(*READ))):
    state = store.read()
    return [r for r in risk(state) if r['site_id'] in principal.get('sites', [])]

@router.post('/exceptions/dropout/{technician_id}')
@router.post('/technicians/{technician_id}/dropout')
def post_dropout(technician_id: str, body: DropoutBody, principal=Depends(require_roles(*WRITE)), idempotency_key: str | None=Header(default=None)):
    def execute(state):
        scoped_impact(state, technician_id, principal)
        return commit(state, dropout(state, technician_id, body.reason, principal['user_id']))
    return store.mutate(execute, key=principal['user_id']+':'+idempotency_key if idempotency_key else None, body={'technician_id': technician_id, **body.model_dump()})

@router.post('/exceptions/plans/{plan_id}/approve')
@router.post('/plans/{plan_id}/approve')
def post_approval(plan_id: str, principal=Depends(require_roles(*WRITE)), idempotency_key: str | None=Header(default=None)):
    def execute(state):
        plan = state.plans.get(plan_id)
        if not plan: raise DomainError('PLAN_NOT_FOUND', 'Refresh the recovery plans', status=404)
        for a in plan['assignments']: scoped_job(state, a['job_id'], principal)
        return commit(state, approve_plan(state, plan_id, principal['role'], principal['user_id']))
    return store.mutate(execute, key=principal['user_id']+':'+idempotency_key if idempotency_key else None, body={'plan_id': plan_id})

@router.post('/exceptions/plans/{technician_id}/refresh')
def refresh_plans(technician_id: str, principal=Depends(require_roles(*WRITE))):
    def execute(state):
        scoped_impact(state, technician_id, principal)
        result = recovery(state, technician_id)
        for p in result['plans'] + result['partial_plans']: state.plans[p['id']] = p
        return result
    return store.mutate(execute)

@router.get('/breaches/{breach_id}/impact')
def breach_impact(breach_id: str, principal=Depends(require_roles(*READ))):
    state = store.read(); breach = state.breaches.get(breach_id)
    if not breach: raise DomainError('NOT_FOUND', 'Breach does not exist', status=404)
    return scoped_impact(state, breach['technician_id'], principal)

@router.get('/breaches/{breach_id}/plans')
def breach_plans(breach_id: str, principal=Depends(require_roles(*READ))):
    state = store.read(); breach = state.breaches.get(breach_id)
    if not breach: raise DomainError('NOT_FOUND', 'Breach does not exist', status=404)
    scoped_impact(state, breach['technician_id'], principal)
    result = recovery(state, breach['technician_id'])
    def execute(current):
        if fingerprint(current) != fingerprint(state): raise DomainError('STALE_PLAN', 'Reservations changed while plans were computed')
        for plan in result['plans'] + result['partial_plans']: current.plans[plan['id']] = plan
        return result
    return store.mutate(execute)

@router.get('/jobs/{job_id}/risk')
def job_risk(job_id: str, principal=Depends(require_roles())):
    state = store.read(); scoped_job(state, job_id, principal)
    return next((r for r in risk(state) if r['job_id'] == job_id), {'job_id': job_id, 'score': 0, 'signals': []})
