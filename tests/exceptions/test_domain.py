import random
from datetime import datetime, timedelta, timezone
from itertools import product
import pytest
from contract.state import LedgerState
from contract.errors import DomainError
from scripts.bootstrap_fixture import fixture
from api.app.modules.ledger.domain import create_request, assign, invariants
from api.app.modules.exceptions.domain import impact, recovery, dropout, approve_plan, rank_key, fingerprint


def scenario():
    state = fixture()
    create_request(state, {'machine_id': 'M-104', 'fault': 'hydraulic_leak'})
    assign(state, 'J-2231', 'ravi')
    return state


def test_m104_joint_recovery_preserves_ledger_and_original():
    state = scenario(); original = state.to_dict()
    new, events, result = dropout(state, 'ravi')
    assert state.to_dict() == original
    assert set(result['impact']['affected_jobs']) == {'J-2231', 'J-2236', 'J-2239'}
    assert len(result['impact']['unaffected_jobs']) == 9
    a, b, c = result['plans'][:3]
    assert (a['misses_total'], a['penalty_paise'], a['commitments_changed']) == (0, 0, 3)
    assert (b['misses_total'], b['penalty_paise'], b['commitments_changed'], b['needs_manager']) == (0, 0, 4, True)
    assert (c['sla_misses']['P2'], c['penalty_paise']) == (1, 600000)
    applied, _, _ = approve_plan(new, a['id'], 'coordinator', 'coordinator')
    assert applied.jobs['J-2231']['technician_id'] == 'priya'
    assert applied.jobs['J-2236']['technician_id'] == applied.jobs['J-2239']['technician_id'] == 'karthik'
    assert invariants(applied)
    assert any(e['type'] == 'RecoveryApplied' for e in applied.events)


def test_stale_plan_and_manager_policy():
    new, _, result = dropout(scenario(), 'ravi')
    with pytest.raises(DomainError, match='service-manager'):
        approve_plan(new, result['plans'][1]['id'], 'coordinator', 'coordinator')
    changed = new.clone(); changed.technicians['priya']['available'] = False
    with pytest.raises(DomainError, match='Refresh'):
        approve_plan(changed, result['plans'][0]['id'], 'manager', 'manager')


def test_no_feasible_path_keeps_reservations_and_stranded_part():
    state = scenario()
    for tid in state.technicians: state.technicians[tid]['available'] = False
    result = recovery(state, 'ravi')
    assert result['no_feasible_path'] and not result['plans']
    state = scenario()
    for c in state.commitments.values():
        if c.get('job_id') == 'J-2231' and c.get('resource') == 'HS-40': c.update(collected=True, physical_location='custody:ravi')
    state.balances['store:site-b:available|HS-40'] = 0
    result = recovery(state, 'ravi')
    assert result['no_feasible_path']
    assert state.commitments['hold-existing']['job_id'] == 'J-2240'


def fixed_point_oracle(state, broken):
    """Independent scan: repeatedly invalidate promises with an invalid prerequisite."""
    invalid = set(broken)
    while True:
        previous = set(invalid)
        for cid, c in state.commitments.items():
            if c.get('state') in {'HELD', 'ACTIVE', 'COMMITTED', 'BREACHED'} and any(p in invalid for p in c.get('depends_on', [])):
                invalid.add(cid)
        if previous == invalid: break
    return {state.commitments[c]['job_id'] for c in invalid if state.commitments[c].get('job_id') in state.jobs}


def test_cascade_equals_independent_fixed_point_over_1000_graphs():
    rng = random.Random(104)
    for seed in range(1000):
        state = LedgerState()
        size = rng.randint(2, 18)
        for i in range(size):
            jid = f'j{i}'
            state.jobs[jid] = {'id': jid, 'state': 'assigned'}
            state.commitments[f'c{i}'] = {'id': f'c{i}', 'type': 'TECH_TIME', 'state': 'HELD', 'job_id': jid,
                'owner': f't{i}', 'depends_on': [f'c{k}' for k in range(i) if rng.random() < .17]}
        root = f'c{rng.randrange(size)}'
        result = impact(state, commitment_id=root)
        assert set(result['affected_jobs']) == fixed_point_oracle(state, [root]), seed


def exhaustive_schedule_oracle(state, jobs):
    """Enumerate all assignments with a separate interval/calendar implementation."""
    dt = datetime.fromisoformat; base = dt(state.now)
    choices = [tid for tid,t in state.technicians.items() if tid != 'dropped' and t['available'] and t['certificate_valid'] and t['travel_minutes'] <= 90 and t['skills']['gearbox'] >= 2]
    best = None
    for ids in product(choices, repeat=len(jobs)):
        intervals = {tid: [] for tid in ids}; capacity = {tid: 0 for tid in ids}
        misses = [0, 0, 0]; penalty = 0; travel = 0; signature = []
        valid = True
        for job, tid in zip(jobs, ids):
            tech = state.technicians[tid]; capacity[tid] += (job['duration_minutes']+14)//15
            if capacity[tid] > state.balances[f'tech:{tid}:2026-10-07:free|TIME']: valid = False; break
            current = max(base+timedelta(minutes=tech['travel_minutes']), dt(job['planned_start']))
            end = current+timedelta(minutes=job['duration_minutes'])
            # Repeated conflict resolution instead of the production sorted sweep.
            while any(current < finish and end > start for start,finish in intervals[tid]):
                current = max(finish for start,finish in intervals[tid] if current < finish and end > start)
                end = current+timedelta(minutes=job['duration_minutes'])
            if end > base.replace(hour=13, minute=30, second=0): valid = False; break
            intervals[tid].append((current,end))
            late = max(0, int((end-dt(job['deadline'])).total_seconds()))
            priority_index = int(job['priority'][1])-1
            if late: misses[priority_index] += 1
            rule = state.contracts[job['priority']]
            unit = rule['penalty_unit_minutes']*60
            penalty += min(((late+unit-1)//unit)*rule['penalty_rate_paise'],rule['penalty_cap_paise'])
            travel += tech['travel_minutes']
            signature.append(f"{job['id']}:{tid}:{current.isoformat()}")
        if valid:
            key = (*misses,penalty,len(jobs),travel,len(jobs),'|'.join(signature))
            if best is None or key < best: best = key
    return best


def test_joint_solver_matches_exhaustive_independent_oracle_100_seeds():
    for seed in range(100):
        rng = random.Random(seed)
        state = LedgerState()
        state.contracts = fixture().contracts
        for tid in ['dropped','a','b','c']:
            state.technicians[tid] = {'id':tid,'name':tid,'available':True,'certificate_valid':True,'skills':{'gearbox':2},'travel_minutes':rng.randint(1,40),'shift_slots':32}
            state.balances[f'tech:{tid}:2026-10-07:free|TIME']=32
        for i in range(3):
            jid=f'j{i}'; start=datetime.fromisoformat(state.now)+timedelta(minutes=i*50)
            state.jobs[jid]={'id':jid,'machine_id':f'm{i}','site_id':'site-a','fault':'gearbox_overhaul','technician_id':'dropped','state':'assigned','priority':'P2','planned_start':start.isoformat(),'deadline':(start+timedelta(minutes=rng.randint(45,130))).isoformat(),'duration_minutes':rng.randint(30,95),'planned_parts':{}}
            state.commitments[jid]={'id':jid,'type':'TECH_TIME','owner':'dropped','job_id':jid,'state':'HELD','depends_on':[]}
        ordered=sorted(state.jobs.values(),key=lambda j:(j['deadline'],j['id']))
        expected=exhaustive_schedule_oracle(state,ordered)
        result=recovery(state,'dropped')
        assert result['plans'] and rank_key(result['plans'][0]) == expected, seed


def test_recovery_records_origin_and_parks_dropped_time_as_unavailable():
    new, _, result = dropout(scenario(), 'ravi')
    applied, _, _ = approve_plan(new, result['plans'][0]['id'], 'coordinator', 'coordinator')
    assert applied.jobs['J-2231']['reassigned_from'] == ['ravi']
    date = applied.now[:10]
    assert applied.balances.get(f'tech:ravi:{date}:unavailable|TIME', 0) > 0
    assert applied.balances[f'tech:ravi:{date}:free|TIME'] == new.balances[f'tech:ravi:{date}:free|TIME']
    assert invariants(applied)
