from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api.app.core.runtime import fixture, store
from api.app.main import app
from api.app.modules.ledger.domain import assign, approve, create_request, invariants
from api.app.modules.workflow import commands, engine
from contract.errors import DomainError


def assigned_job():
    state = fixture()
    request = create_request(state, {'machine_id': 'M-104', 'actor': 'coordinator'})
    approve(state, request['id'], 'coordinator')
    job = assign(state, request['job_id'], 'ravi', 'coordinator')
    return state, request, job


def test_cancellation_releases_held_resources_and_records_transition():
    state, request, job = assigned_job()
    result = commands.cancel(state, request['id'], {'reason': 'Plant shutdown deferred', 'expected_version': job['version']}, 'coordinator')

    assert result['state'] == 'cancelled'
    assert state.requests[request['id']]['state'] == 'cancelled'
    assert state.balances['store:site-b:available|HS-40'] == 1
    transition = [event for event in state.events if event['type'] == 'RequestCancelled'][-1]
    assert transition['payload']['from_state'] == 'assigned'
    assert transition['payload']['to_state'] == 'cancelled'
    assert invariants(state)


def test_reschedule_returns_to_approved_and_unbooks_assignee():
    state, request, job = assigned_job()
    result = commands.reschedule(state, request['id'], {'reason': 'Customer requested another shift', 'window': '2026-10-08 AM', 'expected_version': job['version']}, 'coordinator')

    assert result['state'] == 'approved'
    assert job['technician_id'] is None
    assert job['requested_window'] == '2026-10-08 AM'
    assert 'planned_start' not in job
    assert state.balances['store:site-b:available|HS-40'] == 1
    assert invariants(state)


def test_hold_resume_and_stale_write_protection():
    state, _, job = assigned_job()
    held = commands.hold(state, job['id'], {'reason': 'Waiting for site access', 'expected_version': job['version']}, 'coordinator')
    assert held['state'] == 'on_hold'
    assert job['held_from'] == 'assigned'
    with pytest.raises(DomainError) as error:
        commands.resume(state, job['id'], {'expected_version': 1}, 'coordinator')
    assert error.value.code == 'VERSION_CONFLICT'
    resumed = commands.resume(state, job['id'], {'expected_version': job['version'], 'note': 'Permit is ready'}, 'coordinator')
    assert resumed['state'] == 'assigned'


def test_close_then_reopen_has_an_auditable_path():
    state, _, job = assigned_job()
    engine.transition(state, job, 'in_progress', 'ravi', 'WorkStarted')
    engine.transition(state, job, 'completed', 'ravi', 'ReportSubmitted')
    engine.transition(state, job, 'verified', 'supervisor', 'AcceptanceRecorded')
    closed = commands.close(state, job['id'], {'expected_version': job['version'], 'invoice_ref': 'INV-42'}, 'coordinator')
    assert closed['state'] == 'closed'
    job['verified_at'] = state.now
    reopened = commands.reopen(state, job['id'], {'reason': 'Pressure is out of band', 'expected_version': job['version']}, 'coordinator')
    assert reopened['state'] == 'in_progress'
    assert state.machines[job['machine_id']]['status'] == 'Fault detected'
    assert [event['type'] for event in state.events][-2:] == ['JobClosed', 'JobReopened']


def token(client, user):
    response = client.post('/auth/token', json={'user_id': user, 'otp': '246810'})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token'], 'Idempotency-Key': str(uuid4())}


@pytest.fixture
def client():
    store.reset()
    with TestClient(app) as current:
        yield current


def test_lifecycle_routes_timeline_and_versioned_workflow_editor(client):
    coordinator = token(client, 'coordinator')
    created = client.post('/requests', json={'machine_id': 'M-104', 'fault': 'hydraulic_leak'}, headers=coordinator).json()
    version = client.get(f"/jobs/{created['job_id']}", headers=coordinator).json()['version']
    rejected = client.post(f"/requests/{created['id']}/reject", json={'reason': 'Duplicate plant report', 'expected_version': version}, headers=token(client, 'coordinator'))
    assert rejected.status_code == 200, rejected.text
    timeline = client.get(f"/jobs/{created['job_id']}/timeline", headers=coordinator)
    assert timeline.status_code == 200
    assert any(event['type'] == 'RequestRejected' for event in timeline.json()['events'])
    board = client.get('/requests?state=rejected', headers=coordinator).json()['items']
    assert any(item['id'] == created['id'] for item in board)

    definition = client.get('/admin/workflows', headers=token(client, 'admin')).json()['items'][0]
    updated = client.put('/admin/workflows/repair', json={'required_stages': ['safety_check'], 'rules': {'hold_expiry_hours': 6}}, headers=token(client, 'admin'))
    assert updated.status_code == 200, updated.text
    assert updated.json()['version'] == definition['version'] + 1
    retry = client.put('/admin/workflows/repair', json={'locked': {'role_checks': False}}, headers=token(client, 'admin'))
    assert retry.status_code == 422
