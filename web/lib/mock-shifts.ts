export interface ShiftJob {
  id: string;
  machine_id: string;
  site_id: string;
  technician_id: string;
  state: string;
  priority: string;
  fault: string;
  created_at: string;
  deadline: string;
  planned_start: string;
  duration_minutes: number;
  planned_parts?: Record<string, number>;
  issued_parts?: Record<string, number>;
  evidence?: string[];
  tasks?: Array<{ at: string; [key: string]: unknown }>;
  checklist?: string[];
  acceptance?: string;
  on_site?: boolean;
}

export interface ShiftCommitment {
  id: string;
  type: string;
  job_id: string;
  resource?: string;
  owner?: string;
  state: string;
  source?: string;
  reservation_account?: string;
  quantity?: number;
  starts_at?: string;
  ends_at?: string;
  deadline?: string;
  depends_on?: string[];
}

export interface ShiftCacheResponse {
  cached_at: string;
  jobs: ShiftJob[];
  commitments: ShiftCommitment[];
  last_seq: number;
}

export const MOCK_SHIFTS: Record<string, ShiftCacheResponse> = {
  ravi: {
    cached_at: "2026-10-07T03:32:00+00:00",
    jobs: [
      {
        id: "J-2236",
        machine_id: "M-117",
        site_id: "site-a",
        technician_id: "ravi",
        state: "assigned",
        priority: "P2",
        fault: "gearbox_overhaul",
        created_at: "2026-10-07T03:00:00+00:00",
        deadline: "2026-10-07T08:45:00+00:00",
        planned_start: "2026-10-07T06:30:00+00:00",
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        evidence: [],
        tasks: [],
        checklist: [],
        acceptance: "Pending",
        on_site: false,
      },
      {
        id: "J-2239",
        machine_id: "M-122",
        site_id: "site-a",
        technician_id: "ravi",
        state: "assigned",
        priority: "P2",
        fault: "gearbox_overhaul",
        created_at: "2026-10-07T03:00:00+00:00",
        deadline: "2026-10-07T10:00:00+00:00",
        planned_start: "2026-10-07T08:10:00+00:00",
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        evidence: [],
        tasks: [],
        checklist: [],
        acceptance: "Pending",
        on_site: false,
      },
    ],
    commitments: [
      {
        id: "time:J-2236",
        type: "TECH_TIME",
        job_id: "J-2236",
        resource: "TIME",
        owner: "ravi",
        state: "HELD",
        source: "tech:ravi:2026-10-07:free",
        reservation_account: "job:J-2236:allocated",
        quantity: 7,
        starts_at: "2026-10-07T06:30:00+00:00",
        ends_at: "2026-10-07T08:05:00+00:00",
        depends_on: [],
      },
      {
        id: "sla:J-2236",
        type: "SLA_WINDOW",
        job_id: "J-2236",
        state: "ACTIVE",
        deadline: "2026-10-07T08:45:00+00:00",
        depends_on: ["time:J-2236"],
      },
      {
        id: "time:J-2239",
        type: "TECH_TIME",
        job_id: "J-2239",
        resource: "TIME",
        owner: "ravi",
        state: "HELD",
        source: "tech:ravi:2026-10-07:free",
        reservation_account: "job:J-2239:allocated",
        quantity: 7,
        starts_at: "2026-10-07T08:10:00+00:00",
        ends_at: "2026-10-07T09:45:00+00:00",
        depends_on: ["time:J-2236"],
      },
      {
        id: "sla:J-2239",
        type: "SLA_WINDOW",
        job_id: "J-2239",
        state: "ACTIVE",
        deadline: "2026-10-07T10:00:00+00:00",
        depends_on: ["time:J-2239"],
      },
    ],
    last_seq: 0,
  },
  priya: {
    cached_at: "2026-10-07T03:32:00+00:00",
    jobs: [
      {
        id: "J-2254",
        machine_id: "M-134",
        site_id: "site-a",
        technician_id: "priya",
        state: "assigned",
        priority: "P2",
        fault: "gearbox_overhaul",
        created_at: "2026-10-07T03:00:00+00:00",
        deadline: "2026-10-07T08:00:00+00:00",
        planned_start: "2026-10-07T05:55:00+00:00",
        duration_minutes: 95,
        planned_parts: {},
        issued_parts: {},
        evidence: [],
        tasks: [],
        checklist: [],
        acceptance: "Pending",
        on_site: false,
      },
    ],
    commitments: [
      {
        id: "time:J-2254",
        type: "TECH_TIME",
        job_id: "J-2254",
        resource: "TIME",
        owner: "priya",
        state: "HELD",
        source: "tech:priya:2026-10-07:free",
        reservation_account: "job:J-2254:allocated",
        quantity: 7,
        starts_at: "2026-10-07T05:55:00+00:00",
        ends_at: "2026-10-07T07:30:00+00:00",
        depends_on: [],
      },
      {
        id: "sla:J-2254",
        type: "SLA_WINDOW",
        job_id: "J-2254",
        state: "ACTIVE",
        deadline: "2026-10-07T08:00:00+00:00",
        depends_on: ["time:J-2254"],
      },
    ],
    last_seq: 0,
  },
};
