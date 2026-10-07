"""Recorded-dependency impact analysis and bounded, deterministic joint recovery.

Read helpers are pure. Command helpers return a detached state and new events;
the HTTP boundary copies that state into the transactional runtime.
"""
from collections import deque
from datetime import timedelta
from itertools import product
from hashlib import sha256
from time import monotonic
from contract.canonical import canonical
from contract.errors import DomainError
from contract.sla import instant
from contract.state import emit

TERMINAL = {'closed', 'cancelled', 'completed'}
ACTIVE = {'HELD', 'ACTIVE', 'COMMITTED', 'BREACHED'}


def fingerprint(state):
    raw = canonical({'jobs': state.jobs, 'commitments': state.commitments,
                     'technicians': state.technicians, 'balances': state.balances,
                     'now': state.now, 'contracts': state.contracts})
    return sha256(raw.encode() if isinstance(raw, str) else raw).hexdigest()


def impact(state, technician_id=None, commitment_id=None, horizon_hours=48):
    """Walk reverse edges; synthetic root links only recorded technician commitments."""
    if technician_id and technician_id not in state.technicians:
        raise DomainError('NOT_FOUND', 'Technician does not exist', status=404)
    if commitment_id and commitment_id not in state.commitments:
        raise DomainError('NOT_FOUND', 'Commitment does not exist', status=404)
    end = instant(state.now) + timedelta(hours=horizon_hours)
    valid = {cid: c for cid, c in state.commitments.items()
             if c.get('state') in ACTIVE and (not c.get('starts_at') or instant(c['starts_at']) <= end)}
    roots = [commitment_id] if commitment_id else [cid for cid, c in valid.items()
        if c.get('type') in {'TECH_ASSIGN', 'TECHNICIAN_TIME', 'TIME_HOLD', 'TECH_TIME'}
        and (c.get('owner') == technician_id or c.get('resource') == technician_id or c.get('technician_id') == technician_id)]
    reverse = {}
    for cid, c in valid.items():
        for dependency in c.get('depends_on', []):
            reverse.setdefault(dependency, []).append(cid)
    walked, edges, queue = set(), [], deque(roots)
    while queue:
        cid = queue.popleft()
        if cid in walked or cid not in valid: continue
        walked.add(cid)
        for dependent in reverse.get(cid, []):
            edges.append({'source': cid, 'target': dependent})
            queue.append(dependent)
    jobs = sorted({valid[c].get('job_id') for c in walked if valid[c].get('job_id') in state.jobs
                   and state.jobs[valid[c]['job_id']].get('state') not in TERMINAL})
    unaffected = sorted(j['id'] for j in state.jobs.values() if j.get('state') not in TERMINAL and j['id'] not in jobs)
    return {'technician_id': technician_id, 'roots': sorted(roots), 'affected_jobs': jobs,
            'unaffected_jobs': unaffected, 'commitments_walked': len(walked),
            'part_holds_affected': sum(valid[c].get('type') == 'PART_HOLD' for c in walked),
            'nodes': [dict(valid[c], id=c) for c in sorted(walked)], 'edges': edges,
            'horizon_hours': horizon_hours}


def skill_required(job):
    return 'hydraulics' if 'hydraulic' in job.get('fault', '') else 'gearbox'


def rejection(state, job, tech):
    if not tech.get('available', True): return 'Technician is unavailable or has dropped out'
    if not tech.get('certificate_valid', False): return 'Certification expired'
    if tech.get('certificate_expires', '9999') < state.now[:10]: return 'Certification expired'
    if tech.get('skills', {}).get(skill_required(job), 0) < job.get('required_level', 2): return 'Required skill level is missing'
    if tech.get('travel_minutes', 0) > state.metadata.get('max_travel_minutes', 90): return 'Travel exceeds the 90-minute limit'
    if tech.get('contractor') and (not tech.get('approved', False) or job['site_id'] not in tech.get('sites', [])):
        return 'Contractor is not approved for this site'
    return None


def _finish_slot(state, job, tech, intervals):
    arrival = instant(state.now) + timedelta(minutes=tech.get('travel_minutes', 0))
    start = max(arrival, instant(job.get('planned_start', state.now)))
    duration = timedelta(minutes=job.get('duration_minutes', 60))
    for lo, hi in sorted(intervals):
        if start + duration <= lo: break
        if start < hi and start + duration > lo: start = hi
    finish = start + duration
    shift_end = instant(tech.get('shift_end', state.now)) if tech.get('shift_end') else instant(state.now).replace(hour=12, minute=30, second=0)
    if finish > shift_end + timedelta(minutes=state.metadata.get('max_overtime_minutes', 60)): return None
    return start, finish


def rank_key(plan):
    return (*[plan['sla_misses'].get(p, 0) for p in ('P1', 'P2', 'P3')],
            plan['penalty_paise'], plan['commitments_changed'], plan['added_travel_minutes'],
            plan.get('continuity_cost', 0), plan.get('signature', ''))


def _simulate(state, jobs, tech_ids):
    affected = {j['id'] for j in jobs}
    busy = {tid: [] for tid in state.technicians}
    for j in state.jobs.values():
        if j['id'] in affected or j.get('state') in TERMINAL or not j.get('technician_id'): continue
        start = instant(j.get('planned_start', state.now))
        busy.setdefault(j['technician_id'], []).append((start, start + timedelta(minutes=j.get('duration_minutes', 60))))
    assignments, misses, penalty, travel, changes, continuity = [], dict(P1=0, P2=0, P3=0), 0, 0, 0, 0
    used_slots, part_actions, stock = {}, [], dict(state.balances)
    for job, tid in zip(jobs, tech_ids):
        tech = state.technicians[tid]
        used_slots[tid] = used_slots.get(tid, 0) + (job.get('duration_minutes', 60)+14)//15
        available = state.balances.get(f'tech:{tid}:{state.now[:10]}:free|TIME', 0)
        if used_slots[tid] > available: return None
        for resource, quantity in job.get('planned_parts', {}).items():
            holds = [c for c in state.commitments.values() if c.get('job_id') == job['id'] and c.get('resource') == resource and c.get('state') in ACTIVE]
            accessible = [c for c in holds if not c.get('collected') and not str(c.get('physical_location', '')).startswith(('van:', 'custody:'))]
            held = sum(c.get('quantity', 0) for c in accessible)
            if held >= quantity:
                for c in accessible: part_actions.append({'type': 'TRANSFER_HOLD', 'commitment_id': c['id'], 'job_id': job['id'], 'owner': tid})
            else:
                needed = quantity-held
                sources = sorted(key for key in stock if key.endswith('|'+resource) and ':available|' in key and stock[key] >= needed)
                if not sources: return None
                selected = sources[0]; stock[selected] -= needed
                part_actions.append({'type': 'RESOURCE_PART', 'job_id': job['id'], 'resource': resource, 'source': selected.rsplit('|', 1)[0], 'quantity': needed, 'owner': tid})
                changes += 1
        slot = _finish_slot(state, job, tech, busy[tid])
        if not slot: return None
        start, finish = slot
        busy[tid].append(slot)
        late_seconds = max(0, int((finish - instant(job['deadline'])).total_seconds()))
        contract = state.contracts.get(job.get('priority', 'P2'), {})
        units = (late_seconds + contract.get('penalty_unit_minutes', 15)*60-1)//(contract.get('penalty_unit_minutes', 15)*60)
        charge = min(units * contract.get('penalty_rate_paise', 0), contract.get('penalty_cap_paise', 0))
        if late_seconds: misses[job.get('priority', 'P2')] = misses.get(job.get('priority', 'P2'), 0)+1
        penalty += charge
        travel += tech.get('travel_minutes', 0)
        changes += int(tid != job.get('technician_id'))
        continuity += int(tid not in job.get('previous_technicians', []))
        assignments.append({'job_id': job['id'], 'technician_id': tid, 'technician_name': tech['name'],
            'planned_start': start.isoformat(), 'projected_finish': finish.isoformat(),
            'late_minutes': (late_seconds+59)//60, 'penalty_paise': charge, 'priority': job.get('priority', 'P2')})
    needs_manager = any(state.technicians[t].get('contractor') for t in tech_ids)
    changes += int(needs_manager)
    signature = '|'.join(f"{a['job_id']}:{a['technician_id']}:{a['planned_start']}" for a in assignments)
    return {'assignments': assignments, 'part_actions': part_actions, 'sla_misses': misses, 'misses_total': sum(misses.values()),
            'penalty_paise': penalty, 'commitments_changed': changes, 'added_travel_minutes': travel,
            'continuity_cost': continuity, 'needs_manager': needs_manager,
            'contractor_fee_paise': sum(state.technicians[t].get('fee_paise', 0) for t in set(tech_ids)),
            'signature': signature, 'confidence': 'Duration is estimated from seeded service history; confirm field conditions.'}


def recovery(state, technician_id, limit=10, time_budget_seconds=2):
    affected = impact(state, technician_id)
    jobs = sorted((state.jobs[j] for j in affected['affected_jobs']), key=lambda j: (j['deadline'], j['id']))
    rejected, choices = [], []
    for job in jobs:
        allowed = []
        for tid, tech in state.technicians.items():
            reason = 'Technician has dropped out' if tid == technician_id else rejection(state, job, tech)
            if reason: rejected.append({'job_id': job['id'], 'technician_id': tid, 'candidate': tech['name'], 'reason': reason})
            else: allowed.append(tid)
        choices.append(sorted(allowed, key=lambda t: (state.technicians[t].get('travel_minutes', 0), t))[:5])
        if job.get('priority') == 'P1': rejected.append({'job_id': job['id'], 'candidate': 'Reschedule to tomorrow', 'reason': 'P1 jobs cannot be rescheduled by recovery'})
        for c in state.commitments.values():
            if c.get('type') != 'PART_HOLD' or c.get('job_id') == job['id']: continue
            owner = state.jobs.get(c.get('job_id'), {})
            if owner.get('on_site') or owner.get('priority', 'P3') <= job.get('priority', 'P2'):
                rejected.append({'job_id': job['id'], 'candidate': f"Part hold from {owner.get('id', c.get('job_id'))}", 'reason': 'Part belongs to an equal/higher-priority or already on-site job'})
    candidates, examined, truncated = [], 0, False
    started = monotonic()
    if jobs and all(choices):
        for combination in product(*choices):
            if monotonic()-started > time_budget_seconds:
                truncated = True; break
            examined += 1
            plan = _simulate(state, jobs, combination)
            if plan: candidates.append(plan)
    candidates.sort(key=rank_key)
    version = fingerprint(state)
    for index, plan in enumerate(candidates):
        plan['rank'] = index+1
        plan['id'] = 'plan-' + sha256((version+plan['signature']).encode()).hexdigest()[:16]
        plan['state_version'] = version
        plan['technician_id'] = technician_id
        plan['explanation'] = f"{plan['misses_total']} projected SLA misses; ₹{plan['penalty_paise']//100:,} penalty exposure; {plan['commitments_changed']} commitments changed."
    return {'impact': affected, 'plans': candidates[:limit], 'rejected': rejected,
            'combinations_examined': examined, 'truncated': truncated,
            'no_feasible_path': bool(jobs) and not candidates,
            'message': 'No feasible recovery. Escalate to the service manager; existing reservations were preserved.' if jobs and not candidates else None}


def dropout(state, technician_id, reason='Reported unavailable', actor='coordinator'):
    new = state.clone(); before = len(new.events)
    if technician_id not in new.technicians: raise DomainError('NOT_FOUND', 'Technician does not exist', status=404)
    if not new.technicians[technician_id].get('available', True):
        return new, [], recovery(new, technician_id)
    affected = impact(new, technician_id)
    new.technicians[technician_id]['available'] = False
    breach_id = f"breach-{len(new.breaches)+1:04d}"
    new.breaches[breach_id] = {'id': breach_id, 'type': 'TECHNICIAN_DROPOUT', 'technician_id': technician_id,
                              'reason': reason, 'state': 'OPEN', 'affected_jobs': affected['affected_jobs'], 'occurred_at': new.now}
    for c in affected['nodes']:
        if c['id'] in affected['roots']: new.commitments[c['id']]['state'] = 'BREACHED'
    for jid in affected['affected_jobs']:
        new.jobs[jid]['at_risk'] = True
        emit(new, 'CommitmentBreached', new.jobs[jid]['machine_id'], {'breach_id': breach_id, 'job_id': jid, 'technician_id': technician_id, 'reason': reason}, actor)
    result = recovery(new, technician_id)
    for plan in result['plans']: new.plans[plan['id']] = plan
    emit(new, 'RecoveryProposed', payload={'breach_id': breach_id, 'plan_ids': [p['id'] for p in result['plans']], 'affected_jobs': affected['affected_jobs']}, actor=actor)
    return new, new.events[before:], dict(result, breach_id=breach_id)


def approve_plan(state, plan_id, role, actor):
    plan = state.plans.get(plan_id)
    if not plan: raise DomainError('PLAN_NOT_FOUND', 'Generate a recovery plan before approval', status=404)
    if plan.get('needs_manager') and role not in {'manager', 'admin'}:
        raise DomainError('MANAGER_REQUIRED', 'Contractor recovery requires service-manager approval', status=403)
    if plan['state_version'] != fingerprint(state): raise DomainError('STALE_PLAN', 'Availability or reservations changed. Refresh the recovery plans.')
    new = state.clone(); before = len(new.events)
    from api.app.modules.ledger.domain import move
    for assignment in plan['assignments']:
        job = new.jobs[assignment['job_id']]
        if rejection(new, job, new.technicians[assignment['technician_id']]): raise DomainError('INFEASIBLE_PLAN', 'Technician is no longer eligible')
        for c in list(new.commitments.values()):
            if c.get('job_id') == job['id'] and c.get('type') in {'TECH_ASSIGN', 'TECHNICIAN_TIME', 'TIME_HOLD', 'TECH_TIME'} and c.get('state') in ACTIVE:
                source = c.get('reservation_account', f"job:{job['id']}:allocated")
                target = c.get('source', f"tech:{job.get('technician_id')}:{new.now[:10]}:free")
                owner = new.technicians.get(c.get('owner'), {})
                # A technician who dropped out cannot work these slots, so they never return to free.
                if owner and not owner.get('available', True): target = f"tech:{c['owner']}:{new.now[:10]}:unavailable"
                quantity = c.get('quantity', 0)
                if quantity and new.balances.get(source+'|TIME', 0) >= quantity:
                    move(new, source, target, 'TIME', quantity, actor)
                c['state'] = 'RELEASED'
        old = job.get('technician_id'); tid = assignment['technician_id']
        if old and old != tid and old not in job.setdefault('reassigned_from', []): job['reassigned_from'].append(old)
        quantity = (job.get('duration_minutes', 60)+14)//15
        source, destination = f'tech:{tid}:{new.now[:10]}:free', f"job:{job['id']}:allocated"
        move(new, source, destination, 'TIME', quantity, actor)
        cid = f"recovery-{plan_id}-{job['id']}"
        new.commitments[cid] = {'id': cid, 'type': 'TECH_ASSIGN', 'job_id': job['id'], 'resource': 'TIME',
            'owner': tid, 'state': 'HELD', 'quantity': quantity, 'source': source, 'reservation_account': destination,
            'starts_at': assignment['planned_start'], 'ends_at': assignment['projected_finish'], 'depends_on': []}
        job.update(technician_id=tid, planned_start=assignment['planned_start'], projected_finish=assignment['projected_finish'], at_risk=assignment['late_minutes']>0)
        emit(new, 'RecoveryApplied', job['machine_id'], {'job_id': job['id'], 'plan_id': plan_id, 'previous_technician_id': old, **assignment}, actor)
    from api.app.modules.ledger.domain import hold
    for action in plan.get('part_actions', []):
        if action['type'] == 'TRANSFER_HOLD':
            c = new.commitments[action['commitment_id']]
            c['owner'] = action['owner']
            c['depends_on'] = [f"recovery-{plan_id}-{action['job_id']}" if dependency.startswith(('time:', 'recovery-')) else dependency for dependency in c.get('depends_on', [])]
            emit(new, 'HoldTransferred', new.jobs[action['job_id']]['machine_id'], action, actor)
        else:
            hold(new, {**action, 'type': 'PART_HOLD', 'actor': actor})
    # Record sequential dependency edges among the freshly allocated slots.
    for tid in {a['technician_id'] for a in plan['assignments']}:
        slots = sorted((c for c in new.commitments.values() if c.get('owner') == tid and c.get('type') in {'TECH_TIME', 'TECH_ASSIGN'} and c.get('state') in {'HELD', 'ACTIVE'}), key=lambda c: c.get('starts_at', new.jobs[c['job_id']].get('planned_start', new.now)))
        for earlier, later in zip(slots, slots[1:]):
            if earlier['id'] not in later['depends_on']: later['depends_on'].append(earlier['id'])
    for assignment in plan['assignments']:
        cid = f"recovery-{plan_id}-{assignment['job_id']}"
        for commitment in new.commitments.values():
            if commitment.get('job_id') == assignment['job_id'] and commitment.get('type') == 'SLA_WINDOW':
                commitment['depends_on'] = [dependency for dependency in commitment.get('depends_on', []) if not dependency.startswith(('time:', 'recovery-'))] + [cid]
    for breach in new.breaches.values():
        if breach.get('technician_id') == plan['technician_id'] and breach.get('state') == 'OPEN': breach['state'] = 'RECOVERED'
    new.plans[plan_id]['approved_by'] = actor
    return new, new.events[before:], {'approved': True, 'plan_id': plan_id, 'assignments': plan['assignments']}


def risk(state):
    rows = []
    for job in state.jobs.values():
        if job.get('state') in TERMINAL: continue
        tech = state.technicians.get(job.get('technician_id'), {})
        signals = []
        if not tech.get('available', True): signals.append({'signal': 'Technician dropout', 'points': 60, 'detail': f"{tech.get('name', 'Assigned technician')} is unavailable"})
        if not job.get('technician_id'): signals.append({'signal': 'Unassigned', 'points': 35, 'detail': 'No technician reservation'})
        finish = instant(job.get('projected_finish', job.get('planned_start', state.now))) + (timedelta() if job.get('projected_finish') else timedelta(minutes=job.get('duration_minutes', 60)))
        margin = int((instant(job['deadline'])-finish).total_seconds())//60
        if margin < 0: signals.append({'signal': 'Projected SLA miss', 'points': 35, 'detail': f'{-margin} minutes beyond deadline'})
        elif margin < 30: signals.append({'signal': 'Low SLA margin', 'points': 15, 'detail': f'{margin} minutes of margin'})
        if any(c.get('state') == 'BREACHED' for c in state.commitments.values() if c.get('job_id') == job['id']): signals.append({'signal': 'Broken commitment', 'points': 20, 'detail': 'A required promise is breached'})
        rows.append({'job_id': job['id'], 'machine_id': job['machine_id'], 'site_id': job['site_id'], 'priority': job.get('priority'), 'score': min(100, sum(s['points'] for s in signals)), 'sla_margin_minutes': margin, 'signals': signals})
    return sorted(rows, key=lambda r: (-r['score'], r['sla_margin_minutes'], r['job_id']))
