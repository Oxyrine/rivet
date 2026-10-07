"""Demo controls on a hosted deployment: Supabase still decides who signs in, an admin switch enables the scripted clock and reset."""
import pytest
from api.app.core.runtime import store
from tests.test_supabase_auth import hosted, supabase_token, bearer, link  # noqa: F401  (hosted is a fixture)

BOSS = 'boss@example.com'


@pytest.fixture
def admin(hosted, monkeypatch):
    monkeypatch.setenv('BOOTSTRAP_ADMIN_EMAIL', BOSS)
    return bearer(supabase_token(BOSS))


def test_without_the_switch_a_hosted_server_has_no_demo_clock_or_reset(hosted, admin):
    assert hosted.post('/admin/clock', json={'set': '2026-10-07T09:02:00+05:30'}, headers=admin).status_code == 403
    assert hosted.post('/admin/reset', headers=admin).status_code == 403


def test_the_scripted_clock_holds_still_between_requests(hosted, admin, monkeypatch):
    monkeypatch.setenv('DEMO_CONTROLS', '1')
    assert hosted.post('/admin/clock', json={'set': '2026-10-07T09:02:00+05:30'}, headers=admin).status_code == 200
    assert store.read().now.startswith('2026-10-07T03:32:00')
    hosted.post('/adapters/billing/enable', headers=admin)  # any later write must not jump to the real time
    assert store.read().now.startswith('2026-10-07T03:32:00')
    assert hosted.post('/admin/clock', json={'advance': 600}, headers=admin).json()['now'].startswith('2026-10-07T03:42:00')


def test_only_an_admin_may_use_the_demo_controls(hosted, admin, monkeypatch):
    monkeypatch.setenv('DEMO_CONTROLS', '1')
    link('coordinator', email='ops@example.com')
    ops = bearer(supabase_token('ops@example.com'))
    assert hosted.post('/admin/clock', json={'advance': 60}, headers=ops).status_code == 403
    assert hosted.post('/admin/reset', headers=ops).status_code == 403


def test_reset_restores_the_clean_seed_but_keeps_who_is_linked(hosted, admin, monkeypatch):
    monkeypatch.setenv('DEMO_CONTROLS', '1')
    link('coordinator', email='ops@example.com')
    hosted.post('/admin/clock', json={'set': '2026-10-07T12:20:00+05:30'}, headers=admin)
    hosted.post('/requests', json={'machine_id': 'M-104'}, headers=bearer(supabase_token('ops@example.com')))
    assert 'J-2231' in store.read().jobs
    assert hosted.post('/admin/reset', headers=admin).status_code == 200
    after = store.read()
    assert 'J-2231' not in after.jobs and after.now.startswith('2026-10-07T03:32:00')
    assert after.users['coordinator']['email'] == 'ops@example.com'
    assert hosted.get('/auth/me', headers=bearer(supabase_token('ops@example.com'))).json()['role'] == 'coordinator'


def test_an_admin_can_list_people_with_their_link_status_and_no_secrets(hosted, admin):
    link('coordinator', email='ops@example.com')
    people = hosted.get('/admin/users', headers=admin).json()
    by_id = {p['user_id']: p for p in people}
    assert by_id['coordinator']['linked'] is True and by_id['coordinator']['email'] == 'ops@example.com'
    assert by_id['priya']['linked'] is False and by_id['priya']['role'] == 'technician'
    assert all('pin' not in p for p in people)
    ops = bearer(supabase_token('ops@example.com'))
    assert hosted.get('/admin/users', headers=ops).status_code == 403
