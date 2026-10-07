"""Demo entry on a hosted server: anyone who can open the site may enter as a demo role, but only while an operator has switched demo mode on."""
import jwt
import pytest
from api.app.core import auth
from api.app.core.runtime import store
from api.app.modules.ledger import demo_accounts, routes
from tests.test_supabase_auth import hosted, supabase_token, bearer, link  # noqa: F401  (hosted is a fixture)


@pytest.fixture
def demo(hosted, monkeypatch):
    monkeypatch.setenv('DEMO_CONTROLS', '1')
    monkeypatch.delenv('DEMO_ENTER_ADMIN', raising=False)
    routes._entry_hits.clear()
    return hosted


def enter(client, user_id, **headers):
    return client.post('/auth/demo-entry', json={'user_id': user_id}, headers=headers)


def test_every_demo_role_is_offered_without_any_account_being_created(demo):
    offered = demo.get('/auth/demo-entry').json()
    assert offered['enabled'] is True
    assert {r['user_id'] for r in offered['roles']} == set(demo_accounts.ENTRY_USERS)
    assert {r['user_id']: r['role'] for r in offered['roles']}['priya'] == 'technician'
    assert 'admin' not in {r['user_id'] for r in offered['roles']}


def test_the_token_works_for_that_role_and_no_other(demo):
    token = enter(demo, 'ravi').json()['access_token']
    me = demo.get('/auth/me', headers=bearer(token))
    assert me.status_code == 200 and me.json()['role'] == 'technician' and me.json()['user_id'] == 'ravi' and 'pin' not in me.json()
    assert demo.get('/jobs', headers=bearer(token)).status_code == 200
    assert demo.post('/admin/reset', headers=bearer(token)).status_code == 403  # a technician cannot reset the data


def test_a_coordinator_who_is_linked_to_a_real_email_can_still_be_entered_as_a_demo_role(demo):
    link('coordinator', email='ops@example.com')
    assert enter(demo, 'coordinator').status_code == 200


def test_entry_is_closed_unless_the_operator_turned_demo_mode_on(demo, monkeypatch):
    monkeypatch.delenv('DEMO_CONTROLS')
    assert enter(demo, 'ravi').status_code == 403
    assert demo.get('/auth/demo-entry').json() == {'enabled': False, 'roles': []}


def test_a_demo_token_stops_working_when_demo_mode_is_switched_off(demo, monkeypatch):
    token = enter(demo, 'ravi').json()['access_token']
    monkeypatch.delenv('DEMO_CONTROLS')
    assert demo.get('/auth/me', headers=bearer(token)).status_code == 401


def test_admin_entry_needs_its_own_switch(demo, monkeypatch):
    assert enter(demo, 'admin').status_code == 403
    monkeypatch.setenv('DEMO_ENTER_ADMIN', '1')
    assert enter(demo, 'admin').status_code == 200
    # turning the switch off again also cancels a token handed out earlier
    token = enter(demo, 'admin').json()['access_token']
    monkeypatch.delenv('DEMO_ENTER_ADMIN')
    assert demo.get('/auth/me', headers=bearer(token)).status_code == 401


def test_unknown_roles_are_refused(demo):
    assert enter(demo, 'nobody').status_code == 403
    assert enter(demo, '').status_code == 403


def test_a_token_of_another_kind_or_for_a_role_that_is_not_offered_is_rejected(demo):
    now = __import__('time').time()
    for claims in ({'sub': 'ravi', 'kind': 'access'}, {'sub': 'admin', 'kind': 'demo'}, {'sub': 'ghost', 'kind': 'demo'}):
        forged = jwt.encode({**claims, 'exp': now + 600}, auth.SECRET, algorithm='HS256')
        assert demo.get('/auth/me', headers=bearer(forged)).status_code == 401, claims


def test_a_demo_token_signed_with_a_different_secret_is_rejected(demo):
    forged = jwt.encode({'sub': 'ravi', 'kind': 'demo', 'exp': __import__('time').time() + 600}, 'not-the-secret', algorithm='HS256')
    assert demo.get('/auth/me', headers=bearer(forged)).status_code == 401


def test_real_supabase_sign_ins_keep_working_alongside_demo_entry(demo):
    link('manager', email='boss@example.com')
    me = demo.get('/auth/me', headers=bearer(supabase_token('boss@example.com')))
    assert me.status_code == 200 and me.json()['role'] == 'manager'


def test_the_token_lasts_even_when_the_scripted_clock_is_far_from_the_real_one(demo):
    admin = bearer(supabase_token('boss@example.com'))
    link('admin', email='boss@example.com')
    demo.post('/admin/clock', json={'set': '2020-01-01T09:00:00+05:30'}, headers=admin)
    token = enter(demo, 'ravi').json()['access_token']
    assert demo.get('/auth/me', headers=bearer(token)).status_code == 200


def test_one_visitor_cannot_hammer_the_entry(demo):
    codes = [enter(demo, 'ravi', **{'X-Forwarded-For': '203.0.113.9'}).status_code for _ in range(22)]
    assert codes[:20] == [200] * 20 and codes[20:] == [429, 429]
    assert enter(demo, 'ravi', **{'X-Forwarded-For': '203.0.113.10'}).status_code == 200
