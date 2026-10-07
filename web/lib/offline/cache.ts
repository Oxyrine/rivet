import { getDB, CachedShift } from './db';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface StaleStatus {
  isStale: boolean;
  cachedAt?: string;
  hoursAgo?: number;
  minutesAgo?: number;
}

export async function storeShiftCache(
  techId: string,
  deviceId: string,
  data: { jobs: any[]; commitments: any[]; last_seq: number; cached_at?: string }
): Promise<CachedShift> {
  const db = await getDB();
  const cachedAt = data.cached_at || new Date().toISOString();
  const shift: CachedShift = {
    key: `shift:${techId}`,
    tech_id: techId,
    device_id: deviceId,
    cached_at: cachedAt,
    jobs: data.jobs,
    commitments: data.commitments,
    last_seq: data.last_seq,
  };

  await db.put('cache', shift);

  // Also update metadata
  await db.put('meta', {
    device_id: deviceId,
    last_seq: data.last_seq,
    last_sync: cachedAt,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rivet:cache-updated', { detail: shift }));
  }

  return shift;
}

export async function getCachedShift(techId: string): Promise<CachedShift | null> {
  try {
    const db = await getDB();
    const result = await db.get('cache', `shift:${techId}`);
    return result || null;
  } catch {
    return null;
  }
}

export function checkStaleStatus(cachedAt?: string): StaleStatus {
  if (!cachedAt) {
    return { isStale: true };
  }

  const time = new Date(cachedAt).getTime();
  if (isNaN(time)) {
    return { isStale: true };
  }

  const diffMs = Date.now() - time;
  const minutesAgo = Math.floor(diffMs / (60 * 1000));
  const hoursAgo = Number((diffMs / (60 * 60 * 1000)).toFixed(1));
  const isStale = diffMs > TWO_HOURS_MS;

  return {
    isStale,
    cachedAt,
    hoursAgo,
    minutesAgo,
  };
}

export async function updateCachedCommitmentState(
  techId: string,
  jobId: string,
  commitmentType: string,
  newState: string
): Promise<void> {
  const db = await getDB();
  const shift = await db.get('cache', `shift:${techId}`);
  if (shift && Array.isArray(shift.commitments)) {
    let modified = false;
    shift.commitments = shift.commitments.map((c: any) => {
      if (c.job_id === jobId && c.type === commitmentType) {
        modified = true;
        return { ...c, state: newState };
      }
      return c;
    });
    if (modified) {
      await db.put('cache', shift);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('rivet:cache-updated', { detail: shift }));
      }
    }
  }
}
