"""Seeded demo sign-ins on a hosted server: created through Supabase's admin API, shown once, removable."""
import json
import httpx
import pytest
from api.app.core.runtime import store
from api.app.modules.ledger import demo_accounts
from tests.test_supabase_auth import hosted, supabase_token, bearer, link  # noqa: F401  (hosted is a fixture)

BOSS = 'boss@example.com'


class FakeSupabase:
    """Just enough of the GoTrue admin API: create, list, update password, delete."""

    def __init__(self, reject=()):
        self.users, self.reject, self.calls = {}, set(reject), []
        self.client = httpx.Client(transport=httpx.MockTransport(self.handle))

    def handle(self, request):
        self.calls.append((request.method, request.url.path, request.headers.get('authorization')))
        if request.url.path.endswith('/generate_link'):
            email = json.loads(request.content)['email']
            if not any(u['email'] == email for u in self.users.values()):
                return httpx.Response(404, json={'msg': 'User not found'})
            return httpx.Response(200, json={'hashed_token': 'hash-for-' + email, 'verification_type': 'magiclink', 'email': email})
        path = request.url.path.removeprefix('/auth/v1/admin/users')
        if request.method == 'POST':
            body = json.loads(request.content)
            if body['email'] in self.reject:
                return httpx.Response(400, json={'msg': 'Signups blocked for this address'})
            if any(u['email'] == body['email'] for u in self.users.values()):
                return httpx.Response(422, json={'code': 'email_exists', 'msg': 'A user with this email address has already been registered'})
            ident = f'id-{len(self.users) + 1}'
            self.users[ident] = {'id': ident, 'email': body['email'], 'password': body['password']}
            return httpx.Response(200, json=self.users[ident])
        if request.method == 'GET':
            return httpx.Response(200, json={'users': [{'id': u['id'], 'email': u['email']} for u in self.users.values()]})
        ident = path.lstrip('/')
        if request.method == 'PUT':
            self.users[ident]['password'] = json.loads(request.content)['password']
            return httpx.Response(200, json={'id': ident})
        if request.method == 'DELETE':
            self.users.pop(ident, None)
            return httpx.Response(200, json={})
        return httpx.Response(405)


@pytest.fixture
def admin(hosted, monkeypatch):
    monkeypatch.setenv('BOOTSTRAP_ADMIN_EMAIL', BOSS)
    monkeypatch.setenv('DEMO_CONTROLS', '1')
    monkeypatch.setenv('SUPABASE_SERVICE_KEY', 'service-key-for-tests')
    # reset keeps email links on purpose, so start each test with nobody linked
    store.mutate(lambda s: [u.pop('email', None) for u in s.users.values()])
    yield bearer(supabase_token(BOSS))
    store.mutate(lambda s: [u.pop('email', None) for u in s.users.values()])  # leave no links for later tests


@pytest.fixture
def supabase(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(demo_accounts, 'admin_client', lambda: fake.client)
    return fake


def create(client, admin, **body):
    return client.post('/admin/demo-accounts', json=body, headers=admin)


def test_each_demo_role_gets_a_sign_in_linked_to_its_rivet_user(hosted, admin, supabase):
    response = create(hosted, admin)
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
    accounts = {a['user_id']: a for a in response.json()['accounts']}
    assert set(accounts) == set(demo_accounts.DEMO_USERS)
    assert accounts['ravi']['role'] == 'technician' and accounts['coordinator']['role'] == 'coordinator'
    assert accounts['ravi']['email'] == 'boss+rivet-ravi@example.com'
    assert all(len(a['password']) >= 12 for a in accounts.values()) and len({a['password'] for a in accounts.values()}) == len(accounts)
    assert store.read().users['ravi']['email'] == accounts['ravi']['email']
    # The service key authenticates the calls and is never part of the response
    assert all(call[2] == 'Bearer service-key-for-tests' for call in supabase.calls)
    assert 'service-key-for-tests' not in response.text


def test_a_created_account_signs_in_with_the_role_of_its_user(hosted, admin, supabase):
    accounts = {a['user_id']: a for a in create(hosted, admin).json()['accounts']}
    me = hosted.get('/auth/me', headers=bearer(supabase_token(accounts['priya']['email'])))
    assert me.status_code == 200 and me.json()['role'] == 'technician' and me.json()['technician_id'] == 'priya'


def test_passwords_are_returned_once_and_never_stored(hosted, admin, supabase):
    accounts = create(hosted, admin).json()['accounts']
    stored = json.dumps(store.read().to_dict(), default=str)
    with store.engine.connect() as conn:
        rows = conn.exec_driver_sql('SELECT * FROM idempotency').fetchall()
    dump = stored + json.dumps([list(map(str, r)) for r in rows])
    assert not any(a['password'] in dump for a in accounts)
    assert 'password' not in json.dumps(hosted.get('/admin/users', headers=admin).json())


def test_running_it_again_gives_every_account_a_fresh_password(hosted, admin, supabase):
    first = {a['user_id']: a['password'] for a in create(hosted, admin).json()['accounts']}
    second = {a['user_id']: a['password'] for a in create(hosted, admin).json()['accounts']}
    assert set(first) == set(second) and all(first[u] != second[u] for u in first)
    assert len(supabase.users) == len(first)  # updated in place, not duplicated


def test_one_refused_account_does_not_hide_the_others(hosted, admin, monkeypatch):
    fake = FakeSupabase(reject={'boss+rivet-auditor@example.com'})
    monkeypatch.setattr(demo_accounts, 'admin_client', lambda: fake.client)
    accounts = {a['user_id']: a for a in create(hosted, admin).json()['accounts']}
    assert 'password' not in accounts['auditor'] and 'Signups blocked' in accounts['auditor']['error']
    assert accounts['ravi']['password']
    users = store.read().users
    assert users['ravi']['email'] and not users['auditor'].get('email')


def test_a_different_inbox_can_be_chosen(hosted, admin, supabase):
    accounts = create(hosted, admin, base_email='Ops+old@Example.org').json()['accounts']
    assert accounts[0]['email'].endswith('@example.org') and '+rivet-' in accounts[0]['email'] and '+old' not in accounts[0]['email']


def test_only_an_admin_on_a_server_with_demo_controls_may_create_accounts(hosted, admin, supabase, monkeypatch):
    link('coordinator', email='ops@example.com')
    assert create(hosted, bearer(supabase_token('ops@example.com'))).status_code == 403
    monkeypatch.delenv('DEMO_CONTROLS')
    off = create(hosted, admin)
    assert off.status_code == 403 and supabase.calls == []


def test_a_local_demo_server_needs_no_accounts(monkeypatch, supabase):
    from fastapi.testclient import TestClient
    from api.app.main import app
    monkeypatch.setenv('ENV', 'demo')
    store.reset()
    with TestClient(app) as local:
        token = local.post('/auth/token', json={'user_id': 'admin', 'otp': '246810'}).json()['access_token']
        assert local.post('/admin/demo-accounts', json={}, headers=bearer(token)).status_code == 409


def test_it_refuses_without_the_service_key(hosted, admin, supabase, monkeypatch):
    monkeypatch.delenv('SUPABASE_SERVICE_KEY')
    response = create(hosted, admin)
    assert response.status_code == 409 and response.json()['code'] == 'NOT_CONFIGURED'


def test_a_real_persons_link_is_never_replaced_by_a_demo_account(hosted, admin, supabase):
    link('coordinator', email='ops@example.com')
    response = create(hosted, admin).json()
    assert response['skipped'] == ['coordinator'] and 'coordinator' not in {a['user_id'] for a in response['accounts']}
    assert store.read().users['coordinator']['email'] == 'ops@example.com'


def test_removing_the_demo_accounts_deletes_them_and_unlinks_their_users(hosted, admin, supabase):
    link('coordinator', email='ops@example.com')  # a real person's link must survive
    created = create(hosted, admin).json()['accounts']
    assert len(supabase.users) == len(created)
    removed = hosted.delete('/admin/demo-accounts', headers=admin).json()
    assert set(removed['removed']) == {a['user_id'] for a in created} and removed['kept'] == []
    assert supabase.users == {}
    users = store.read().users
    assert 'email' not in users['ravi'] and users['coordinator']['email'] == 'ops@example.com'


# --- one-click entry from the sign-in screen (no password, no session needed) ---


@pytest.fixture
def ready(hosted, admin, supabase):
    """Demo logins already created, then the caller is signed out: entry is for people who have no session."""
    assert create(hosted, admin).status_code == 200
    from api.app.modules.ledger import routes
    routes._entry_hits.clear()
    return hosted


def enter(client, user_id, **headers):
    return client.post('/auth/demo-entry', json={'user_id': user_id}, headers=headers)


def test_the_sign_in_screen_is_offered_only_the_roles_that_have_demo_logins(hosted, admin, supabase):
    assert hosted.get('/auth/demo-entry').json() == {'enabled': False, 'roles': []}  # nothing created yet
    create(hosted, admin)
    offered = hosted.get('/auth/demo-entry').json()
    assert offered['enabled'] is True
    assert {r['user_id'] for r in offered['roles']} == set(demo_accounts.ENTRY_USERS)
    assert {r['user_id']: r['role'] for r in offered['roles']}['priya'] == 'technician'
    assert 'admin' not in {r['user_id'] for r in offered['roles']}


def test_entry_hands_back_a_one_time_token_for_the_demo_account_without_any_sign_in(ready):
    response = enter(ready, 'ravi')
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
    assert response.json() == {'token_hash': 'hash-for-boss+rivet-ravi@example.com', 'verification_type': 'magiclink'}


def test_entry_is_closed_when_demo_controls_are_off_or_the_server_is_local(ready, monkeypatch):
    monkeypatch.delenv('DEMO_CONTROLS')
    assert enter(ready, 'ravi').status_code == 403
    assert ready.get('/auth/demo-entry').json()['enabled'] is False


def test_admin_entry_needs_its_own_switch(ready, monkeypatch):
    assert enter(ready, 'admin').status_code == 403
    monkeypatch.setenv('DEMO_ENTER_ADMIN', '1')
    assert enter(ready, 'admin').status_code == 200
    assert 'admin' in {r['user_id'] for r in ready.get('/auth/demo-entry').json()['roles']}


def test_entry_never_opens_a_real_persons_account(ready):
    link('priya', email='priya.real@example.com')  # a real sign-in, not a demo one
    assert enter(ready, 'priya').status_code == 409
    assert 'priya' not in {r['user_id'] for r in ready.get('/auth/demo-entry').json()['roles']}


def test_entry_rejects_unknown_roles_and_missing_demo_logins(hosted, admin, supabase):
    assert enter(hosted, 'ravi').status_code == 409  # logins were never created
    assert enter(hosted, 'nobody').status_code == 403
    assert enter(hosted, '').status_code == 403


def test_one_visitor_cannot_hammer_the_entry(ready):
    codes = [enter(ready, 'ravi', **{'X-Forwarded-For': '203.0.113.9'}).status_code for _ in range(22)]
    assert codes[:20] == [200] * 20 and codes[20:] == [429, 429]
    assert enter(ready, 'ravi', **{'X-Forwarded-For': '203.0.113.10'}).status_code == 200  # someone else is unaffected


def test_a_failed_link_is_reported_not_leaked(ready, supabase):
    supabase.users.clear()  # the account vanished from Supabase
    response = enter(ready, 'ravi')
    assert response.status_code == 502 and response.json()['code'] == 'ENTRY_UNAVAILABLE'
