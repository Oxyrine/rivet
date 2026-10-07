"""Hosting readiness: secrets from the environment, Postgres connection rules, private evidence storage."""
import base64
from pathlib import Path
import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption
from api.app.core import runtime, storage
from api.app.modules.proof import package


def test_signing_key_comes_from_the_environment_and_never_touches_disk(monkeypatch, tmp_path):
    key = Ed25519PrivateKey.generate()
    monkeypatch.setenv('RIVET_SIGNING_KEY', base64.b64encode(key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())).decode())
    monkeypatch.setenv('RIVET_KEY_PATH', str(tmp_path / 'never-created' / 'provider.key'))
    expected = base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()
    assert package.public_key()['public_key'] == expected
    assert not (tmp_path / 'never-created').exists()


def test_a_malformed_signing_key_fails_loudly(monkeypatch):
    monkeypatch.setenv('RIVET_SIGNING_KEY', base64.b64encode(b'too short').decode())
    with pytest.raises(RuntimeError, match='RIVET_SIGNING_KEY'):
        package.signing_key()


def test_key_id_is_configurable(monkeypatch):
    monkeypatch.setenv('RIVET_KEY_ID', 'k-2026-10')
    assert package.public_key()['key_id'] == 'k-2026-10'


@pytest.mark.parametrize('given,expected', [
    ('postgres://u:p@db.example.com:5432/postgres', 'postgresql+psycopg://u:p@db.example.com:5432/postgres'),
    ('postgresql://u:p@db.example.com:6543/postgres', 'postgresql+psycopg://u:p@db.example.com:6543/postgres'),
    ('postgresql+psycopg://u:p@h/db', 'postgresql+psycopg://u:p@h/db'),
    ('sqlite:///data/x.db', 'sqlite:///data/x.db'),
])
def test_database_urls_are_normalised_for_psycopg(given, expected):
    assert runtime.database_url(given) == expected


def test_postgres_connections_disable_prepared_statements_for_pooler_safety():
    assert runtime.engine_options('postgresql+psycopg://u:p@h/db')['connect_args'] == {'prepare_threshold': None}
    assert runtime.engine_options('sqlite:///x.db')['connect_args']['check_same_thread'] is False


def test_every_application_table_gets_row_level_security():
    statements = runtime.rls_statements()
    tables = {'tenant_state', 'event', 'ledger_entry', 'outbox', 'idempotency'}
    assert tables == {s.split()[2] for s in statements}
    assert all(s.endswith('ENABLE ROW LEVEL SECURITY') for s in statements)


def supabase(handler):
    return storage.SupabaseStorage('https://proj.supabase.co', 'service-secret', 'evidence', client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_supabase_storage_uploads_privately_and_reads_back():
    seen = []
    def handler(request):
        seen.append(request)
        if request.method == 'POST':
            return httpx.Response(200, json={'Key': 'evidence/abc'})
        return httpx.Response(200, content=b'bytes')
    store = supabase(handler)
    store.put('abc', b'bytes')
    assert store.get('abc') == b'bytes'
    post = seen[0]
    assert str(post.url) == 'https://proj.supabase.co/storage/v1/object/evidence/abc'
    assert post.headers['authorization'] == 'Bearer service-secret' and post.headers['x-upsert'] == 'false'


def test_supabase_storage_treats_an_existing_object_as_success_and_a_missing_one_as_none():
    store = supabase(lambda r: httpx.Response(400, json={'statusCode': '409', 'error': 'Duplicate', 'message': 'The resource already exists'}) if r.method == 'POST' else httpx.Response(400, json={'statusCode': '404', 'error': 'not_found'}))
    store.put('abc', b'bytes')
    assert store.get('abc') is None


def test_supabase_storage_errors_are_not_swallowed():
    store = supabase(lambda r: httpx.Response(500, text='boom'))
    with pytest.raises(RuntimeError):
        store.put('abc', b'bytes')
    with pytest.raises(RuntimeError):
        store.get('abc')


def test_evidence_store_selection_follows_the_environment(monkeypatch, tmp_path):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.setenv('EVIDENCE_DIR', str(tmp_path / 'e'))
    local = storage.evidence_store()
    local.put('k', b'v')
    assert local.get('k') == b'v' and (tmp_path / 'e' / 'k').read_bytes() == b'v' and local.get('missing') is None
    monkeypatch.setenv('SUPABASE_URL', 'https://proj.supabase.co/')
    monkeypatch.setenv('SUPABASE_SERVICE_KEY', 'secret')
    assert isinstance(storage.evidence_store(), storage.SupabaseStorage)


def test_database_health_check_reports_reachable_and_does_not_need_a_login():
    from fastapi.testclient import TestClient
    from api.app.main import app
    with TestClient(app) as client:
        response = client.get('/health/db')
        assert response.status_code == 200 and response.json() == {'status': 'ok', 'database': 'reachable'}
        assert client.get('/health').json()['status'] == 'ok'  # the cheap check Render polls stays independent of the database
