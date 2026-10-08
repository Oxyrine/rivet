"""When no plan can place every job, recovery saves what it can and says what it cannot, instead of only escalating."""
import pytest
from contract.errors import DomainError
from api.app.modules.ledger.domain import invariants
from api.app.modules.exceptions.domain import recovery, dropout, approve_plan, rank_key_partial
from tests.exceptions.test_domain import scenario


def part_stranded():
    """Ravi holds J-2231's only hydraulic hose (collected into his custody) and the store has none left."""
    state = scenario()
    for c in state.commitments.values():
        if c.get('job_id') == 'J-2231' and c.get('resource') == 'HS-40':
            c.update(collected=True, physical_location='custody:ravi')
    state.balances['store:site-b:available|HS-40'] = 0
    return state


def everyone_out():
    state = scenario()
    for tid in state.technicians:
        state.technicians[tid]['available'] = False
    return state


def test_a_complete_plan_is_preferred_and_no_partial_plan_is_offered():
    result = recovery(scenario(), 'ravi')
    assert result['plans'] and result['partial_plans'] == [] and not result['no_feasible_path'] and result['message'] is None


def test_one_unplaceable_job_no_longer_throws_away_the_jobs_that_can_be_saved():
    result = recovery(part_stranded(), 'ravi')
    assert result['no_feasible_path'] and result['plans'] == []  # no complete plan, as before
    best = result['partial_plans'][0]
    assert best['partial'] is True
    assert {a['job_id'] for a in best['assignments']} == {'J-2236', 'J-2239'}
    assert [u['job_id'] for u in best['unplaced']] == ['J-2231']
    assert 'HS-40' in best['unplaced'][0]['reason']
    assert '2 of 3' in result['message'] and '1 needs follow-up' in result['message']


def test_every_affected_job_gets_its_blockers_and_next_steps():
    result = recovery(part_stranded(), 'ravi')
    by_job = {j['job_id']: j for j in result['jobs']}
    assert set(by_job) == {'J-2231', 'J-2236', 'J-2239'}
    p1 = by_job['J-2231']
    assert p1['priority'] == 'P1' and p1['blockers'] and any('service manager' in s for s in p1['next_steps'])
    p2 = by_job['J-2236']
    assert any('next available slot' in s for s in p2['next_steps']) and not any('service manager' in s for s in p2['next_steps'])
    assert {b['reason'] for b in p1['blockers']} >= {'Certification expired', 'Required skill level is missing'}


def test_when_nobody_can_take_anything_the_reasons_are_still_given():
    result = recovery(everyone_out(), 'ravi')
    assert result['no_feasible_path'] and result['plans'] == [] and result['partial_plans'] == []
    assert 'No technician can take these jobs' in result['message']
    assert all(j['blockers'] and j['next_steps'] for j in result['jobs'])
    assert any('available again' in s for j in result['jobs'] for s in j['next_steps'])


def test_a_dispatcher_can_approve_a_partial_plan_and_the_rest_is_flagged_for_follow_up():
    new, _, result = dropout(part_stranded(), 'ravi')
    best = result['partial_plans'][0]
    assert best['id'] in new.plans and not best['needs_manager']
    applied, events, outcome = approve_plan(new, best['id'], 'coordinator', 'coordinator')  # no manager needed
    assert outcome['unplaced'] == best['unplaced']
    assert applied.jobs['J-2236']['technician_id'] != 'ravi' and applied.jobs['J-2239']['technician_id'] != 'ravi'
    assert applied.jobs['J-2231']['recovery_status'] == 'needs_follow_up' and applied.jobs['J-2231']['at_risk']
    assert [e['type'] for e in events].count('RecoveryUnplaced') == 1
    breach = next(b for b in applied.breaches.values() if b['technician_id'] == 'ravi')
    assert breach['state'] == 'PARTIALLY_RECOVERED' and breach['affected_jobs'] == ['J-2231']
    assert invariants(applied)


def test_a_partial_plan_goes_stale_like_any_other():
    new, _, result = dropout(part_stranded(), 'ravi')
    changed = new.clone()
    changed.technicians['priya']['available'] = False
    with pytest.raises(DomainError, match='Refresh'):
        approve_plan(changed, result['partial_plans'][0]['id'], 'coordinator', 'coordinator')


def test_partial_plans_save_p1_jobs_before_anything_else():
    def plan(unplaced, penalty=0):
        return {'unplaced': [{'priority': p} for p in unplaced], 'sla_misses': {'P1': 0, 'P2': 0, 'P3': 0},
                'penalty_paise': penalty, 'commitments_changed': 0, 'added_travel_minutes': 0, 'signature': 'x'}
    saves_p1 = plan(['P2', 'P2'])      # leaves two P2 jobs
    loses_p1 = plan(['P1'])            # leaves one P1 job
    assert sorted([loses_p1, saves_p1], key=rank_key_partial)[0] is saves_p1
    fewer_left = plan(['P2'])
    assert sorted([saves_p1, fewer_left], key=rank_key_partial)[0] is fewer_left


def test_reporting_a_dropout_twice_keeps_plans_that_can_still_be_approved():
    first, _, _ = dropout(scenario(), 'ravi')
    second, events, result = dropout(first, 'ravi')
    assert events == [] and result['plans'] and all(p['id'] in second.plans for p in result['plans'])
    applied, _, _ = approve_plan(second, result['plans'][0]['id'], 'coordinator', 'coordinator')
    assert applied.jobs['J-2231']['technician_id'] != 'ravi'


def test_recovery_plan_can_be_decided_only_once():
    state, _, result = dropout(scenario(), 'ravi')
    plan_id = result['plans'][0]['id']
    applied, _, _ = approve_plan(state, plan_id, 'coordinator', 'coordinator')
    with pytest.raises(DomainError) as error:
        approve_plan(applied, plan_id, 'coordinator', 'manager')
    assert error.value.code == 'PLAN_ALREADY_DECIDED'
    assert error.value.details['by'] == 'coordinator'
