"""Hosted sign-in: Supabase issues the OTP login, the API verifies the token and maps it to a Rivet user."""
import time
from uuid import uuid4
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from api.app.main import app
from api.app.core import auth
from api.app.core.runtime import store

URL = 'https://proj.supabase.co'
SIGNING = ec.generate_private_key(ec.SECP256R1())
OTHER = ec.generate_private_key(ec.SECP256R1())


class FakeJwks:
    def get_signing_key_from_jwt(self, token):
        return type('Key', (), {'key': SIGNING.public_key()})()


def supabase_token(email, key=SIGNING, **override):
    now = int(time.time())
    claims = {'sub': str(uuid4()), 'aud': 'authenticated', 'iss': URL + '/auth/v1', 'exp': now + 3600, 'iat': now, 'role': 'authenticated', 'email': email, **override}
    return jwt.encode(claims, key, algorithm='ES256', headers={'kid': 'test'})


def bearer(token, **extra):
    return {'Authorization': 'Bearer ' + token, **extra}


def link(user_id, **fields):
    store.mutate(lambda s: s.users[user_id].update(fields))


@pytest.fixture
def hosted(monkeypatch):
    monkeypatch.setenv('ENV', 'production')
    monkeypatch.setenv('SUPABASE_URL', URL)
    monkeypatch.delenv('BOOTSTRAP_ADMIN_EMAIL', raising=False)
    monkeypatch.setattr(auth, 'jwks_client', lambda: FakeJwks())
    store.reset()
    with TestClient(app) as client:
        yield client


def test_a_linked_email_signs_in_with_its_rivet_role(hosted):
    link('coordinator', email='ops@example.com')
    me = hosted.get('/auth/me', headers=bearer(supabase_token('Ops@Example.com')))
    assert me.status_code == 200 and me.json()['role'] == 'coordinator' and 'pin' not in me.json()
    assert hosted.get('/dashboard/summary', headers=bearer(supabase_token('ops@example.com'))).status_code == 200


def test_an_unlinked_account_is_signed_in_to_supabase_but_not_to_rivet(hosted):
    response = hosted.get('/auth/me', headers=bearer(supabase_token('stranger@example.com')))
    assert response.status_code == 403 and response.json()['code'] == 'NOT_PROVISIONED'


@pytest.mark.parametrize('override', [{'exp': int(time.time()) - 60}, {'aud': 'anon'}, {'iss': 'https://evil.example/auth/v1'}])
def test_expired_or_misdirected_tokens_are_rejected(hosted, override):
    link('coordinator', email='ops@example.com')
    assert hosted.get('/auth/me', headers=bearer(supabase_token('ops@example.com', **override))).status_code == 401


def test_a_token_signed_by_another_key_is_rejected(hosted):
    link('coordinator', email='ops@example.com')
    assert hosted.get('/auth/me', headers=bearer(supabase_token('ops@example.com', key=OTHER))).status_code == 401


def test_demo_tokens_do_not_work_in_production(hosted):
    demo = auth.tokens(store.read().users['coordinator'])['access_token']
    assert hosted.get('/auth/me', headers=bearer(demo)).status_code == 401
    assert hosted.post('/auth/token', json={'user_id': 'coordinator', 'otp': '246810'}).status_code == 503


def test_the_bootstrap_administrator_can_link_everyone_else(hosted, monkeypatch):
    monkeypatch.setenv('BOOTSTRAP_ADMIN_EMAIL', 'boss@example.com')
    boss = bearer(supabase_token('boss@example.com'))
    assert hosted.get('/auth/me', headers=boss).json()['role'] == 'admin'
    assert hosted.post('/admin/users/coordinator/link', json={'email': 'Ops@Example.com'}, headers=boss).status_code == 200
    assert hosted.get('/auth/me', headers=bearer(supabase_token('ops@example.com'))).json()['role'] == 'coordinator'
    # one email maps to one Rivet user, and a coordinator cannot hand out access
    assert hosted.post('/admin/users/manager/link', json={'email': 'ops@example.com'}, headers=boss).status_code == 409
    ops = bearer(supabase_token('ops@example.com'))
    assert hosted.post('/admin/users/manager/link', json={'email': 'm@example.com'}, headers=ops).status_code == 403
    assert hosted.post('/admin/users/nobody/link', json={'email': 'x@example.com'}, headers=boss).status_code == 404


def test_the_audit_trail_records_a_link_without_the_email_address(hosted, monkeypatch):
    monkeypatch.setenv('BOOTSTRAP_ADMIN_EMAIL', 'boss@example.com')
    hosted.post('/admin/users/coordinator/link', json={'email': 'ops@example.com'}, headers=bearer(supabase_token('boss@example.com')))
    event = next(e for e in reversed(store.read().events) if e['type'] == 'UserLinked')
    assert event['payload']['user_id'] == 'coordinator' and 'ops@example.com' not in str(event)


def test_retried_commands_are_idempotent_for_supabase_users(hosted):
    link('coordinator', email='ops@example.com')
    headers = bearer(supabase_token('ops@example.com'), **{'Idempotency-Key': 'retry-1'})
    first = hosted.post('/requests', json={'machine_id': 'M-104'}, headers=headers)
    second = hosted.post('/requests', json={'machine_id': 'M-104'}, headers=headers)
    assert first.status_code == 200 and second.json() == first.json() and 'duplicate' not in second.json()
