import { getQueuedCommands, updateCommandStatus, setDeviceLastKnownSeq, QueuedCommand } from './queue';
import { getDB } from './db';
import { api, getSession } from '@/lib/api';

export interface SyncResultSummary {
  total: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  sequenceGaps: number;
  lastSync: string;
  /** Set when nothing was sent because the device has no signed-in session. */
  blocked?: 'auth';
  results: Array<{
    idempotency_key: string;
    status: 'accepted' | 'duplicate' | 'rejected' | 'deferred' | 'held_gap';
    result?: any;
    code?: string;
    message?: string;
  }>;
}

const BATCH_SIZE = 10;

/**
 * Replays queued commands in strict order:
 * 1. ReportDropout commands sent first
 * 2. All remaining commands sent in monotonic device_seq order
 * 3. Sent in batches of up to 10 commands to /devices/{deviceId}/commands
 * 4. Per-command results persisted back to IndexedDB
 */
export async function replayPendingCommands(
  deviceId: string,
  authToken?: string
): Promise<SyncResultSummary> {
  const allQueued = await getQueuedCommands(deviceId);

  if (allQueued.length === 0) {
    const nowIso = new Date().toISOString();
    return {
      total: 0,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      sequenceGaps: 0,
      lastSync: nowIso,
      results: [],
    };
  }

  // Nothing can be accepted without a signed-in user. Keep the queue on the device and
  // tell the page, rather than posting to the server and collecting a 401 per trigger.
  const token = authToken ?? getSession()?.token;
  if (!token) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rivet:auth-required', { detail: { pending: allQueued.length } }));
    }
    return {
      total: allQueued.length,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      sequenceGaps: 0,
      lastSync: new Date().toISOString(),
      results: [],
      blocked: 'auth',
    };
  }

  // 1. Separate dropout commands (sent first) and regular commands
  const dropouts = allQueued.filter((c) => c.type === 'ReportDropout');
  const regular = allQueued
    .filter((c) => c.type !== 'ReportDropout')
    .sort((a, b) => a.device_seq - b.device_seq);

  const orderedCommands = [...dropouts, ...regular];

  // Upload pending photos off-queue before command batch so server has bytes ready for EvidenceAttached
  try {
    const { uploadPendingPhotos } = await import('./photos');
    await uploadPendingPhotos(authToken);
  } catch (photoErr) {
    console.warn('[RIVET] Non-blocking photo upload deferral during replay:', photoErr);
  }

  let totalAccepted = 0;
  let totalDuplicates = 0;
  let totalRejected = 0;
  let totalGaps = 0;
  const allResults: SyncResultSummary['results'] = [];

  // 2. Process in batches
  for (let i = 0; i < orderedCommands.length; i += BATCH_SIZE) {
    const batch = orderedCommands.slice(i, i + BATCH_SIZE);

    const payload = {
      commands: batch.map((cmd) => ({
        idempotency_key: cmd.idempotency_key,
        device_seq: cmd.device_seq,
        device_ts: cmd.device_ts,
        user_id: cmd.user_id,
        type: cmd.type,
        job_id: cmd.job_id,
        payload: cmd.payload,
        prev_hash: cmd.prev_hash,
        hash: cmd.hash,
      })),
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await api<{
        results: Array<{
          idempotency_key: string;
          status: 'accepted' | 'duplicate' | 'rejected' | 'deferred' | 'held_gap';
          result?: any;
          original?: any;
          code?: string;
          message?: string;
        }>;
        last_seq: number;
        sequence_gaps: number;
        server_ts?: string;
      }>(`/devices/${deviceId}/commands`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (response && response.results) {
        totalGaps = response.sequence_gaps || 0;
        await setDeviceLastKnownSeq(deviceId, response.last_seq);

        if (response.server_ts) {
          const { recordServerTime } = await import('./clock');
          recordServerTime(response.server_ts);
        }

        for (const res of response.results) {
          allResults.push(res);
          if (res.status === 'accepted') {
            totalAccepted++;
            await updateCommandStatus(res.idempotency_key, 'accepted', res.result);
          } else if (res.status === 'duplicate') {
            totalDuplicates++;
            await updateCommandStatus(res.idempotency_key, 'duplicate', res.original || res.result);
          } else if (res.status === 'rejected') {
            totalRejected++;
            await updateCommandStatus(res.idempotency_key, 'rejected', null, res.code, res.message);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[REPLAY] Batch error for ${deviceId}:`, err.message);
      if (err?.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('rivet:auth-required', { detail: { pending: orderedCommands.length - i } }));
      }
      // Stop further batches if network or severe failure occurs
      break;
    }
  }

  const nowIso = new Date().toISOString();
  const summary: SyncResultSummary = {
    total: orderedCommands.length,
    accepted: totalAccepted,
    duplicates: totalDuplicates,
    rejected: totalRejected,
    sequenceGaps: totalGaps,
    lastSync: nowIso,
    results: allResults,
  };

  // Record last sync in meta
  try {
    const db = await getDB();
    const meta = (await db.get('meta', deviceId)) || { device_id: deviceId, last_seq: 0 };
    meta.last_sync = nowIso;
    await db.put('meta', meta);
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rivet:sync-completed', { detail: summary }));
    window.dispatchEvent(new CustomEvent('rivet:queue-change'));
  }

  return summary;
}

/**
 * Initializes automatic replay listeners:
 * - online event
 * - visibilitychange event (app brought to front)
 * - Android Service Worker Background Sync message
 * - Custom event 'rivet:trigger-replay'
 */
export function initReplayListeners(
  getDeviceId: () => string,
  getAuthToken: () => string | undefined
): () => void {
  if (typeof window === 'undefined') return () => {};

  let isReplaying = false;

  const runReplay = async () => {
    if (isReplaying || !navigator.onLine) return;
    const deviceId = getDeviceId();
    const token = getAuthToken();
    if (!deviceId) return;

    isReplaying = true;
    try {
      await replayPendingCommands(deviceId, token);
    } catch (err) {
      console.debug('[REPLAY] Replay cycle error:', err);
    } finally {
      isReplaying = false;
    }
  };

  const handleOnline = () => {
    console.log('[REPLAY] Back online, triggering replay...');
    runReplay();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      console.log('[REPLAY] App brought to foreground, triggering replay...');
      runReplay();
    }
  };

  const handleTrigger = () => {
    runReplay();
  };

  const handleSwMessage = (event: MessageEvent) => {
    if (event.data?.type === 'RIVET_BACKGROUND_SYNC') {
      console.log('[REPLAY] Android Background Sync received, triggering replay...');
      runReplay();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('rivet:trigger-replay', handleTrigger);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
  }

  // Trigger once on mount if online
  if (navigator.onLine) {
    runReplay();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('rivet:trigger-replay', handleTrigger);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
  };
}

/**
 * Detects iOS environment
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
