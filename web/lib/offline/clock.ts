/**
 * Client-side clock skew tracker.
 * Calibrates local time against server HTTP Date response headers or timestamps.
 */

const CLOCK_SKEW_STORAGE_KEY = 'rivet.clock-skew-offset-ms';

let inMemorySkewOffsetMs = 0;

if (typeof window !== 'undefined') {
  const saved = localStorage.getItem(CLOCK_SKEW_STORAGE_KEY);
  if (saved) {
    inMemorySkewOffsetMs = parseInt(saved, 10) || 0;
  }
}

/**
 * Calibrate clock against server timestamp or Date header
 */
export function recordServerTime(serverTimestampIsoOrDateHeader: string): number {
  try {
    const serverTimeMs = new Date(serverTimestampIsoOrDateHeader).getTime();
    if (isNaN(serverTimeMs)) return inMemorySkewOffsetMs;

    const localNow = Date.now();
    const skew = serverTimeMs - localNow;

    inMemorySkewOffsetMs = skew;
    if (typeof window !== 'undefined') {
      localStorage.setItem(CLOCK_SKEW_STORAGE_KEY, skew.toString());
    }
    return skew;
  } catch {
    return inMemorySkewOffsetMs;
  }
}

/**
 * Get current skew offset in milliseconds
 */
export function getClockSkewOffsetMs(): number {
  return inMemorySkewOffsetMs;
}

/**
 * Get normalized ISO timestamp incorporating calibrated server clock skew
 */
export function getNormalizedIsoTime(): string {
  const adjustedMs = Date.now() + inMemorySkewOffsetMs;
  return new Date(adjustedMs).toISOString();
}

/**
 * Reset clock skew offset (for testing or re-sync)
 */
export function resetClockSkew(): void {
  inMemorySkewOffsetMs = 0;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CLOCK_SKEW_STORAGE_KEY);
  }
}
