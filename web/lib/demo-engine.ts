/**
 * Rivet Embedded Demo Engine
 * Provides a high-fidelity, in-memory state engine for Rivet's industrial operations.
 * Operates seamlessly on Vercel Serverless / Cloud edge environments even when external
 * backend databases or remote APIs are sleeping or unconfigured.
 */

export interface Site {
  id: string;
  name: string;
  customer_id: string;
  timezone: string;
  lat_e6: number;
  lng_e6: number;
}

export interface Machine {
  id: string;
  name: string;
  site_id: string;
  contract_id: string;
  eligible: boolean;
  status: string;
  sensor?: boolean;
}

export interface TechnicianCandidate {
  id: string;
  name: string;
  eligible: boolean;
  reason_codes: string[];
  travel_minutes: number;
  contractor?: boolean;
}

export interface Commitment {
  id: string;
  type: string;
  resource?: string;
  quantity?: number;
  state: string;
  owner?: string;
  physical_location?: string;
  source?: string;
  starts_at?: string;
  ends_at?: string;
  depends_on?: string[];
}

export interface Job {
  id: string;
  request_id?: string;
  machine_id: string;
  site_id: string;
  priority: string;
  fault: string;
  state: string;
  technician_id?: string | null;
  created_at: string;
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
  on_site?: boolean;
}

export interface ServiceRequest {
  id: string;
  job_id: string;
  machine_id: string;
  source: string;
  description: string;
  state: string;
  auto_approved?: boolean;
  validation: {
    eligible: boolean;
    skills: boolean;
    parts: boolean;
    tools: boolean;
    priority: string;
    site_id: string;
    contention: string;
  };
}

export interface RiskSignal {
  signal: string;
  points: number;
  detail: string;
}

export interface JobRisk {
  job_id: string;
  machine_id: string;
  site_id: string;
  priority: string;
  technician_id?: string | null;
  deadline: string;
  tier: 'critical' | 'high' | 'watch' | 'ok';
  score: number;
  sla_margin_minutes: number;
  signals: RiskSignal[];
}

class DemoEngine {
  public now: string;
  public sites: Record<string, Site> = {};
  public machines: Record<string, Machine> = {};
  public technicians: Record<string, any> = {};
  public jobs: Record<string, Job> = {};
  public requests: Record<string, ServiceRequest> = {};
  public commitments: Record<string, Commitment> = {};
  public balances: Record<string, number> = {};
  public nextRequestNum = 2231;
  public adapters = { telemetry: { enabled: true }, billing: { enabled: false } };

  constructor() {
    this.now = new Date().toISOString();
    this.reset();
  }

  public reset() {
    this.now = new Date().toISOString();
    this.sites = {
      'site-a': { id: 'site-a', name: 'Aster Works · Plant A', customer_id: 'customer-plant', timezone: 'Asia/Kolkata', lat_e6: 19076000, lng_e6: 72877000 },
      'site-b': { id: 'site-b', name: 'Site B · Parts depot', customer_id: 'customer-plant', timezone: 'Asia/Kolkata', lat_e6: 19198000, lng_e6: 72987000 },
      'site-c': { id: 'site-c', name: 'Site C · Remote plant', customer_id: 'customer-other', timezone: 'Asia/Kolkata', lat_e6: 20760000, lng_e6: 73150000 },
    };

    this.machines = {
      'M-104': { id: 'M-104', name: 'Hydraulic press', site_id: 'site-a', contract_id: 'P1', eligible: true, status: 'Running', sensor: true },
      'M-117': { id: 'M-117', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-122': { id: 'M-122', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-133': { id: 'M-133', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-134': { id: 'M-134', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-135': { id: 'M-135', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-136': { id: 'M-136', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-137': { id: 'M-137', name: 'Industrial drive', site_id: 'site-a', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-138': { id: 'M-138', name: 'Industrial drive', site_id: 'site-c', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-139': { id: 'M-139', name: 'Industrial drive', site_id: 'site-c', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-140': { id: 'M-140', name: 'Industrial drive', site_id: 'site-c', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
      'M-141': { id: 'M-141', name: 'Industrial drive', site_id: 'site-c', contract_id: 'P2', eligible: true, status: 'Running', sensor: false },
    };

    this.technicians = {
      ravi: { id: 'ravi', name: 'Ravi Shankar', skills: { hydraulics: 2, gearbox: 2 }, certificate_valid: true, available: true, distance_km: 6, travel_minutes: 9, site_id: 'site-a' },
      priya: { id: 'priya', name: 'Priya Nair', skills: { hydraulics: 2, gearbox: 2 }, certificate_valid: true, available: true, distance_km: 12, travel_minutes: 18, site_id: 'site-a' },
      karthik: { id: 'karthik', name: 'Karthik Raja', skills: { hydraulics: 1, gearbox: 2 }, certificate_valid: true, available: true, distance_km: 17, travel_minutes: 25, site_id: 'site-a' },
      dev: { id: 'dev', name: 'Dev Verma', skills: { hydraulics: 2, gearbox: 2 }, certificate_valid: true, available: true, distance_km: 20, travel_minutes: 30, site_id: 'site-a' },
      meena: { id: 'meena', name: 'Meena Patel', skills: { hydraulics: 2, gearbox: 2 }, certificate_valid: true, available: true, distance_km: 150, travel_minutes: 150, site_id: 'site-c' },
      arjun: { id: 'arjun', name: 'Arjun Sen', skills: { hydraulics: 2, gearbox: 2 }, certificate_valid: false, available: true, distance_km: 7, travel_minutes: 10, site_id: 'site-a' },
      'contractor-1': { id: 'contractor-1', name: 'Approved Contractor (Apex Industrial)', skills: { hydraulics: 2 }, certificate_valid: true, available: true, distance_km: 21, travel_minutes: 31, contractor: true, approved: true, sites: ['site-a'] },
    };

    this.balances = {
      'store:site-b:available|HS-40': 3,
      'store:site-b:available|JACK': 2,
      'store:site-a:available|O-RING': 12,
    };

    this.jobs = {
      'J-2236': {
        id: 'J-2236',
        machine_id: 'M-117',
        site_id: 'site-a',
        technician_id: 'ravi',
        state: 'assigned',
        priority: 'P2',
        fault: 'gearbox_overhaul',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        planned_start: new Date(Date.now() + 1800000).toISOString(),
        deadline: new Date(Date.now() + 3600000 * 4).toISOString(),
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        commitments: [
          { id: 'time:J-2236', type: 'TECH_TIME', resource: 'TIME', owner: 'ravi', state: 'HELD', quantity: 7 },
        ],
      },
      'J-2239': {
        id: 'J-2239',
        machine_id: 'M-122',
        site_id: 'site-a',
        technician_id: 'ravi',
        state: 'assigned',
        priority: 'P2',
        fault: 'gearbox_overhaul',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        planned_start: new Date(Date.now() + 3600000 * 3).toISOString(),
        deadline: new Date(Date.now() + 3600000 * 6).toISOString(),
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        commitments: [
          { id: 'time:J-2239', type: 'TECH_TIME', resource: 'TIME', owner: 'ravi', state: 'HELD', quantity: 7 },
        ],
      },
      'J-2240': {
        id: 'J-2240',
        machine_id: 'M-133',
        site_id: 'site-a',
        technician_id: 'dev',
        state: 'assigned',
        priority: 'P1',
        fault: 'gearbox_overhaul',
        created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
        planned_start: new Date(Date.now() + 900000).toISOString(),
        deadline: new Date(Date.now() + 3600000 * 2.5).toISOString(),
        duration_minutes: 95,
        planned_parts: { 'HS-40': 1 },
        issued_parts: { 'HS-40': 1 },
        commitments: [
          { id: 'time:J-2240', type: 'TECH_TIME', resource: 'TIME', owner: 'dev', state: 'HELD', quantity: 7 },
          { id: 'hold:J-2240', type: 'PART_HOLD', resource: 'HS-40', quantity: 1, state: 'HELD', source: 'store:site-b:available', owner: 'dev', physical_location: 'Site B · Parts depot' },
        ],
      },
      'J-2254': {
        id: 'J-2254',
        machine_id: 'M-135',
        site_id: 'site-a',
        technician_id: 'priya',
        state: 'assigned',
        priority: 'P2',
        fault: 'gearbox_overhaul',
        created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
        planned_start: new Date(Date.now() + 3600000 * 2).toISOString(),
        deadline: new Date(Date.now() + 3600000 * 5).toISOString(),
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        commitments: [
          { id: 'time:J-2254', type: 'TECH_TIME', resource: 'TIME', owner: 'priya', state: 'HELD', quantity: 7 },
        ],
      },
      'J-2258': {
        id: 'J-2258',
        machine_id: 'M-138',
        site_id: 'site-c',
        technician_id: 'meena',
        state: 'assigned',
        priority: 'P2',
        fault: 'gearbox_overhaul',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        planned_start: new Date(Date.now() + 1800000).toISOString(),
        deadline: new Date(Date.now() + 3600000 * 4).toISOString(),
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        commitments: [
          { id: 'time:J-2258', type: 'TECH_TIME', resource: 'TIME', owner: 'meena', state: 'HELD', quantity: 7 },
        ],
      },
    };
  }

  public getSummary() {
    const machinesList = Object.values(this.machines).map(m => {
      // Find open job for machine if any
      const openJob = Object.values(this.jobs).find(j => j.machine_id === m.id && !['completed', 'closed', 'cancelled'].includes(j.state));
      let status = m.status;
      if (openJob) {
        status = openJob.state === 'in_progress' ? 'Under repair' : openJob.state === 'created' ? 'Fault detected' : 'Under repair';
      }
      return {
        ...m,
        status,
      };
    });

    return {
      now: new Date().toISOString(),
      sites: Object.values(this.sites),
      machines: machinesList,
      technicians: Object.values(this.technicians).map(t => ({ id: t.id, name: t.name, qualifications: Object.keys(t.skills) })),
      breaches: [],
    };
  }

  public getCandidatesForJob(job: Job): TechnicianCandidate[] {
    const skill = job.fault.includes('hydraulic') ? 'hydraulics' : 'gearbox';
    const list: TechnicianCandidate[] = [];

    for (const t of Object.values(this.technicians)) {
      const reasons: string[] = [];
      if (!t.available) reasons.push('UNAVAILABLE');
      if (!t.certificate_valid) reasons.push('CERT_EXPIRED');
      if ((t.skills?.[skill] ?? 0) < 2) reasons.push('SKILL_MISMATCH');
      if (t.distance_km > 100 && t.site_id !== job.site_id) reasons.push('OUTSIDE_RADIUS');

      list.push({
        id: t.id,
        name: t.name,
        eligible: reasons.length === 0,
        reason_codes: reasons,
        travel_minutes: t.travel_minutes,
        contractor: !!t.contractor,
      });
    }

    return list.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.travel_minutes - b.travel_minutes;
    });
  }

  public getJobs(): Job[] {
    return Object.values(this.jobs).map(j => ({
      ...j,
      candidates: this.getCandidatesForJob(j),
    }));
  }

  public getJob(id: string): Job | null {
    const j = this.jobs[id];
    if (!j) return null;
    return {
      ...j,
      candidates: this.getCandidatesForJob(j),
    };
  }

  public createRequest(data: { machine_id: string; fault?: string; description?: string; source?: string }): { id: string; job_id: string; duplicate?: boolean; auto_approved?: boolean } {
    const machine = this.machines[data.machine_id];
    if (!machine) {
      throw new Error(`Machine ${data.machine_id} not found`);
    }

    // Check duplicate
    const existing = Object.values(this.jobs).find(
      j => j.machine_id === data.machine_id && !['completed', 'closed', 'cancelled'].includes(j.state) && j.fault === (data.fault || 'hydraulic_leak')
    );
    if (existing) {
      return { id: existing.request_id || existing.id, job_id: existing.id, duplicate: true };
    }

    const num = this.nextRequestNum++;
    const reqId = `R-${num}`;
    const jobId = `J-${num}`;
    const fault = data.fault || 'hydraulic_leak';
    const isP1 = machine.contract_id === 'P1' || fault === 'hydraulic_leak';
    const deadlineMins = isP1 ? 240 : 360;

    const plannedParts: Record<string, number> = fault === 'hydraulic_leak' ? { 'HS-40': 1 } : {};

    const job: Job = {
      id: jobId,
      request_id: reqId,
      machine_id: machine.id,
      site_id: machine.site_id,
      priority: isP1 ? 'P1' : 'P2',
      fault,
      state: 'created',
      technician_id: null,
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + deadlineMins * 60000).toISOString(),
      duration_minutes: fault === 'hydraulic_leak' ? 55 : 95,
      planned_parts: plannedParts,
      issued_parts: {},
      commitments: [],
    };

    this.jobs[jobId] = job;
    machine.status = 'Fault detected';

    const candidates = this.getCandidatesForJob(job);
    const hasSkills = candidates.some(c => c.eligible && !c.contractor);
    const autoApproved = hasSkills;

    const req: ServiceRequest = {
      id: reqId,
      job_id: jobId,
      machine_id: machine.id,
      source: data.source || 'portal',
      description: data.description || '',
      state: autoApproved ? 'approved' : 'created',
      auto_approved: autoApproved,
      validation: {
        eligible: true,
        skills: hasSkills,
        parts: true,
        tools: true,
        priority: job.priority,
        site_id: machine.site_id,
        contention: 'HS-40: 2 left in store',
      },
    };

    if (autoApproved) {
      job.state = 'approved';
    }

    this.requests[reqId] = req;
    return { id: reqId, job_id: jobId, auto_approved: autoApproved };
  }

  public approveRequest(id: string) {
    const req = this.requests[id] || Object.values(this.requests).find(r => r.job_id === id);
    if (req) {
      req.state = 'approved';
      if (this.jobs[req.job_id]) {
        this.jobs[req.job_id].state = 'approved';
      }
      return { id: req.id, state: 'approved' };
    }
    const job = this.jobs[id];
    if (job) {
      job.state = 'approved';
      return { id: job.id, state: 'approved' };
    }
    return { error: 'Request not found' };
  }

  public assignJob(jobId: string, techId: string | null) {
    const job = this.jobs[jobId];
    if (!job) throw new Error(`Job ${jobId} not found`);

    let targetTech = techId;
    if (!targetTech) {
      const candidates = this.getCandidatesForJob(job).filter(c => c.eligible && !c.contractor);
      if (candidates.length) targetTech = candidates[0].id;
      else targetTech = 'ravi';
    }

    job.technician_id = targetTech;
    job.state = 'assigned';
    job.planned_start = new Date(Date.now() + 15 * 60000).toISOString();

    const commitments: Commitment[] = [
      {
        id: `time:${job.id}`,
        type: 'TECH_TIME',
        resource: 'TIME',
        owner: targetTech,
        state: 'HELD',
        quantity: Math.ceil(job.duration_minutes / 15),
        starts_at: job.planned_start,
      },
    ];

    if (Object.keys(job.planned_parts).length > 0) {
      for (const [part, qty] of Object.entries(job.planned_parts)) {
        commitments.push({
          id: `hold:${job.id}-${part}`,
          type: 'PART_HOLD',
          resource: part,
          quantity: qty,
          owner: targetTech,
          state: 'HELD',
          physical_location: 'Site B · Parts depot',
        });
      }
    }

    job.commitments = commitments;
    return job;
  }

  public getRisk(): JobRisk[] {
    const rows: JobRisk[] = [];
    const nowMs = Date.now();

    for (const job of Object.values(this.jobs)) {
      if (['completed', 'closed', 'cancelled'].includes(job.state)) continue;
      const signals: RiskSignal[] = [];
      const tech = job.technician_id ? this.technicians[job.technician_id] : null;

      if (tech && !tech.available) {
        signals.push({ signal: 'Technician dropout', points: 60, detail: `${tech.name} has reported unavailable for the rest of shift` });
      }

      if (!job.technician_id) {
        signals.push({ signal: 'Unassigned', points: 35, detail: 'No technician currently reserved' });
      }

      const deadlineMs = new Date(job.deadline).getTime();
      const durationMs = job.duration_minutes * 60000;
      const plannedStartMs = job.planned_start ? new Date(job.planned_start).getTime() : nowMs;
      const finishMs = plannedStartMs + durationMs;
      const marginMins = Math.round((deadlineMs - finishMs) / 60000);

      if (marginMins < 0) {
        signals.push({ signal: 'Projected SLA miss', points: 35, detail: `${Math.abs(marginMins)} minutes beyond SLA deadline` });
      } else if (marginMins < 45) {
        signals.push({ signal: 'Low SLA margin', points: 15, detail: `${marginMins} minutes of buffer before breach` });
      }

      let tier: 'critical' | 'high' | 'watch' | 'ok' = 'ok';
      const score = Math.min(100, signals.reduce((sum, s) => sum + s.points, 0));

      if (signals.some(s => s.signal === 'Projected SLA miss') || (job.priority === 'P1' && signals.length > 0)) {
        tier = 'critical';
      } else if (signals.some(s => s.signal === 'Technician dropout' || s.signal === 'Unassigned')) {
        tier = 'high';
      } else if (signals.length > 0) {
        tier = 'watch';
      }

      rows.push({
        job_id: job.id,
        machine_id: job.machine_id,
        site_id: job.site_id,
        priority: job.priority,
        technician_id: job.technician_id,
        deadline: job.deadline,
        tier,
        score,
        sla_margin_minutes: marginMins,
        signals,
      });
    }

    return rows.sort((a, b) => b.score - a.score);
  }

  public getRecovery(techId = 'ravi') {
    const tech = this.technicians[techId] || this.technicians['ravi'];
    const affectedJobs = Object.values(this.jobs).filter(j => j.technician_id === tech.id && !['completed', 'closed'].includes(j.state));
    const unaffectedJobs = Object.values(this.jobs).filter(j => j.technician_id !== tech.id && !['completed', 'closed'].includes(j.state));

    const nodes: any[] = [];
    const edges: any[] = [];

    affectedJobs.forEach((job, idx) => {
      const timeNode = `time:${job.id}`;
      const slaNode = `sla:${job.id}`;
      nodes.push({ id: timeNode, type: 'TECH_TIME', job_id: job.id, resource: 'TIME', owner: tech.id, state: 'HELD', quantity: 7 });
      nodes.push({ id: slaNode, type: 'SLA_WINDOW', job_id: job.id, state: 'ACTIVE', deadline: job.deadline });
      edges.push({ source: timeNode, target: slaNode });

      if (idx > 0) {
        edges.push({ source: `time:${affectedJobs[idx - 1].id}`, target: timeNode });
      }
    });

    const impactGraph = {
      technician_id: tech.id,
      roots: affectedJobs.map(j => `time:${j.id}`),
      affected_jobs: affectedJobs.map(j => j.id),
      unaffected_jobs: unaffectedJobs.map(j => j.id),
      commitments_walked: nodes.length,
      part_holds_affected: 0,
      nodes,
      edges,
      horizon_hours: 48,
    };

    const plans = [
      {
        id: 'plan-A',
        technician_id: tech.id,
        explanation: 'Priya covers the high-priority equipment; Karthik handles later operations with existing parts inventory.',
        sla_misses: { P1: 0, P2: 0, P3: 0 },
        penalty_paise: 0,
        commitments_changed: affectedJobs.length * 2,
        added_travel_minutes: 18,
        assignments: affectedJobs.map((j, i) => ({
          job_id: j.id,
          machine_id: j.machine_id,
          technician_id: i === 0 ? 'priya' : 'karthik',
          planned_start: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
          projected_finish: new Date(Date.now() + (i + 1) * 3600000 + j.duration_minutes * 60000).toISOString(),
          late_minutes: 0,
        })),
        unplaced: [],
      },
      {
        id: 'plan-B',
        technician_id: tech.id,
        explanation: 'Dev covers all assigned jobs sequentially with standard travel buffer.',
        sla_misses: { P1: 0, P2: 1, P3: 0 },
        penalty_paise: 300000,
        commitments_changed: affectedJobs.length,
        added_travel_minutes: 30,
        assignments: affectedJobs.map((j, i) => ({
          job_id: j.id,
          machine_id: j.machine_id,
          technician_id: 'dev',
          planned_start: new Date(Date.now() + (i + 1) * 4500000).toISOString(),
          projected_finish: new Date(Date.now() + (i + 1) * 4500000 + j.duration_minutes * 60000).toISOString(),
          late_minutes: i === 1 ? 15 : 0,
        })),
        unplaced: [],
      },
    ];

    return {
      technician_id: tech.id,
      impact: impactGraph,
      combinations_examined: 24,
      plans,
      partial_plans: [],
    };
  }

  public reportDropout(techId = 'ravi') {
    if (this.technicians[techId]) {
      this.technicians[techId].available = false;
    }
    return this.getRecovery(techId);
  }

  public approvePlan(planId: string) {
    // Reassign jobs according to recovery plan
    const recovery = this.getRecovery('ravi');
    const plan = recovery.plans.find(p => p.id === planId) || recovery.plans[0];

    if (plan) {
      for (const a of plan.assignments) {
        const job = this.jobs[a.job_id];
        if (job) {
          job.technician_id = a.technician_id;
          job.planned_start = a.planned_start;
          if (job.commitments) {
            job.commitments.forEach(c => {
              if (c.type === 'TECH_TIME') c.owner = a.technician_id;
            });
          }
        }
      }
    }

    return { approved: true, plan_id: planId };
  }

  public getPassport(machineId: string) {
    const machine = this.machines[machineId] || {
      id: machineId,
      name: 'Hydraulic press',
      site_id: 'site-a',
      contract_id: 'P1',
      eligible: true,
      status: 'Running',
      sensor: true,
    };

    const machineJobs = Object.values(this.jobs).filter(j => j.machine_id === machineId);

    const historyJobs = [
      {
        id: 'J-2210',
        machine_id: machineId,
        site_id: machine.site_id,
        priority: 'P1',
        fault: 'hydraulic_leak',
        state: 'closed',
        technician_id: 'ravi',
        created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
        restored_at: new Date(Date.now() - 86400000 * 12 + 3600000 * 2).toISOString(),
        deadline: new Date(Date.now() - 86400000 * 12 + 3600000 * 4).toISOString(),
        acceptance: 'Verified',
        report_hash: '397137d36add1c4be1bf07c40e7f3e0e4cc6d57bbce878a0d4e253f8a43387d2',
        sla: { met: true, margin_minutes: 120, late_seconds: 0 },
        reconciliation: { outcome: 'Clean' },
      },
      {
        id: 'J-2185',
        machine_id: machineId,
        site_id: machine.site_id,
        priority: 'P2',
        fault: 'gearbox_overhaul',
        state: 'closed',
        technician_id: 'priya',
        created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
        restored_at: new Date(Date.now() - 86400000 * 25 + 3600000 * 3).toISOString(),
        deadline: new Date(Date.now() - 86400000 * 25 + 3600000 * 6).toISOString(),
        acceptance: 'Verified',
        report_hash: '606be6ab823f198d0141ad95679b40d99dbeccabcc6dd5314ba6414d577b4515',
        sla: { met: true, margin_minutes: 180, late_seconds: 0 },
        reconciliation: { outcome: 'Explained variance' },
      },
      ...machineJobs,
    ];

    const events = [
      { event_id: 'evt-000101', machine: machineId, type: 'MachineRegistered', machine_hash: '3438eb34e70f3f55b89d8efb1db8e65c9012482cabb6b8f9e1311b368390fc5b' },
      { event_id: 'evt-000102', machine: machineId, type: 'JobCompleted', machine_hash: '606be6ab823f198d0141ad95679b40d99dbeccabcc6dd5314ba6414d577b4515' },
      { event_id: 'evt-000103', machine: machineId, type: 'CustomerAccepted', machine_hash: '3945913a071114fc8b0c9828820158b608415f9bbacc821353ef1e52cbac2847' },
    ];

    return {
      machine,
      jobs: historyJobs,
      events,
    };
  }

  public getPackage(jobIdOrMachineId: string) {
    const job = this.jobs[jobIdOrMachineId] || Object.values(this.jobs).find(j => j.machine_id === jobIdOrMachineId) || this.jobs['J-2240'];
    const machineId = job ? job.machine_id : 'M-104';
    const passport = this.getPassport(machineId);

    const body = {
      version: 1,
      job_id: job ? job.id : 'J-2210',
      machine_id: machineId,
      generated_at: new Date().toISOString(),
      events: passport.events,
      head: '3945913a071114fc8b0c9828820158b608415f9bbacc821353ef1e52cbac2847',
      report: { parts: { 'HS-40': 1 }, duration_minutes: 55 },
      report_hash: '397137d36add1c4be1bf07c40e7f3e0e4cc6d57bbce878a0d4e253f8a43387d2',
      acceptance: 'Verified',
      reconciliation: { outcome: 'Clean' },
      contract: { id: 'P1', resolution_minutes: 240 },
      sla: { met: true, margin_minutes: 120, late_seconds: 0 },
      receipts: [],
    };

    return {
      body,
      key: {
        key_id: 'k-demo-01',
        public_key: '74YByMEJ6h/S4AzD4PBGn3PCcMAbidAAG06m7E59ASs=',
        fingerprint: 'a7648f3e8f3e4a91944fa3b4225db1c56e7fc24b405480e8ca80b4aa0edfde9f',
      },
      signature: 'L9zTm5prWsf2r2/WppFbAFk5MvvwdzmgdUtwwxzNdHiDqObsfaCPAgoyyih4AU0A7Had1yBJ/8bGQ5ZN8WMHDg==',
    };
  }

  public generateJwt(userId = 'coordinator'): string {
    const role = this.technicians[userId] ? 'technician' : userId;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        role: role,
        user_id: userId,
        kind: 'demo',
        sites: ['site-a', 'site-b', 'site-c'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days valid
      })
    ).toString('base64url');
    const signature = 'demo_signature_' + Buffer.from(userId).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }
}

// Global singleton instance for Vercel Serverless runtime memory
export const demoEngine = new DemoEngine();
