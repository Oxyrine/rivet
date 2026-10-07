"""Turn the current state of a local database into a new starting seed.

History created through the API (for example 30 days of past jobs, run with the demo clock set back)
is wiped by the admin Reset, which restores the shipped seed. Bake that history into a seed file instead:

    python scripts/bake_fixture.py --database sqlite:///data/local-demo.db --out contract/fixtures/seeded.json

Then start the API with RIVET_FIXTURE=contract/fixtures/seeded.json and Reset restores the history too.
Operator data (who is linked to which sign-in, device queues, enrolled gate keys, uploaded files) is not baked.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from contract.canonical import GENESIS, digest, event_body, machine_view  # noqa: E402
from api.app.core.runtime import Store, fixture  # noqa: E402
from api.app.modules.ledger.domain import invariants  # noqa: E402

OPERATOR_METADATA = ('uploads', 'gate_keys', 'telemetry_ids')


def check_chain(events):
    """Every event must extend the tenant chain, and each machine's entries its own chain."""
    previous, per_machine = GENESIS, {}
    for index, event in enumerate(events, 1):
        if event['tenant_seq'] != index or event['prev_hash'] != previous or digest(previous, event_body(event)) != event['hash']:
            raise ValueError(f'Tenant chain breaks at event {index}')
        previous = event['hash']
        machine = event.get('machine')
        if machine:
            before = per_machine.get(machine, GENESIS)
            if event['machine_prev_hash'] != before or digest(before, machine_view(event)) != event['machine_hash']:
                raise ValueError(f'Machine chain for {machine} breaks at event {index}')
            per_machine[machine] = event['machine_hash']


def bake(store, out_path):
    seed = fixture()
    state = store.read()
    check_chain(state.events)
    invariants(state)
    baked = state.to_dict()
    baked['now'] = seed.now                      # the demo starts at the scripted morning, not at the end of the history run
    baked['users'] = seed.users                  # drops email and phone links
    baked['devices'] = seed.devices              # empty field queues
    baked['adapters'] = seed.adapters
    baked['metadata'] = {k: v for k, v in baked['metadata'].items() if k not in OPERATOR_METADATA}
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(baked, indent=2, ensure_ascii=False), encoding='utf-8')
    return {'out': str(out_path), 'jobs': len(state.jobs), 'events': len(state.events), 'machines': len(state.machines)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--database', default='sqlite:///data/local-demo.db')
    parser.add_argument('--out', default='contract/fixtures/seeded.json')
    args = parser.parse_args()
    print(bake(Store(args.database), args.out))
