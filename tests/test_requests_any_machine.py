"""A fault can be reported on any machine the person can see, not only the M-104 demo press."""
import pytest
from fastapi.testclient import TestClient
from api.app.main import app
from api.app.core.runtime import store


@pytest.fixture
def client():
    store.reset()
    with TestClient(app) as c:
        yield c


def sign_in(client, user_id):
    token = client.post('/auth/token', json={'user_id': user_id, 'otp': '246810'}).json()['access_token']
    return {'Authorization': 'Bearer ' + token}


def test_a_customer_can_report_a_gearbox_fault_on_another_machine_at_their_site(client):
    r = client.post('/requests', json={'machine_id': 'M-117', 'fault': 'gearbox_overhaul', 'description': 'Grinding noise'}, headers=sign_in(client, 'requester'))
    assert r.status_code == 200
    job = client.get(f"/jobs/{r.json()['job_id']}", headers=sign_in(client, 'coordinator')).json()
    assert job['machine_id'] == 'M-117' and job['fault'] == 'gearbox_overhaul' and job['duration_minutes'] == 95 and job['planned_parts'] == {}


def test_reporting_the_same_open_fault_again_returns_the_existing_request(client):
    headers = sign_in(client, 'requester')
    first = client.post('/requests', json={'machine_id': 'M-117', 'fault': 'gearbox_overhaul'}, headers=headers).json()
    again = client.post('/requests', json={'machine_id': 'M-117', 'fault': 'gearbox_overhaul'}, headers=headers).json()
    assert again['duplicate'] is True and again['job_id'] == first['job_id']


def test_a_customer_cannot_report_a_fault_on_a_machine_at_another_site(client):
    r = client.post('/requests', json={'machine_id': 'M-138', 'fault': 'gearbox_overhaul'}, headers=sign_in(client, 'requester'))
    assert r.status_code == 404


def test_the_summary_lists_only_the_machines_a_person_may_report_on(client):
    mine = {m['id'] for m in client.get('/dashboard/summary', headers=sign_in(client, 'requester')).json()['machines']}
    everyone = {m['id'] for m in client.get('/dashboard/summary', headers=sign_in(client, 'coordinator')).json()['machines']}
    assert 'M-117' in mine and 'M-138' not in mine and 'M-138' in everyone


def test_a_report_sent_before_work_started_is_rejected_with_a_reason_the_field_app_can_show(client):
    """The queue reports 'accepted' or 'rejected' per command. A rejected report must say why and must not appear on the customer's side."""
    priya, supervisor = sign_in(client, 'priya'), sign_in(client, 'supervisor')
    state = store.read()
    device = state.users['priya']['device_id']
    command = lambda seq, kind, payload: {'device_seq': seq, 'idempotency_key': f'k{seq}', 'device_ts': state.now, 'type': kind, 'job_id': 'J-2254', 'payload': payload}
    batch = [command(1, 'CheckIn', {'machine_qr': 'M-134'}), command(2, 'SubmitReport', {'parts': {}, 'checklist': ['isolate'], 'minutes': 60})]
    results = client.post(f'/devices/{device}/commands', json={'commands': batch}, headers=priya).json()['results']
    assert [r['status'] for r in results] == ['accepted', 'rejected'] and results[1]['code'] == 'WORK_NOT_STARTED' and results[1]['message']
    assert not client.get('/jobs/J-2254', headers=supervisor).json().get('report')
