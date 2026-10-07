"""Real sign-ins for the seeded demo users, created through Supabase's admin API.

A hosted server cannot use the demo code, so a demo needs actual accounts. They are created
from the server, which holds the service key; the browser never sees it. Passwords are random
and handed back once, and the addresses are plus-addressed variants of one inbox the operator
owns, so a reset email can only ever reach the operator.
"""
import os
import secrets
import httpx
from contract.errors import DomainError

# One account per role the demo walks through, plus the two technicians whose shifts are shown.
# The admin account is separate from the operator's own sign-in and is only offered for one-click entry when DEMO_ENTER_ADMIN=1.
DEMO_USERS = ('coordinator', 'manager', 'supervisor', 'requester', 'storekeeper', 'auditor', 'ravi', 'priya', 'admin')
ENTRY_USERS = DEMO_USERS[:-1]


def entry_users():
    """Who a visitor may enter as with one click. An admin can reset data and create accounts, so it needs its own switch."""
    return ENTRY_USERS + (('admin',) if os.getenv('DEMO_ENTER_ADMIN') == '1' else ())
TAG = '+rivet-'

_client = None


def admin_client():
    global _client
    _client = _client or httpx.Client(timeout=20)
    return _client


def _admin():
    url, key = os.getenv('SUPABASE_URL', '').rstrip('/'), os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not key:
        raise DomainError('NOT_CONFIGURED', 'SUPABASE_URL and SUPABASE_SERVICE_KEY must be set on the API to create accounts', status=409)
    return url + '/auth/v1/admin', {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


def demo_email(base, user_id):
    local, _, domain = base.strip().lower().partition('@')
    return f"{local.split('+')[0]}{TAG}{user_id}@{domain}"


def is_demo_email(email):
    return TAG in (email or '').split('@')[0]


def _find(client, base, headers, email):
    page = 1
    while True:
        response = client.get(f'{base}/users', params={'page': page, 'per_page': 200}, headers=headers)
        if response.status_code != 200:
            raise RuntimeError(f'Could not list accounts ({response.status_code})')
        users = response.json().get('users', [])
        for user in users:
            if (user.get('email') or '').lower() == email:
                return user
        if len(users) < 200:
            return None
        page += 1


def _reason(response):
    try:
        body = response.json()
        return str(body.get('msg') or body.get('message') or body.get('error_description') or body.get('error') or response.status_code)
    except ValueError:
        return str(response.status_code)


def provision(emails, client=None):
    """Create each account, or give an existing one a fresh password. Never raises for one bad account."""
    client = client or admin_client()
    base, headers = _admin()
    results = []
    for user_id, email in emails.items():
        password = secrets.token_urlsafe(9)
        try:
            created = client.post(f'{base}/users', json={'email': email, 'password': password, 'email_confirm': True, 'user_metadata': {'demo': True}}, headers=headers)
            if created.status_code in (200, 201):
                results.append({'user_id': user_id, 'email': email, 'password': password})
                continue
            existing = _find(client, base, headers, email)
            if not existing:
                results.append({'user_id': user_id, 'email': email, 'error': _reason(created)})
                continue
            updated = client.put(f"{base}/users/{existing['id']}", json={'password': password, 'email_confirm': True}, headers=headers)
            if updated.status_code == 200:
                results.append({'user_id': user_id, 'email': email, 'password': password})
            else:
                results.append({'user_id': user_id, 'email': email, 'error': _reason(updated)})
        except Exception as error:  # a network failure on one account must not hide the others
            results.append({'user_id': user_id, 'email': email, 'error': str(error) or error.__class__.__name__})
    return results


def entry_link(email, client=None):
    """A one-time Supabase login token for a demo account, so the browser can sign in without a password."""
    client = client or admin_client()
    base, headers = _admin()
    response = client.post(f'{base}/generate_link', json={'type': 'magiclink', 'email': email}, headers=headers)
    body = response.json() if response.status_code == 200 else {}
    if not body.get('hashed_token'):
        raise DomainError('ENTRY_UNAVAILABLE', 'The demo sign-in could not be prepared. Ask an administrator to create the demo logins again.', status=502)
    return {'token_hash': body['hashed_token'], 'verification_type': body.get('verification_type', 'magiclink')}


def remove(emails, client=None):
    """Delete the accounts. Returns the user ids whose account is gone (or never existed)."""
    client = client or admin_client()
    base, headers = _admin()
    gone = []
    for user_id, email in emails.items():
        existing = _find(client, base, headers, email)
        if not existing:
            gone.append(user_id)
            continue
        if client.delete(f"{base}/users/{existing['id']}", headers=headers).status_code in (200, 204):
            gone.append(user_id)
    return gone
