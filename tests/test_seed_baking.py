"""History created through the API must be able to become the starting seed, so Reset brings it back."""
import json
from pathlib import Path
import pytest
from api.app.core import runtime
from api.app.core.runtime import Store
from api.app.modules.ledger.domain import create_request, approve, assign
from scripts import bake_fixture


def url(tmp_path, name):
    return 'sqlite:///' + (tmp_path / name).as_posix()


def test_fixture_path_can_be_overridden_and_defaults_to_the_shipped_seed(monkeypatch, tmp_path):
    monkeypatch.delenv('RIVET_FIXTURE', raising=False)
    assert 'J-2231' not in runtime.fixture().jobs
    custom = tmp_path / 'custom.json'
    state = runtime.fixture(); state.metadata['marker'] = 'custom-seed'
    custom.write_text(json.dumps(state.to_dict()), encoding='utf-8')
    monkeypatch.setenv('RIVET_FIXTURE', str(custom))
    assert runtime.fixture().metadata['marker'] == 'custom-seed'


def test_baked_activity_becomes_the_seed_that_reset_restores(monkeypatch, tmp_path):
    monkeypatch.delenv('RIVET_FIXTURE', raising=False)
    source = Store(url(tmp_path, 'source.db'))
    source.mutate(lambda s: (create_request(s, {'machine_id': 'M-104'}), assign(s, 'J-2231', 'ravi')))
    source.mutate(lambda s: s.users['coordinator'].update(email='ops@example.com'))  # operator data must not travel
    out = tmp_path / 'seeded.json'
    summary = bake_fixture.bake(source, out)
    assert summary['jobs'] == len(source.read().jobs) and summary['events'] == len(source.read().events)

    baked = json.loads(out.read_text(encoding='utf-8'))
    assert all('email' not in u for u in baked['users'].values())
    assert baked['now'] == runtime.fixture().now and all(d['last_seq'] == 0 for d in baked['devices'].values())

    monkeypatch.setenv('RIVET_FIXTURE', str(out))
    fresh = Store(url(tmp_path, 'fresh.db'))
    assert 'J-2231' in fresh.read().jobs and fresh.read().technicians['ravi']['available']
    fresh.mutate(lambda s: s.requests.clear())
    fresh.reset()
    assert 'J-2231' in fresh.read().jobs and len(fresh.read().events) == summary['events']


def test_a_broken_event_chain_is_refused(tmp_path):
    source = Store(url(tmp_path, 'source.db'))
    source.mutate(lambda s: create_request(s, {'machine_id': 'M-104'}))

    def tamper(state):
        state.events[-1]['payload']['injected'] = 'edit after sealing'
    # Mutation of sealed events is rejected by the store itself, so corrupt a copy of the state.
    state = source.read(); tamper(state)
    with pytest.raises(ValueError, match='chain'):
        bake_fixture.check_chain(state.events)
