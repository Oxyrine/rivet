import pytest

from api.app.core.runtime import fixture
from api.app.modules.exceptions.domain import report_issue, risk
from api.app.modules.ledger.domain import assign, approve, create_request, invariants
from api.app.modules.workflow import commands
from contract.errors import DomainError


def assigned():
    state = fixture()
    request = create_request(state, {'machine_id': 'M-104', 'actor': 'coordinator'})
    approve(state, request['id'], 'coordinator')
    job = assign(state, request['job_id'], 'ravi', 'coordinator')
    return state, job


def test_part_shortage_breaches_the_hold_and_marks_job_at_risk():
    state, job = assigned()
    result = report_issue(state, job['id'], {'kind': 'part_shortage', 'details': {'resource': 'HS-40', 'note': 'Seal kit not on shelf'}, 'expected_version': job['version']}, 'ravi')

    hold = next(item for item in state.commitments.values() if item.get('job_id') == job['id'] and item.get('resource') == 'HS-40')
    assert result['kind'] == 'part_shortage'
    assert hold['state'] == 'BREACHED'
    assert state.breaches[result['breach_id']]['type'] == 'PART_SHORTFALL'
    assert job['at_risk']
    assert any(signal['signal'] == 'Broken commitment' for signal in next(row for row in risk(state) if row['job_id'] == job['id'])['signals'])


def test_extra_work_extends_balanced_technician_time():
    state, job = assigned()
    before = state.balances[f'job:{job["id"]}:allocated|TIME']
    duration = job['duration_minutes']
    result = report_issue(state, job['id'], {'kind': 'extra_work', 'details': {'minutes': 30, 'est_cost_paise': 1000}, 'expected_version': job['version']}, 'ravi')

    assert result['extra_slots'] == 2
    assert state.balances[f'job:{job["id"]}:allocated|TIME'] == before + 2
    assert job['duration_minutes'] == duration + 30
    assert invariants(state)


def test_unsafe_condition_holds_then_resumes_the_job():
    state, job = assigned()
    result = report_issue(state, job['id'], {'kind': 'unsafe_condition', 'details': {'reason': 'Hydraulic guard is loose'}, 'expected_version': job['version']}, 'ravi')

    assert result['state'] == 'on_hold'
    assert job['safety_hold'] is True
    assert any(signal['signal'] == 'Safety hold' for signal in next(row for row in risk(state) if row['job_id'] == job['id'])['signals'])
    resumed = commands.resume(state, job['id'], {'expected_version': job['version']}, 'coordinator')
    assert resumed['state'] == 'assigned'
    assert not job.get('safety_hold')


def test_issue_rejects_stale_job_version():
    state, job = assigned()
    with pytest.raises(DomainError) as error:
        report_issue(state, job['id'], {'kind': 'part_shortage', 'details': {'resource': 'HS-40'}, 'expected_version': job['version'] - 1}, 'ravi')
    assert error.value.code == 'VERSION_CONFLICT'
