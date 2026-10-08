"""Leave part of the shift unplanned in the shipped seed, so the demo can assign work live.

Three jobs are released back to "approved, waiting for a technician" (through the real reschedule command, so each carries
a JobRescheduled event). With Arjun, the approved contractor and Karthik holding no jobs, the control room has work to assign and people to give it to.

    python scripts/seed_demo_floor.py

The store is stocked to match: planned parts are reserved for the jobs that already have a technician, and wait on the jobs that do not
(they are reserved the moment someone is assigned). The jack, a tool every assignment holds, goes from one to three so the demo can assign more than one job.

Run it once against the plain M-104 seed; it refuses to run twice.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from contract.state import LedgerState  # noqa: E402
from api.app.modules.ledger.domain import invariants, hold  # noqa: E402
from api.app.modules.workflow import commands  # noqa: E402

PATH = ROOT / 'contract/fixtures/m104.json'
UNPLANNED = ('J-2253', 'J-2257', 'J-2260')
# Parts each job needs. Ravi's jobs stay as they were: the M-104 dropout story is built on them.
RESERVED = {'J-2254': {'PART-03': 1}, 'J-2255': {'PART-05': 2}, 'J-2256': {'PART-07': 1}, 'J-2258': {'PART-09': 1}}
WAITING = {'J-2253': {'PART-04': 1}, 'J-2257': {'PART-06': 2}, 'J-2260': {'PART-08': 1}}


def apply(path=PATH):
    raw = json.loads(path.read_text(encoding='utf-8'))
    state = LedgerState.from_dict(raw)
    if state.metadata.get('demo_floor'): raise SystemExit('The seed already has an unplanned demo floor')
    for job_id in UNPLANNED:
        commands.reschedule(state, job_id, {'reason': 'Released at the start of the shift: waiting for a technician'}, 'coordinator')
    for job_id, parts in {**RESERVED, **WAITING}.items(): state.jobs[job_id]['planned_parts'] = dict(parts)
    for job_id, parts in RESERVED.items():
        for resource, quantity in parts.items():
            hold(state, {'job_id': job_id, 'source': 'store:site-b:available', 'resource': resource, 'quantity': quantity, 'actor': 'coordinator'})
    state.balances['store:site-b:available|JACK'] = 3
    state.metadata['initial_resource_totals']['JACK'] = 3
    state.metadata['demo_floor'] = list(UNPLANNED)
    invariants(state)
    path.write_text(json.dumps(state.to_dict(), indent=2, ensure_ascii=False), encoding='utf-8')
    return state


if __name__ == '__main__':
    done = apply()
    print({j: (done.jobs[j]['state'], done.jobs[j]['technician_id']) for j in UNPLANNED})
