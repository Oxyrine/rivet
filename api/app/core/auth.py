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

def hosted():
    """Demo and test runs sign their own tokens; anything else trusts only Supabase."""
    return os.getenv('ENV','demo') not in ('demo','test')

def tokens(principal):
    clock = now()
    def token(kind, minutes):
        return jwt.encode({'sub': principal['user_id'], 'kind': kind, 'iat': clock, 'exp': clock+timedelta(minutes=minutes)}, SECRET, algorithm='HS256')
    return {'access_token': token('access', 15), 'refresh_token': token('refresh', 1440), 'token_type': 'bearer', 'principal': {k:v for k,v in principal.items() if k != 'pin'}}

_jwks = None
def jwks_client():
    """Supabase publishes its signing keys; nothing secret is needed to verify a login."""
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(os.environ['SUPABASE_URL'].rstrip('/') + '/auth/v1/.well-known/jwks.json', cache_keys=True, lifespan=3600)
    return _jwks

def unauthenticated(message='Token is expired or invalid'):
    return DomainError('UNAUTHENTICATED', message, status=401)

def supabase_claims(token):
    base = os.environ['SUPABASE_URL'].rstrip('/') + '/auth/v1'
    try:
        key = jwks_client().get_signing_key_from_jwt(token).key
        # Only asymmetric algorithms: a token signed with a shared secret is never accepted here.
        return jwt.decode(token, key, algorithms=['ES256', 'RS256'], audience='authenticated', issuer=base)
    except Exception:
        raise unauthenticated()

def supabase_user(claims):
    email = (claims.get('email') or '').strip().lower()
    phone = claims.get('phone') or ''
    state = store.read()
    user = next((u for u in state.users.values() if (email and (u.get('email') or '').lower() == email) or (phone and u.get('phone') == phone)), None)
    if not user and email and email == os.getenv('BOOTSTRAP_ADMIN_EMAIL', '').strip().lower():
        user = state.users.get('admin')  # the first administrator, so a new deployment cannot lock itself out
    if not user:
        raise DomainError('NOT_PROVISIONED', 'This account has not been given access yet. Ask an administrator to link it.', status=403)
    return user.copy()

def identify(token):
    """The single place a bearer token becomes a Rivet user (HTTP, websocket and idempotency all use it)."""
    if hosted():
        return supabase_user(supabase_claims(token))
    try:
        payload = jwt.decode(token, SECRET, algorithms=['HS256'])
        if payload.get('kind') != 'access': raise ValueError()
        return store.read().users[payload['sub']].copy()
    except Exception:
        raise unauthenticated()

def require_roles(*roles):
    def dependency(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
        if not credentials: raise DomainError('UNAUTHENTICATED', 'Sign in required', status=401)
        principal = identify(credentials.credentials)
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
