"""Measured next-job-only baseline against the same recorded disruption scenarios."""
import json
import random
from pathlib import Path
from scripts.bootstrap_fixture import fixture
from api.app.modules.ledger.domain import create_request, assign
from .domain import impact, recovery


def measure(seeds=100):
    rows=[]
    for seed in range(seeds):
        rng=random.Random(seed); state=fixture()
        create_request(state,{'machine_id':'M-104','fault':'hydraulic_leak'});assign(state,'J-2231','ravi')
        # Vary real travel inputs; the two methods receive the exact same state.
        for tid in ('priya','karthik'):state.technicians[tid]['travel_minutes']+=rng.randint(0,7)
        state.technicians['ravi']['available']=False
        affected=impact(state,'ravi')['affected_jobs']
        next_job=min((state.jobs[j] for j in affected),key=lambda j:j.get('planned_start',state.now))
        baseline_seen={next_job['id']}; missed=set(affected)-baseline_seen
        result=recovery(state,'ravi');top=result['plans'][0] if result['plans'] else None
        rows.append({'seed':seed,'affected_jobs':affected,'baseline_recovered_jobs':sorted(baseline_seen),
                     'baseline_missed_jobs':sorted(missed),'baseline_unserved_sla_breaches':len(missed),
                     'joint_projected_sla_breaches':top['misses_total'] if top else len(affected)})
    affected_total=sum(len(r['affected_jobs']) for r in rows)
    missed_total=sum(len(r['baseline_missed_jobs']) for r in rows)
    return {'method':'next-job-only reassignment versus joint recovery of recorded dependencies',
            'assumption':'An unrecovered job assigned to the dropped-out technician remains unserved through its SLA deadline.',
            'seeds':seeds,'affected_job_count':affected_total,'baseline_missed_job_count':missed_total,
            'baseline_missed_percent':missed_total*100//affected_total if affected_total else 0,
            'baseline_unserved_sla_breaches':sum(r['baseline_unserved_sla_breaches'] for r in rows),
            'joint_projected_sla_breaches':sum(r['joint_projected_sla_breaches'] for r in rows),'runs':rows}


if __name__=='__main__':
    target=Path('reports/baseline.json');target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(measure(),indent=2),encoding='utf-8')
    print(f'Measured 100 seeded disruptions: {target}')
