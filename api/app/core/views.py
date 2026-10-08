"""What each role may read. Scope (which sites, which technician) is decided in auth.py; this decides which fields.

Staff see the whole record. A customer sees their service and its evidence, not the provider's
internal planning: no technician ranking with skills and certificates, no parts or time holds,
no assignment details. A technician sees their own jobs without the dispatcher's candidate ranking.
"""

STAFF = ('admin', 'coordinator', 'manager', 'auditor')
CUSTOMER = ('requester', 'supervisor')

# The commitments a customer takes part in. Everything else (part holds, technician time) is the provider's own bookkeeping.
CUSTOMER_COMMITMENTS = frozenset({'ACCESS_WINDOW', 'SHUTDOWN_WINDOW', 'PERMIT_TO_WORK', 'SLA_WINDOW'})
# Job fields that expose the provider's internal planning or staffing.
CUSTOMER_HIDDEN_JOB_FIELDS = ('candidates', 'technician_id', 'planned_parts', 'reassigned_from', 'flags')


def machine_view(state, machine):
    """The machine as it is read. Its status comes from its open service request, not only from a stored flag that an
    earlier mistake could leave behind: a machine with an unfinished request never reads 'Running'."""
    for job in state.jobs.values():
        if job['machine_id'] != machine['id'] or not job.get('request_id') or job.get('state') in ('closed', 'cancelled', 'completed') or job.get('restored_at'):
            continue
        status = 'Restored, awaiting confirmation' if job.get('checkout_at') else 'Under repair' if job.get('state') == 'in_progress' else 'Fault detected'
        return {**machine, 'status': status}
    return machine


def is_staff(role):
    return role in STAFF


def commitments_view(commitments, role):
    if role in CUSTOMER:
        return [c for c in commitments if c.get('type') in CUSTOMER_COMMITMENTS]
    return list(commitments)


def job_view(job, role):
    """One job as this role may read it."""
    if role in STAFF:
        return job
    view = {k: v for k, v in job.items() if k != 'candidates'}
    if role in CUSTOMER:
        for field in CUSTOMER_HIDDEN_JOB_FIELDS:
            view.pop(field, None)
        if 'commitments' in view:
            view['commitments'] = commitments_view(view['commitments'], role)
    return view


def summary_view(summary, role):
    """The dashboard payload for this role: staff get all of it, others only what their screens use."""
    if role in STAFF:
        return summary
    view = dict(summary)
    view['jobs'] = [job_view(j, role) for j in summary.get('jobs', [])]
    view['commitments'] = commitments_view(summary.get('commitments', []), role)
    if role in CUSTOMER:
        view['breaches'] = []  # SLA breach handling and recovery plans are internal
        view['technicians'] = []
    return view


def may_see_events(role):
    """The live event feed carries internal bookkeeping, so customers get no stream; the portal reads their jobs directly."""
    return role not in CUSTOMER
