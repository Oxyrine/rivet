"""The storekeeper's view: what is on the shelf, what each technician's jobs need, and the three things a store does (issue to a job, top up a van, receive stock)."""
import re
from fastapi import APIRouter, Depends, Request
from contract.errors import DomainError
from contract.lifecycle import WORK_DONE
from contract.state import emit
from api.app.core.runtime import store
from api.app.core.auth import require_roles
from api.app.modules.ledger.domain import move

router = APIRouter(tags=['Stores'])
read = require_roles('storekeeper', 'coordinator', 'manager', 'auditor')
keeper = require_roles('storekeeper')  # admin passes every role check

NAMES = {'HS-40': 'Hydraulic seal kit', 'O-RING': 'O-ring set', 'JACK': 'Hydraulic jack'}
HOLDS = ('PART_HOLD', 'TOOL_HOLD')
LIVE = ('HELD', 'ACTIVE')
LOW = 2


def _shelves(s, sites):
    """Per store: each resource with what is free on the shelf and what is held back for jobs."""
    held = {}
    for c in s.commitments.values():
        if c.get('type') in HOLDS and c.get('state') in LIVE and str(c.get('source', '')).startswith('store:'):
            key = (c['source'], c['resource'])
            still_reserved = s.balances.get(f"job:{c['job_id']}:reserved|{c['resource']}", 0)  # units already issued are no longer held back
            held[key] = held.get(key, 0) + min(c['quantity'], still_reserved)
    shelves = {}
    for key, qty in s.balances.items():
        account, _, resource = key.partition('|')
        parts = account.split(':')
        if parts[0] != 'store' or parts[-1] != 'available' or parts[1] not in sites: continue
        row = {'resource': resource, 'name': NAMES.get(resource), 'available': qty, 'held': held.get((account, resource), 0)}
        row['low'] = qty < LOW
        shelves.setdefault(parts[1], []).append(row)
    for rows in shelves.values(): rows.sort(key=lambda r: r['resource'])
    return [{'site_id': site, 'name': s.sites.get(site, {}).get('name', site), 'stock': shelves[site]} for site in sorted(shelves)]


def _needs(s, sites):
    """One row per part or tool a live job needs, with who needs it and whether the store can hand it over."""
    rows = []
    for job in s.jobs.values():
        if job.get('state') in WORK_DONE: continue
        tech = s.technicians.get(job.get('technician_id'), {})
        holds = [c for c in s.commitments.values() if c.get('job_id') == job['id'] and c.get('type') in HOLDS and c.get('state') in LIVE]
        base = {'job_id': job['id'], 'machine_id': job['machine_id'], 'site_id': job['site_id'], 'priority': job.get('priority'), 'job_state': job['state'],
                'technician_id': job.get('technician_id'), 'technician': tech.get('name'), 'planned_start': job.get('planned_start')}
        for resource, needed in (job.get('planned_parts') or {}).items():
            hold = next((c for c in holds if c['type'] == 'PART_HOLD' and c['resource'] == resource), None)
            issued = job.get('issued_parts', {}).get(resource, 0)
            site = hold['physical_location'] if hold else 'site-b'
            if site not in sites: continue
            status = 'issued' if issued >= needed else 'ready' if hold else 'waiting'
            rows.append({**base, 'kind': 'part', 'resource': resource, 'name': NAMES.get(resource), 'needed': needed, 'issued': issued, 'outstanding': max(0, needed - issued), 'status': status, 'store_site': site})
        for hold in holds:
            if hold['type'] == 'TOOL_HOLD' and hold['physical_location'] in sites:
                rows.append({**base, 'kind': 'tool', 'resource': hold['resource'], 'name': NAMES.get(hold['resource']), 'needed': hold['quantity'], 'issued': 0, 'outstanding': hold['quantity'], 'status': 'ready', 'store_site': hold['physical_location']})
    rows.sort(key=lambda r: (r['technician'] is None, r['planned_start'] or '9', r['job_id'], r['resource']))
    return rows


@router.get('/stores/overview')
def overview(p=Depends(read)):
    s = store.read()
    sites = set(p['sites'])
    vans = {}
    for key, qty in s.balances.items():
        account, _, resource = key.partition('|')
        if account.startswith('van:') and qty > 0:
            tid = account.split(':')[1]
            vans.setdefault(tid, []).append({'resource': resource, 'name': NAMES.get(resource), 'quantity': qty})
    return {'stores': _shelves(s, sites), 'needs': _needs(s, sites),
            'vans': [{'technician_id': tid, 'technician': s.technicians.get(tid, {}).get('name', tid), 'stock': rows} for tid, rows in sorted(vans.items())],
            'technicians': [{'id': t['id'], 'name': t['name']} for t in s.technicians.values()]}


def _positive(body, key='quantity'):
    value = body.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or not 0 < value <= 1000:
        raise DomainError('INVALID_QUANTITY', 'Quantity must be a whole number from 1 to 1000', status=422)
    return value


def _site(s, body, p, resource):
    site = body.get('site_id') or next((x for x in sorted(p['sites']) if f'store:{x}:available|{resource}' in s.balances), None)
    if site not in p['sites'] or not any(k.startswith(f'store:{site}:available|') for k in s.balances):
        raise DomainError('STORE_SCOPE', 'That store is outside your scope', status=403)
    return site


def _run(request, p, body, fn):
    key = request.headers.get('Idempotency-Key')
    return store.mutate(fn, key=f"{p['user_id']}:{key}" if key else None, body={'path': request.url.path, 'body': body})


@router.post('/stores/receive')
def receive(body: dict, request: Request, p=Depends(keeper)):
    """Goods in from a supplier. The units enter the books through an inbound account, so the journal still balances."""
    resource = str(body.get('resource') or '').strip().upper()
    if not re.fullmatch(r'[A-Z0-9][A-Z0-9-]{1,23}', resource): raise DomainError('INVALID_RESOURCE', 'Give the part code, for example HS-40', status=422)
    quantity = _positive(body)

    def fn(s):
        site = _site(s, body, p, resource)
        inbound = 'supplier:inbound'
        s.balances[f'{inbound}|{resource}'] = s.balances.get(f'{inbound}|{resource}', 0) + quantity
        totals = s.metadata.setdefault('initial_resource_totals', {})
        totals[resource] = totals.get(resource, 0) + quantity
        move(s, inbound, f'store:{site}:available', resource, quantity, p['user_id'])
        emit(s, 'StockReceived', None, {'resource': resource, 'quantity': quantity, 'store_site': site, 'reference': str(body.get('reference') or '')[:60]}, p['user_id'])
        return {'resource': resource, 'quantity': quantity, 'store_site': site, 'available': s.balances[f'store:{site}:available|{resource}']}
    return _run(request, p, body, fn)


@router.post('/stores/van-issue')
def van_issue(body: dict, request: Request, p=Depends(keeper)):
    """Stock a technician's van. Van stock is what a technician may later explain as 'used van stock' on a report."""
    resource = str(body.get('resource') or '').strip().upper()
    quantity = _positive(body)

    def fn(s):
        tid = body.get('technician_id')
        if tid not in s.technicians: raise DomainError('NOT_FOUND', 'Technician not found', status=404)
        site = _site(s, body, p, resource)
        move(s, f'store:{site}:available', f'van:{tid}:stock', resource, quantity, p['user_id'])
        emit(s, 'StoreIssued', None, {'resource': resource, 'quantity': quantity, 'store_site': site, 'technician_id': tid}, p['user_id'])
        return {'technician_id': tid, 'resource': resource, 'quantity': quantity, 'van_stock': s.balances[f'van:{tid}:stock|{resource}']}
    return _run(request, p, body, fn)
