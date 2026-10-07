"""The radar ranks by how bad a job's situation is, not by a points total that a dropout pushes to the ceiling for everyone."""
from api.app.modules.exceptions.domain import risk, risk_tier, dropout
from tests.exceptions.test_domain import scenario


def sig(*names):
    return [{'signal': n, 'points': 10} for n in names]


def test_tier_rules():
    assert risk_tier('P1', sig('Technician dropout')) == 'critical'
    assert risk_tier('P2', sig('Technician dropout')) == 'high'
    assert risk_tier('P3', sig('Projected SLA miss')) == 'critical'
    assert risk_tier('P1', sig('Low SLA margin')) == 'watch'
    assert risk_tier('P1', []) == 'ok'


def test_a_dropout_separates_the_p1_job_from_the_rest_and_names_who_to_plan_for():
    new, _, _ = dropout(scenario(), 'ravi')
    rows = risk(new)
    hit = [r for r in rows if r['technician_id'] == 'ravi' and any(s['signal'] == 'Technician dropout' for s in r['signals'])]
    assert hit and {r['tier'] for r in hit} >= {'critical'} and len({r['tier'] for r in hit}) > 1
    tiers = [r['tier'] for r in rows]
    assert tiers == sorted(tiers, key=['critical', 'high', 'watch', 'ok'].index)  # worst first
