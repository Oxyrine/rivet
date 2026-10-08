"""Each role reads only what its work needs: a customer does not see the provider's internal planning."""
import pytest
from fastapi.testclient import TestClient
from api.app.main import app
from api.app.core.runtime import store
from api.app.core import views

CUSTOMER_TYPES = views.CUSTOMER_COMMITMENTS


@pytest.fixture
def client():
    store.reset()
    with TestClient(app) as c:
        yield c


def sign_in(client, user_id):
    token = client.post('/auth/token', json={'user_id': user_id, 'otp': '246810'}).json()['access_token']
    return {'Authorization': 'Bearer ' + token}


def job(client, headers, ident):
    body = client.get(f'/jobs/{ident}', headers=headers).json()
    return body


def test_staff_see_the_dispatchers_ranking_and_every_commitment(client):
    for who in ('coordinator', 'manager', 'auditor', 'admin'):
        j = job(client, sign_in(client, who), 'J-2240')
        assert len(j['candidates']) > 0 and 'technician_id' in j and 'planned_parts' in j, who
        assert {c['type'] for c in j['commitments']} - CUSTOMER_TYPES, who  # internal holds are present for staff


def test_a_customer_does_not_see_technician_skills_holds_or_assignment(client):
    for who in ('requester', 'supervisor'):
        j = job(client, sign_in(client, who), 'J-2240')
        assert 'candidates' not in j, who
        assert not any(k in j for k in views.CUSTOMER_HIDDEN_JOB_FIELDS), who
        assert {c['type'] for c in j['commitments']} <= CUSTOMER_TYPES, who
        # what they do need is still there
        assert j['state'] and j['machine_id'] and 'acceptance' in j and 'issued_parts' in j


def test_the_job_list_is_trimmed_the_same_way(client):
    items = client.get('/jobs', headers=sign_in(client, 'requester')).json()['items']
    assert items and all(not any(k in j for k in views.CUSTOMER_HIDDEN_JOB_FIELDS) for j in items)
    staff = client.get('/jobs', headers=sign_in(client, 'coordinator')).json()['items']
    assert any('technician_id' in j for j in staff)


def test_the_dashboard_hides_recovery_and_staffing_from_a_customer(client):
    summary = client.get('/dashboard/summary', headers=sign_in(client, 'requester')).json()
    assert summary['breaches'] == [] and summary['technicians'] == []
    assert all(c['type'] in CUSTOMER_TYPES for c in summary['commitments'])
    assert all('candidates' not in j and 'technician_id' not in j for j in summary['jobs'])
    staff = client.get('/dashboard/summary', headers=sign_in(client, 'coordinator')).json()
    assert len(staff['technicians']) > 0 and any(c['type'] not in CUSTOMER_TYPES for c in staff['commitments'])


def test_a_technician_keeps_their_job_details_but_not_the_ranking(client):
    headers = sign_in(client, 'ravi')
    jobs = client.get('/devices/device-ravi/shift-cache', headers=headers).json()['jobs']
    assert jobs and all('candidates' not in x and 'planned_parts' in x and x['technician_id'] == 'ravi' for x in jobs)
    own = client.get('/jobs', headers=headers).json()['items']
    assert own and all('candidates' not in x for x in own)


def test_a_technician_still_cannot_open_someone_elses_job(client):
    assert client.get('/jobs/J-2254', headers=sign_in(client, 'ravi')).status_code == 403


def test_customers_get_no_live_event_stream_but_staff_and_technicians_do():
    assert views.may_see_events('requester') is False and views.may_see_events('supervisor') is False
    assert all(views.may_see_events(r) for r in ('admin', 'coordinator', 'manager', 'auditor', 'technician', 'storekeeper'))


def test_the_auditor_reads_everything_but_changes_nothing(client):
    headers = sign_in(client, 'auditor')
    assert client.get('/dashboard/summary', headers=headers).status_code == 200
    assert client.post('/requests', json={'machine_id': 'M-104', 'fault': 'hydraulic_leak'}, headers=headers).status_code == 403
    assert client.post('/admin/clock', json={'advance': 60}, headers=headers).status_code == 403


def test_only_the_supervisor_can_accept_dispute_or_confirm_the_machine_runs(client):
    """The portal shows these controls to a requester as unavailable; this is the rule behind that."""
    requester, supervisor = sign_in(client, 'requester'), sign_in(client, 'supervisor')
    for path, body in (('/jobs/J-2236/accept', {}), ('/jobs/J-2236/dispute', {'lines': ['labour']}), ('/jobs/J-2236/machine-running', {})):
        assert client.post(path, json=body, headers=requester).status_code == 403, path
    assert client.post('/jobs/J-2236/dispute', json={'lines': ['labour']}, headers=supervisor).status_code == 200
    assert client.post('/customer-commitments/time:J-2236/confirm', json={}, headers=requester).status_code != 403  # requesters still confirm access and permits


def test_confirming_the_machine_runs_before_the_technician_has_finished_is_refused(client):
    """A machine does not read 'Running' on a job nobody has worked: that confirmation waits for checkout."""
    coordinator, supervisor = sign_in(client, 'coordinator'), sign_in(client, 'supervisor')
    r = client.post('/requests', json={'machine_id': 'M-104', 'fault': 'hydraulic_leak'}, headers=coordinator).json()
    refused = client.post(f"/jobs/{r['job_id']}/machine-running", json={}, headers=supervisor)
    assert refused.status_code == 409 and refused.json()['code'] == 'NOTHING_TO_CONFIRM'
    machines = {m['id']: m for m in client.get('/dashboard/summary', headers=coordinator).json()['machines']}
    assert machines['M-104']['status'] == 'Fault detected'


def test_a_machine_with_an_unfinished_request_never_reads_running_even_if_a_stale_flag_says_so(client):
    """Data left behind by the old early-confirm bug must not keep showing 'Running'."""
    coordinator = sign_in(client, 'coordinator')
    job = client.post('/requests', json={'machine_id': 'M-104', 'fault': 'hydraulic_leak'}, headers=coordinator).json()['job_id']
    store.mutate(lambda s: s.machines['M-104'].update(status='Running'))  # the stuck state
    assert client.get('/machines/M-104/passport', headers=coordinator).json()['machine']['status'] == 'Fault detected'
    assert {m['id']: m['status'] for m in client.get('/dashboard/summary', headers=coordinator).json()['machines']}['M-104'] == 'Fault detected'
    assert client.get('/machines/M-117/passport', headers=coordinator).json()['machine']['status'] == 'Running'  # a planned job is not a fault
    store.mutate(lambda s: s.jobs[job].update(state='cancelled'))
    assert client.get('/machines/M-104/passport', headers=coordinator).json()['machine']['status'] == 'Running'
