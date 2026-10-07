/**
 * Completion report the technician submits for a job.
 * The field names are the ones the API reads (api/app/modules/proof/service.py submit_report).
 */
export interface ReportPayload {
  parts: Record<string, number>;
  checklist: string[];
  minutes: number;
  notes: string;
}

/**
 * Mirrors metadata.required_checklist in the API fixture; tests/test_report_checklist_sync.py
 * fails if the two drift. The two photo items are claimed here but verified from real uploads.
 */
export const REPORT_CHECKLIST: ReadonlyArray<{ id: string; label: string; photo?: 'before_photo' | 'after_photo' }> = [
  { id: 'isolate', label: 'Machine isolated and locked out' },
  { id: 'inspect', label: 'Fault inspected' },
  { id: 'replace', label: 'Faulty part replaced' },
  { id: 'test', label: 'Tested after the repair' },
  { id: 'before_photo', label: 'Before photo taken', photo: 'before_photo' },
  { id: 'after_photo', label: 'After photo taken', photo: 'after_photo' },
];

export const MAX_NOTES = 500;
export const MAX_MINUTES = 1440;
export const MAX_PART_QUANTITY = 999;

export interface ReportDraft {
  parts: Record<string, number>;
  checked: ReadonlySet<string>;
  minutes: number;
  notes: string;
}

/** Whole-number check that rejects NaN, fractions and negatives. */
export function isWholeNumber(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

export function reportErrors(draft: ReportDraft): string[] {
  const errors: string[] = [];
  if (!isWholeNumber(draft.minutes, MAX_MINUTES)) errors.push(`Minutes worked must be a whole number from 0 to ${MAX_MINUTES}.`);
  for (const [part, quantity] of Object.entries(draft.parts)) {
    if (!isWholeNumber(quantity, MAX_PART_QUANTITY)) errors.push(`${part}: quantity must be a whole number from 0 to ${MAX_PART_QUANTITY}.`);
  }
  if (draft.notes.length > MAX_NOTES) errors.push(`Notes are limited to ${MAX_NOTES} characters.`);
  return errors;
}

export function buildReportPayload(draft: ReportDraft): ReportPayload {
  const parts: Record<string, number> = {};
  for (const [part, quantity] of Object.entries(draft.parts)) {
    if (quantity > 0) parts[part] = quantity;
  }
  return {
    parts,
    checklist: REPORT_CHECKLIST.filter((item) => draft.checked.has(item.id)).map((item) => item.id),
    minutes: draft.minutes,
    notes: draft.notes.trim(),
  };
}

export interface ReportGap {
  tone: 'critical' | 'warning';
  text: string;
}

/**
 * The gaps the server's reconciliation will flag for the customer, shown before the
 * technician submits so a truthful but incomplete report is a conscious choice.
 */
export function reportGaps(
  draft: ReportDraft,
  issued: Record<string, number>,
  photosTaken: ReadonlySet<string>
): ReportGap[] {
  const gaps: ReportGap[] = [];
  const missing = REPORT_CHECKLIST.filter((item) => !draft.checked.has(item.id));
  if (missing.length) {
    gaps.push({ tone: 'critical', text: `Not ticked: ${missing.map((item) => item.label.toLowerCase()).join(', ')}. The customer cannot accept until these are explained.` });
  }
  for (const item of REPORT_CHECKLIST) {
    if (item.photo && draft.checked.has(item.id) && !photosTaken.has(item.photo)) {
      gaps.push({ tone: 'critical', text: `${item.label} is ticked but no photo is saved on this device for it.` });
    }
  }
  const names = Array.from(new Set([...Object.keys(draft.parts), ...Object.keys(issued)])).sort();
  for (const part of names) {
    const used = draft.parts[part] ?? 0;
    const given = issued[part] ?? 0;
    if (used === given) continue;
    gaps.push({
      tone: 'warning',
      text: given === 0
        ? `${part}: you report ${used} used, but the store has no issue record. A manager must approve a variance.`
        : `${part}: you report ${used} used, the store issued ${given}. A manager must approve a variance.`,
    });
  }
  return gaps;
}
