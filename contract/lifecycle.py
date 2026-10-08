"""The job lifecycle vocabulary, shared by the API, the seed and the clients. Pure data: no I/O, no framework.

Created -> Approved -> Assigned -> In Progress -> Completed -> Verified -> Closed
plus the exits Rejected / Cancelled and the pause On hold. Every move goes through the workflow engine,
which checks it against the edges below (or the versioned definition an admin saved) and records from/to on the event."""

STAGES = ('created', 'approved', 'assigned', 'in_progress', 'completed', 'verified', 'closed')
SIDE_STATES = ('rejected', 'cancelled', 'on_hold')

LABELS = {
    'created': 'Created', 'approved': 'Approved', 'assigned': 'Assigned', 'in_progress': 'In progress',
    'completed': 'Completed', 'verified': 'Verified', 'closed': 'Closed',
    'rejected': 'Rejected', 'cancelled': 'Cancelled', 'on_hold': 'On hold',
}

DEFAULT_EDGES = {
    'created': ['approved', 'rejected', 'cancelled'],
    'approved': ['assigned', 'rejected', 'cancelled'],
    'assigned': ['in_progress', 'approved', 'cancelled', 'on_hold'],  # back to approved = rescheduled
    'in_progress': ['completed', 'on_hold', 'cancelled'],
    'on_hold': ['assigned', 'in_progress', 'cancelled'],
    'completed': ['verified', 'in_progress'],  # back to in progress = fix failed
    'verified': ['closed', 'in_progress'],
    'closed': ['in_progress'],  # reopened inside the contract window
    'rejected': [],
    'cancelled': [],
}

# The job is over for everyone: nothing is left to plan, staff or confirm.
DONE = frozenset({'verified', 'closed', 'cancelled', 'rejected'})
# The technician has nothing more to do (the customer may still accept): cascade and recovery skip these jobs.
WORK_DONE = DONE | {'completed'}
# Jobs that count as finished for duplicate detection, machine status and passports.
FINISHED = frozenset({'verified', 'closed'})

LEGACY = {'pending_approval': 'created', 'awaiting_acceptance': 'completed', 'closure_blocked': 'completed', 'reopened': 'in_progress'}

# What an admin may never switch off, however the workflow is edited.
LOCKED_RULES = ('false_closure_block', 'ledger_invariants', 'role_checks', 'append_only_audit')

DEFAULT_RULES = {
    'skip_approval': False,            # contracted scheduled maintenance can start approved
    'approval_threshold_paise': None,  # None = the contract's own auto-approve limit
    'approver_role': 'coordinator',
    'max_travel_minutes': 90,
    'checkin_grace_minutes': 20,
    'hold_expiry_hours': 4,
    'risk_margin_minutes': 30,
    'overtime_limit_minutes': 60,
}

SERVICE_TYPES = ('inspection', 'repair', 'replacement', 'scheduled_maintenance')


def default_definition(service_type='repair'):
    return {
        'service_type': service_type,
        'edges': {k: list(v) for k, v in DEFAULT_EDGES.items()},
        'required_stages': [],  # extra gates that must be cleared before work starts, e.g. 'safety_check'
        'rules': dict(DEFAULT_RULES),
        'locked': {k: True for k in LOCKED_RULES},
    }


def migrate(state):
    """Old stored states use the names this release replaced; read them as their lifecycle equivalent."""
    for job in state.jobs.values():
        old = job.get('state')
        if old in LEGACY:
            if old == 'closure_blocked': job['closure_blocked'] = True
            job['state'] = LEGACY[old]
        job.setdefault('version', 1)
    for request in state.requests.values():
        if request.get('state') in LEGACY: request['state'] = LEGACY[request['state']]
    return state
