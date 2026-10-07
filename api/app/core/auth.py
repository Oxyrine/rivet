import os
from datetime import timedelta
import jwt
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contract.errors import DomainError
from .clock import now
from .runtime import store

bearer = HTTPBearer(auto_error=False)
SECRET = os.getenv('JWT_SECRET', 'local-demo-only-change-before-deployment')
if os.getenv('ENV','demo') not in ('demo','test') and not os.getenv('JWT_SECRET'):
    raise RuntimeError('JWT_SECRET must be configured outside demo/test')

def tokens(principal):
    clock = now()
    def token(kind, minutes):
        return jwt.encode({'sub': principal['user_id'], 'kind': kind, 'iat': clock, 'exp': clock+timedelta(minutes=minutes)}, SECRET, algorithm='HS256')
    return {'access_token': token('access', 15), 'refresh_token': token('refresh', 1440), 'token_type': 'bearer', 'principal': {k:v for k,v in principal.items() if k != 'pin'}}

def require_roles(*roles):
    def dependency(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
        if not credentials: raise DomainError('UNAUTHENTICATED', 'Sign in required', status=401)
        try:
            payload = jwt.decode(credentials.credentials, SECRET, algorithms=['HS256'])
            if payload.get('kind') != 'access': raise ValueError()
            principal = store.read().users[payload['sub']].copy()
        except Exception:
            raise DomainError('UNAUTHENTICATED', 'Token is expired or invalid', status=401)
        if roles and principal['role'] not in roles and principal['role'] != 'admin':
            raise DomainError('FORBIDDEN', 'Role cannot perform this action', status=403)
        return principal
    return dependency

def scoped_machine(state, machine_id, principal):
    machine = state.machines.get(machine_id)
    if principal.get('tenant_id') != state.tenant_id or not machine or machine['site_id'] not in principal.get('sites', []):
        raise DomainError('NOT_FOUND', 'Machine is outside your scope', status=404)
    return machine

def scoped_job(state, job_id, principal):
    job = state.jobs.get(job_id)
    if not job: raise DomainError('NOT_FOUND', 'Job not found', status=404)
    scoped_machine(state, job['machine_id'], principal)
    if principal['role'] == 'technician' and job.get('technician_id') != principal.get('technician_id'):
        raise DomainError('FORBIDDEN', 'Job belongs to another technician', status=403)
    return job
