'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, useSession } from '../../lib/api';
import { subscribeEvents } from '../../lib/ws';
import s from './control.module.css';
import { DISPATCHERS } from '../../lib/roles';
import { Plus, Wrench, Box, Route, Check, AlertTriangle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { CommitmentGraph } from '../../components/commitment-graph';
import { PlanRanking } from '../../components/plan-ranking';
import { RequestForm } from '../../components/request-form';
import { RiskRadar } from '../../components/risk-radar';
import { ReconciliationTable } from '../../components/reconciliation-table';
import { Button } from '../../components/ui/button';
import { AdapterPanel } from './components/adapter-panel';
import { StatusChip } from '../../components/status-chip';
import { MapView } from '../../components/map';

type TechnicianCandidate = {
  id: string;
  name: string;
  eligible: boolean;
  reason_codes: string[];
  travel_minutes: number;
  contractor?: boolean;
};

type Commitment = {
  id: string;
  type: string;
  resource?: string;
  quantity?: number;
  state: string;
  owner?: string;
  physical_location?: string;
  source?: string;
};

type Job = {
  id: string;
  request_id?: string;
  machine_id: string;
  site_id: string;
  priority: string;
  fault: string;
  state: string;
  technician_id?: string;
  deadline: string;
  planned_start?: string;
  duration_minutes: number;
  planned_parts: Record<string, number>;
  issued_parts: Record<string, number>;
  commitments?: Commitment[];
  candidates?: TechnicianCandidate[];
  report?: any;
  report_hash?: string;
  acceptance?: string;
  version?: number;
};

type ServiceRequest = {
  id: string;
  job_id: string;
  validation?: Record<string, unknown>;
};

const currency = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;
const clock = (v?: string) =>
  v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';

export default function ControlRoom() {
  const { session } = useSession();
  // Dispatchers change things; the auditor and any other role only look.
  const canAct = DISPATCHERS.includes(session?.role ?? '');
  const selectedId = useRef<string | null>(null);
  const requestedJobOpened = useRef(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [risk, setRisk] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('impact');
  const [lens, setLens] = useState<'risk' | 'recovery'>('risk');
  const [composing, setComposing] = useState(false);
  const [tech, setTech] = useState('ravi');
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [candidate, setCandidate] = useState('');
  const [timeline, setTimeline] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [j, r] = await Promise.all([api<any>('/jobs'), api<any[]>('/exceptions/risk')]);
      setJobs(Array.isArray(j) ? j : j.items || j.jobs || []);
      setRisk(r.map(row => ({ ...row, tier: row.tier ?? (row.score >= 60 ? 'high' : row.score > 0 ? 'watch' : 'ok') })));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!session) return;
    return subscribeEvents(() => load(), setOnline);
  }, [session, load]);

  async function action(fn: () => Promise<any>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      setNotice(message);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openJob(job: Job) {
    selectedId.current = job.id;
    setSelected(job);
    setRequest(null);
    setCandidate('');
    setTimeline([]);
    try {
      const [detail, history] = await Promise.all([api<Job>(`/jobs/${job.id}`), api<{ events: any[] }>(`/jobs/${job.id}/timeline`)]);
      if (selectedId.current !== job.id) return;
      setSelected(detail);
      setTimeline(history.events || []);
      if (detail.request_id || detail.id) {
        const validated = await api<ServiceRequest>(`/requests/${detail.request_id || detail.id}`).catch(() => null);
        if (selectedId.current === job.id) setRequest(validated);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function dismiss() {
    selectedId.current = null;
    setSelected(null);
    setTimeline([]);
  }

  const lifecycleAction = (path: string, message: string, reason: string) =>
    action(
      () => api(path, { method: 'POST', body: JSON.stringify({ reason, expected_version: selected?.version }) }),
      message
    ).then(result => {
      if (result && selected) void openJob(selected);
    });

  useEffect(() => {
    if (!session || !jobs.length || requestedJobOpened.current) return;
    requestedJobOpened.current = true;
    const requestedId = new URLSearchParams(window.location.search).get('job');
    const requested = jobs.find(job => job.id === requestedId);
    if (requested) void openJob(requested);
  }, [jobs, session]);

  async function inspect(id = tech, to = 'impact') {
    setTech(id);
    setLens('recovery');
    setBusy(true);
    try {
      const data = await api(`/exceptions/plans/${id}`);
      setRecovery(data);
      setTab(to);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function drop() {
    const result = await action(
      () =>
        api(`/exceptions/dropout/${tech}`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Unavailable for the rest of the shift' }),
        }),
      'Dropout recorded. Recovery options were computed against current reservations.'
    );
    if (result) {
      setRecovery(result);
      setLens('recovery');
      setTab('plans');
    }
  }

  async function approve(id: string) {
    const result = await action(
      () => api(`/exceptions/plans/${id}/approve`, { method: 'POST', body: '{}' }),
      'Recovery plan applied. Reassigned technician and resource reservations are active.'
    );
    if (result) setRecovery(null);
  }

  const riskOf = new Map(risk.map(r => [r.job_id, r]));
  const visible = jobs.filter(
    j =>
      filter === 'all' ||
      (filter === 'risk' ? (riskOf.get(j.id)?.tier ?? 'ok') !== 'ok' : j.priority === filter)
  );
  const active = jobs.filter(j => !['closed', 'cancelled', 'completed'].includes(j.state));
  const atRisk = risk.filter(r => r.tier !== 'ok');
  const graph = recovery?.impact;
  const focus = lens === 'recovery' && !!recovery;

  return (
    <div className={s.shell}>
      <header className={s.top}>
        <div className={s.titleblock}>
          <h1>
            Service <span>Control</span>
          </h1>
          <span className={`${s.live} ${online ? s.connected : ''}`}>
            {online ? 'LIVE STREAM' : 'AUTO-REFRESH'}
          </span>
        </div>
        <button disabled={busy || !canAct} onClick={() => setComposing(!composing)} className={s.primary} aria-expanded={composing} title={canAct ? undefined : 'Your role can view requests but not create them'}>
          <Plus size={15} aria-hidden="true" /> New request
        </button>
      </header>

      {composing && canAct && (
        <section className={s.panel} style={{ padding: '16px 20px', marginBottom: '16px' }} aria-label="New service request">
          <h2 style={{ fontSize: '16px', marginBottom: '4px' }}>New service request</h2>
          <p className={s.muted} style={{ fontSize: '13px', margin: '0 0 8px' }}>Pick the machine and the fault. The request is checked against the contract, skills, parts and tools, then opens in the job drawer for assignment.</p>
          <RequestForm
            onError={setError}
            onDone={async (result, text) => {
              setComposing(false);
              setError('');
              setNotice(text);
              await load();
              const all = await api<any>('/jobs');
              const list = Array.isArray(all) ? all : all.items || all.jobs || [];
              const job = list.find((j: Job) => j.id === result.job_id);
              if (job) await openJob(job);
            }}
          />
        </section>
      )}

      {!session && (
        <div className={s.empty}>
          Sign in via the top bar to initialize operations telemetry. Coordinators can dispatch and recover jobs; manager approval is enforced for external contractors.
        </div>
      )}

      {session && !canAct && (
        <div role="status" data-testid="read-only-banner" className={s.notice}>
          Read-only view. You can inspect jobs, evidence and the audit history, but not create, approve or assign.
        </div>
      )}
      {error && <div role="alert" className={s.error}>{error}</div>}
      {notice && <div role="status" className={s.notice}>{notice}</div>}

      <section className={s.metrics} aria-label="Operational Key Performance Indicators">
        <div>
          <label>OPEN ACTIVE JOBS</label>
          <strong>{active.length.toString().padStart(2, '0')}</strong>
          <small>Across customer facilities</small>
        </div>
        <div>
          <label>AT RISK JOBS</label>
          <strong className={s.orange}>{atRisk.length.toString().padStart(2, '0')}</strong>
          <small>{atRisk.filter(r => r.tier === 'critical').length} critical</small>
        </div>
        <div>
          <label>DISRUPTION IMPACT</label>
          <strong>{graph ? graph.affected_jobs.length : '—'}</strong>
          <small>{graph ? `${graph.commitments_walked} commitments traced` : 'Trace a technician to see it'}</small>
        </div>
        <div>
          <label>RECOVERY PLANS</label>
          <strong>{recovery ? (recovery.plans?.length || recovery.partial_plans?.length || 0) : '—'}</strong>
          <small>{recovery ? `${recovery.combinations_examined} options simulated` : 'Simulate before applying'}</small>
        </div>
      </section>

      {/* One screen: the board stays put on the left; the right-hand lens switches between risk and recovery.
          While a recovery is open the board narrows to a rail and the lens takes the room. */}
      <div className={`${s.cockpit} ${focus ? s.focus : ''}`}>
        <section className={`${s.panel} ${s.col}`}>
          <div className={s.panelhead}>
            <div>
              <span className={s.kicker}>DISPATCH SCHEDULE</span>
              <h2>Active Operations</h2>
            </div>
            <div className={s.filters}>
              {['all', 'risk', 'P1', 'P2'].map(f => (
                <button
                  key={f}
                  className={filter === f ? s.chosen : ''}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All Jobs' : f === 'risk' ? 'At Risk' : f}
                </button>
              ))}
            </div>
          </div>

          <div className={`${s.tablewrap} ${s.fill}`}>
            <table className={focus ? s.rail : ''}>
              <thead>
                <tr>
                  <th>Equipment / Job</th>
                  <th>Priority</th>
                  <th>Assigned Tech</th>
                  <th>Start → Deadline (IST)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(j => {
                  const tier = riskOf.get(j.id)?.tier;
                  return (
                    <tr
                      key={j.id}
                      onClick={() => openJob(j)}
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter') openJob(j);
                      }}
                    >
                      <td>
                        <b>
                          {tier && tier !== 'ok' && <i className={`${s.tierdot} ${s[tier]}`} title={`${tier} risk`} aria-label={`${tier} risk`} />}
                          {j.machine_id}
                        </b>
                        <small>
                          {j.id} · {j.site_id.replace('site-', 'Site ').toUpperCase()}
                        </small>
                      </td>
                      <td>
                        <span className={j.priority === 'P1' ? s.priority : s.neutral}>{j.priority}</span>
                      </td>
                      <td>
                        <span className={s.avatar}>{(j.technician_id || '?')[0].toUpperCase()}</span>
                        {j.technician_id || 'Unassigned'}
                      </td>
                      <td className={s.timecell}>
                        {clock(j.planned_start)} <span className={s.muted}>→</span> {clock(j.deadline)}
                        <small>{j.duration_minutes}m</small>
                      </td>
                      <td>
                        <span className={s.state}>{j.state.replaceAll('_', ' ')}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && (
              <div className={s.empty}>
                {session ? 'No jobs match this filter. Click "New request" to dispatch.' : 'Operations telemetry will appear after sign-in.'}
              </div>
            )}
          </div>
        </section>

        <section className={`${s.panel} ${s.col}`}>
          <div className={s.lenstabs} role="tablist" aria-label="Risk and recovery">
            <button role="tab" aria-selected={lens === 'risk'} className={lens === 'risk' ? s.activetab : ''} onClick={() => setLens('risk')}>
              Risk Radar {atRisk.length > 0 && <span className={s.orangecount}>{atRisk.length}</span>}
            </button>
            <button role="tab" aria-selected={lens === 'recovery'} className={lens === 'recovery' ? s.activetab : ''} onClick={() => setLens('recovery')}>
              Schedule Solver {recovery && <span>{recovery.plans?.length || recovery.partial_plans?.length || 0}</span>}
            </button>
          </div>

          {lens === 'risk' ? (
            <div className={s.fill}>
              <RiskRadar
                risk={risk}
                canAct={canAct}
                onOpenJob={id => {
                  const job = jobs.find(j => j.id === id);
                  if (job) openJob(job);
                }}
                onTrace={(id, to) => inspect(id, to)}
              />
            </div>
          ) : (
            <>
              <div className={s.toolbar}>
                <label>
                  Technician
                  <select value={tech} onChange={e => setTech(e.target.value)}>
                    <option value="ravi">Ravi Shankar</option>
                    <option value="priya">Priya Nair</option>
                    <option value="karthik">Karthik Raja</option>
                    <option value="dev">Dev Verma</option>
                  </select>
                </label>
                <button disabled={busy || !session} onClick={() => inspect()} className={s.secondaryBtn}>
                  Inspect Impact
                </button>
                <button className={s.danger} disabled={busy || !canAct} onClick={drop}>
                  Report Dropout
                </button>
              </div>

              {recovery ? (
                <>
                  <div className={s.tabs}>
                    <button
                      onClick={() => setTab('impact')}
                      className={tab === 'impact' ? s.activetab : ''}
                    >
                      Impact Graph <span>{graph.affected_jobs.length}</span>
                    </button>
                    <button
                      onClick={() => setTab('plans')}
                      className={tab === 'plans' ? s.activetab : ''}
                    >
                      Recovery Plans <span>{recovery.plans.length || recovery.partial_plans?.length || 0}</span>
                    </button>
                  </div>
                  <div className={s.fill}>
                    {tab === 'impact' && (
                      <CommitmentGraph
                        impact={graph}
                        jobs={jobs}
                        risk={risk}
                        technicianName={tech.charAt(0).toUpperCase() + tech.slice(1)}
                        onOpenJob={id => {
                          const job = jobs.find(j => j.id === id);
                          if (job) openJob(job);
                        }}
                      />
                    )}
                    {tab === 'plans' && (
                      <PlanRanking recovery={recovery} busy={busy} role={session?.role || ''} onApprove={approve} />
                    )}
                  </div>
                </>
              ) : (
                <div className={`${s.graphplaceholder} ${s.fill}`}>
                  <div aria-hidden="true">
                    <Wrench size={22} strokeWidth={1.5} />
                    <i />
                    <Route size={24} strokeWidth={1.5} />
                    <i />
                    <Box size={22} strokeWidth={1.5} />
                  </div>
                  <h3>Trace Cascading Schedule Impacts</h3>
                  <p>
                    When a technician becomes unavailable or a part is delayed, see exactly how commitments propagate through downstream jobs before executing a recovery.
                  </p>
                  <span>SELECT A TECHNICIAN, OR PICK ONE FROM THE RISK RADAR</span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <MapView />
      <AdapterPanel />

      {/* Slide-out Job Inspection Drawer */}
      {selected && (
        <div className={s.overlay} onClick={dismiss}>
          <section className={s.drawer} onClick={e => e.stopPropagation()}>
            <button className={s.close} onClick={dismiss} aria-label="Close job details">
              ×
            </button>
            <span className={s.kicker}>EQUIPMENT DOSSIER · {selected.id}</span>
            <h2>{selected.machine_id}</h2>
            <p>
              {selected.fault.replaceAll('_', ' ')} · {selected.site_id.toUpperCase()}
            </p>

            <div style={{ display: 'flex', gap: '8px', margin: '12px 0 20px' }}>
              <span className={selected.priority === 'P1' ? s.priority : s.neutral}>{selected.priority}</span>
              <StatusChip job={selected} size="md" />
            </div>

            <h3>Service Window Telemetry</h3>
            <div className={s.detailgrid}>
              <div>
                <small>ASSIGNED TECHNICIAN</small>
                <b>{selected.technician_id || 'Awaiting Allocation'}</b>
              </div>
              <div>
                <small>SLA DEADLINE · IST</small>
                <b>{clock(selected.deadline)}</b>
              </div>
              <div>
                <small>PLANNED START</small>
                <b>{clock(selected.planned_start)}</b>
              </div>
              <div>
                <small>EXPECTED DURATION</small>
                <b>{selected.duration_minutes} minutes</b>
              </div>
            </div>

            <h3>Parts Required & Issuance</h3>
            {Object.entries(selected.planned_parts || {}).map(([part, qty]) => (
              <div key={part} className={s.resource}>
                <b>{part}</b>
                <span>
                  {qty} required · {selected.issued_parts?.[part] || 0} issued
                </span>
              </div>
            ))}

            <h3>Reservations & Custody Holds</h3>
            {(selected.commitments || [])
              .filter(c => ['PART_HOLD', 'TOOL_HOLD', 'TECH_TIME', 'TECH_ASSIGN'].includes(c.type))
              .map(c => (
                <div key={c.id} className={s.custody}>
                  <div>
                    <b>{c.resource === 'TIME' ? 'Technician Time' : c.resource || c.type}</b>
                    <span className={s.state}>{c.state}</span>
                  </div>
                  <small>{c.quantity || 1} units · {c.owner || 'Unassigned Owner'}</small>
                  <small>
                    {c.physical_location
                      ? `Physical Location: ${c.physical_location}`
                      : c.source
                      ? `Reserved From: ${c.source}`
                      : 'Location awaits field confirmation'}
                  </small>
                </div>
              ))}
            {!selected.commitments?.length && (
              <p className={s.muted}>No recorded reservations yet.</p>
            )}

            {selected.report && (
              <>
                <h3>Evidence Reconciliation</h3>
                <ReconciliationTable job={selected} />
              </>
            )}

            {request?.validation && (
              <>
                <h3>Request Validation</h3>
                {Object.entries(request.validation).map(([k, v]) => (
                  <div className={s.resource} key={k}>
                    <span>{k}</span>
                    <b className={v === true ? s.green : ''}>
                      {typeof v === 'boolean' ? (v ? 'Passed' : 'Needs Attention') : String(v)}
                    </b>
                  </div>
                ))}
              </>
            )}

            <h3>Activity timeline</h3>
            <div className={s.timeline} aria-label="Job activity timeline">
              {timeline.length ? timeline.slice().reverse().map(event => (
                <div className={s.timelineEvent} key={event.event_id}>
                  <b>{event.type.replaceAll(/([a-z])([A-Z])/g, '$1 $2')}</b>
                  <small>{event.occurred_at?.replace('T', ' ').replace('+00:00', ' UTC')} · {event.actor}</small>
                  {event.payload?.reason && <small>{event.payload.reason}</small>}
                </div>
              )) : <p className={s.muted}>No lifecycle events have been recorded yet.</p>}
            </div>

            {canAct && selected.state !== 'closed' && !['cancelled', 'rejected'].includes(selected.state) && (
              <div className={s.lifecycleActions}>
                <h3>Lifecycle actions</h3>
                {['created', 'approved'].includes(selected.state) && (
                  <button className={s.secondaryBtn} disabled={busy} onClick={() => lifecycleAction(`/requests/${selected.request_id || selected.id}/reject`, 'Request rejected and recorded.', 'Coordinator rejected request')}>Reject request</button>
                )}
                {['created', 'approved', 'assigned', 'in_progress', 'on_hold'].includes(selected.state) && (
                  <button className={s.secondaryBtn} disabled={busy} onClick={() => lifecycleAction(`/requests/${selected.request_id || selected.id}/cancel`, 'Request cancelled and resources released.', 'Coordinator cancelled request')}>Cancel request</button>
                )}
                {selected.state === 'assigned' && (
                  <>
                    <button className={s.secondaryBtn} disabled={busy} onClick={() => lifecycleAction(`/jobs/${selected.id}/hold`, 'Job put on hold.', 'Waiting for site access')}>Put on hold</button>
                    <button className={s.secondaryBtn} disabled={busy} onClick={() => lifecycleAction(`/requests/${selected.request_id || selected.id}/reschedule`, 'Assignment released for rescheduling.', 'Customer requested another slot')}>Reschedule</button>
                  </>
                )}
                {selected.state === 'on_hold' && (
                  <button className={s.primary} disabled={busy} onClick={() => lifecycleAction(`/jobs/${selected.id}/resume`, 'Job resumed.', 'Site is ready to continue')}>Resume work</button>
                )}
                {selected.state === 'verified' && (
                  <button className={s.primary} disabled={busy} onClick={() => action(() => api(`/jobs/${selected.id}/close`, { method: 'POST', body: JSON.stringify({ expected_version: selected.version }) }), 'Job closed.').then(result => { if (result) void openJob(selected); })}>Close job</button>
                )}
              </div>
            )}

            <h3>Ranked Technician Candidates</h3>
            {(selected.candidates || []).map((t, index) => (
              <div key={t.id} className={s.candidate}>
                <span className={s.candidateRank}>{index + 1}</span>
                <div>
                  <b>{t.name} · {t.travel_minutes}m travel</b>
                  <small>
                    {t.eligible
                      ? t.contractor
                        ? 'Approved contractor · manager approval in recovery'
                        : 'Qualified for assignment'
                      : t.reason_codes.join(' · ').replaceAll('_', ' ').toLowerCase()}
                  </small>
                </div>
                <span className={t.eligible ? s.green : s.muted}>{t.eligible ? '✓' : '×'}</span>
              </div>
            ))}

            {canAct && ['created', 'approved'].includes(selected.state) && (
              <div className={s.dispatch}>
                <h3>Dispatch Execution</h3>
                {selected.state === 'created' ? (
                  <button
                    disabled={busy}
                    className={s.primary}
                    onClick={() =>
                      action(
                        () =>
                          api(`/requests/${selected.request_id || selected.id}/approve`, {
                            method: 'POST',
                            body: '{}',
                          }),
                        'Request approved.'
                      ).then(result => {
                        if (result) dismiss();
                      })
                    }
                  >
                    Approve Service Request
                  </button>
                ) : (
                  <>
                    <label>
                      Technician Selection
                      <select value={candidate} onChange={e => setCandidate(e.target.value)}>
                        <option value="">Best Qualified (Auto-Ranked)</option>
                        {(selected.candidates || []).map(t => (
                          <option key={t.id} value={t.id} disabled={!t.eligible || t.contractor}>
                            {t.name} · {t.travel_minutes}m travel
                            {!t.eligible ? ` · ${t.reason_codes.join(', ')}` : t.contractor ? ' · manager recovery required' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={s.primary}
                      disabled={busy || !selected.candidates?.some(t => t.eligible && !t.contractor)}
                      onClick={() =>
                        action(
                          () =>
                            api(`/jobs/${selected.id}/assign`, {
                              method: 'POST',
                              body: JSON.stringify({ technician_id: candidate || null }),
                            }),
                          'Technician assigned and resources reserved.'
                        ).then(result => {
                          if (result) dismiss();
                        })
                      }
                    >
                      Assign & Reserve Resources →
                    </button>
                  </>
                )}
              </div>
            )}

            <h3>Risk Diagnostic</h3>
            {(risk.find(r => r.job_id === selected.id)?.signals || []).map((signal: any) => (
              <div className={s.signal} key={signal.signal}>
                <b>
                  {signal.signal} <span>+{signal.points} pts</span>
                </b>
                <p>{signal.detail}</p>
              </div>
            ))}
            {!risk.find(r => r.job_id === selected.id)?.signals.length && (
              <p className={s.muted}>No active operational risk signals detected.</p>
            )}

            <a className={s.customerlink} href={`/portal?job=${selected.id}`}>
              Open Customer Approval & Evidence Portal <ArrowRight size={14} />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
