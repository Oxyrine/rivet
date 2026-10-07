"""Private, content-addressed evidence bytes: local disk for development, Supabase Storage when hosted.

Objects are named by the SHA-256 of their content, so a retried upload is harmless and a
changed file can never be mistaken for the original. Callers re-check the hash on every read.
"""
import os
from pathlib import Path
import httpx
from .runtime import ROOT


class LocalStorage:
    def __init__(self, directory):
        self.directory = Path(directory)

    def put(self, key, content):
        self.directory.mkdir(parents=True, exist_ok=True)
        try:
            with (self.directory / key).open('xb') as file:  # exclusive create: never rewrite a hash-named object
                file.write(content)
        except FileExistsError:
            pass

    def get(self, key):
        path = self.directory / key
        return path.read_bytes() if path.is_file() else None


def _body(response):
    try:
        return response.json() if response.content else {}
    except ValueError:
        return {}


class SupabaseStorage:
    """Talks to a private bucket with the service key. That key stays on the server and never reaches a browser."""

    def __init__(self, url, service_key, bucket, client=None):
        self.base = f'{url.rstrip("/")}/storage/v1/object/{bucket}/'
        self.headers = {'Authorization': f'Bearer {service_key}', 'apikey': service_key}
        self.client = client or httpx.Client(timeout=20)

    def put(self, key, content):
        response = self.client.post(self.base + key, content=content, headers={**self.headers, 'Content-Type': 'application/octet-stream', 'x-upsert': 'false'})
        if response.status_code == 200:
            return
        body = _body(response)
        if response.status_code in (400, 409) and (str(body.get('statusCode')) == '409' or body.get('error') == 'Duplicate'):
            return  # same bytes were stored by an earlier attempt
        raise RuntimeError(f'Evidence upload failed ({response.status_code})')

    def get(self, key):
        response = self.client.get(self.base + key, headers=self.headers)
        if response.status_code == 200:
            return response.content
        body = _body(response)
        if response.status_code == 404 or str(body.get('statusCode')) == '404' or body.get('error') == 'not_found':
            return None
        raise RuntimeError(f'Evidence download failed ({response.status_code})')


_shared_client = None


def evidence_store():
    url, key = os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY')
    if url and key:
        global _shared_client
        _shared_client = _shared_client or httpx.Client(timeout=20)
        return SupabaseStorage(url, key, os.getenv('EVIDENCE_BUCKET', 'evidence'), client=_shared_client)
    return LocalStorage(os.getenv('EVIDENCE_DIR', str(ROOT / 'data/evidence')))
