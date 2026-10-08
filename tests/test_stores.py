"""The storekeeper sees what each technician needs and can issue, top up vans and book in stock; the demo seed leaves work to assign."""
import pytest
from fastapi.testclient import TestClient
from api.app.main import app
from api.app.core.runtime import store
from api.app.modules.ledger.domain import invariants


@pytest.fixture
def client():
    store.reset()
    with TestClient(app) as c:
        yield c


def sign_in(client, user_id):
    token = client.post('/auth/token', json={'user_id': user_id, 'otp': '246810'}).json()['access_token']
    return {'Authorization': 'Bearer ' + token}


def need(overview, job, resource):
    return next(n for n in overview['needs'] if n['job_id'] == job and n['resource'] == resource)


def test_the_overview_says_what_each_technician_needs_and_whether_it_can_be_handed_over(client):
    overview = client.get('/stores/overview', headers=sign_in(client, 'storekeeper')).json()
    assert [x['site_id'] for x in overview['stores']] == ['site-b']
    priya = need(overview, 'J-2254', 'PART-03')
    assert priya['technician'] == 'Priya' and priya['status'] == 'ready' and priya['outstanding'] == 1
    # a job with no technician yet has nothing reserved: it waits, and says so
    waiting = need(overview, 'J-2253', 'PART-04')
    assert waiting['technician'] is None and waiting['status'] == 'waiting'


def test_assigning_a_waiting_job_reserves_its_parts_and_the_storekeeper_can_then_issue_them(client):
    coordinator, keeper = sign_in(client, 'coordinator'), sign_in(client, 'storekeeper')
    assert client.post('/jobs/J-2253/assign', json={'technician_id': 'karthik'}, headers=coordinator).status_code == 200
    ready = need(client.get('/stores/overview', headers=keeper).json(), 'J-2253', 'PART-04')
    assert ready['status'] == 'ready' and ready['technician'] == 'Karthik'
    assert client.post('/stores/issue', json={'job_id': 'J-2253', 'resource': 'PART-04', 'quantity': 1}, headers=keeper).status_code == 200
    assert need(client.get('/stores/overview', headers=keeper).json(), 'J-2253', 'PART-04')['status'] == 'issued'
    shelf = next(r for r in client.get('/stores/overview', headers=keeper).json()['stores'][0]['stock'] if r['resource'] == 'PART-04')
    assert shelf['held'] == 0  # handed over, so no longer held back


def test_the_demo_seed_leaves_jobs_and_technicians_unassigned_and_all_of_them_can_be_assigned(client):
    state = store.read()
    open_jobs = [j for j in state.jobs.values() if j['state'] == 'approved' and not j.get('technician_id')]
    busy = {j.get('technician_id') for j in state.jobs.values()}
    idle = [t for t in state.technicians if t not in busy]
    assert len(open_jobs) >= 3 and len(idle) >= 3
    coordinator = sign_in(client, 'coordinator')
    for job in open_jobs:  # every one of them can be given to someone, including the tool they hold
        assert client.post(f"/jobs/{job['id']}/assign", json={}, headers=coordinator).status_code == 200, job['id']


def test_only_the_storekeeper_changes_stock(client):
    body = {'resource': 'PART-01', 'quantity': 2}
    assert client.post('/stores/receive', json=body, headers=sign_in(client, 'coordinator')).status_code == 403
    assert client.get('/stores/overview', headers=sign_in(client, 'coordinator')).status_code == 200  # but may look
    assert client.get('/stores/overview', headers=sign_in(client, 'requester')).status_code == 403


def test_receiving_stock_adds_to_the_shelf_and_keeps_the_books_balanced(client):
    keeper = sign_in(client, 'storekeeper')
    shelf = lambda: next(r for r in client.get('/stores/overview', headers=keeper).json()['stores'][0]['stock'] if r['resource'] == 'PART-01')['available']
    before = shelf()
    r = client.post('/stores/receive', json={'resource': 'part-01', 'quantity': 4, 'reference': 'DN-118'}, headers=keeper)
    assert r.status_code == 200 and shelf() == before + 4
    assert invariants(store.read())
    assert client.post('/stores/receive', json={'resource': 'PART-01', 'quantity': 0}, headers=keeper).status_code == 422
    assert client.post('/stores/receive', json={'resource': 'bad code!', 'quantity': 1}, headers=keeper).status_code == 422


def test_a_van_top_up_moves_stock_from_the_shelf_to_that_technician(client):
    keeper = sign_in(client, 'storekeeper')
    r = client.post('/stores/van-issue', json={'technician_id': 'ravi', 'resource': 'PART-01', 'quantity': 2}, headers=keeper)
    assert r.status_code == 200 and r.json()['van_stock'] == 2
    vans = client.get('/stores/overview', headers=keeper).json()['vans']
    assert any(v['technician_id'] == 'ravi' and v['stock'][0]['quantity'] == 2 for v in vans)
    assert client.post('/stores/van-issue', json={'technician_id': 'ravi', 'resource': 'PART-01', 'quantity': 999}, headers=keeper).status_code == 409  # not that many on the shelf
    assert invariants(store.read())
