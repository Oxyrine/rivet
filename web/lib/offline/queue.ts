import { getDB, QueuedCommand, DeviceMeta } from './db';
import { sha256 } from './hash';
import { getNormalizedIsoTime, getClockSkewOffsetMs } from './clock';

export type { QueuedCommand, DeviceMeta } from './db';

const MAX_COMMANDS = 500;
const WARNING_THRESHOLD = 0.8; // 80% warning
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface QueueLimits {
  commandsCount: number;
  maxCommands: number;
  isWarning: boolean;
  isFull: boolean;
}

export async function getNextDeviceSeq(deviceId: string): Promise<number> {
  const db = await getDB();
  const meta = (await db.get('meta', deviceId)) as DeviceMeta | undefined;
  let nextSeq = (meta?.last_seq || 0) + 1;

  // Double check with existing commands to guarantee monotonicity
  const allCmds = await db.getAllFromIndex('commands', 'by_device', deviceId);
  for (const cmd of allCmds) {
    if (cmd.device_seq >= nextSeq) {
      nextSeq = cmd.device_seq + 1;
    }
  }

  // Update meta
  await db.put('meta', {
    device_id: deviceId,
    last_seq: nextSeq,
    last_sync: meta?.last_sync,
    last_hash: meta?.last_hash,
  });

  return nextSeq;
}

export async function setDeviceLastKnownSeq(deviceId: string, lastSeq: number): Promise<void> {
  const db = await getDB();
  const meta = (await db.get('meta', deviceId)) as DeviceMeta | undefined;
  if (!meta || meta.last_seq < lastSeq) {
    await db.put('meta', {
      device_id: deviceId,
      last_seq: lastSeq,
      last_sync: meta?.last_sync,
      last_hash: meta?.last_hash,
    });
  }
}

export async function getQueueLimits(deviceId?: string): Promise<QueueLimits> {
  const db = await getDB();
  let count = 0;
  if (deviceId) {
    const cmds = await db.getAllFromIndex('commands', 'by_device', deviceId);
    count = cmds.filter((c) => c.status === 'queued').length;
  } else {
    const cmds = await db.getAll('commands');
    count = cmds.filter((c) => c.status === 'queued').length;
  }

  return {
    commandsCount: count,
    maxCommands: MAX_COMMANDS,
    isWarning: count >= MAX_COMMANDS * WARNING_THRESHOLD,
    isFull: count >= MAX_COMMANDS,
  };
}

export async function enqueueCommand(params: {
  type: string;
  job_id: string;
  user_id: string;
  device_id: string;
  payload?: Record<string, any>;
  customIdempotencyKey?: string;
}): Promise<QueuedCommand> {
  const db = await getDB();
  const limits = await getQueueLimits(params.device_id);

  if (limits.isFull) {
    throw new Error('Offline queue is full (max 500 commands). Please reconnect to sync.');
  }

  const deviceSeq = await getNextDeviceSeq(params.device_id);
  const idempotencyKey =
    params.customIdempotencyKey ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Tier 2 #1 Device Hash Link calculation
  const meta = (await db.get('meta', params.device_id)) as DeviceMeta | undefined;
  const prevHash = meta?.last_hash || GENESIS_HASH;

  // Normalized time with calibrated server clock skew
  const normalizedTs = getNormalizedIsoTime();
  const skewMs = getClockSkewOffsetMs();

  const payloadObj = params.payload || {};
  const canonicalPayload = JSON.stringify(payloadObj, Object.keys(payloadObj).sort());
  const hashPreimage = `${prevHash}:${deviceSeq}:${params.user_id}:${params.type}:${params.job_id}:${idempotencyKey}:${canonicalPayload}`;
  const currentHash = await sha256(hashPreimage);

  const cmd: QueuedCommand = {
    idempotency_key: idempotencyKey,
    device_seq: deviceSeq,
    device_ts: normalizedTs,
    user_id: params.user_id,
    device_id: params.device_id,
    type: params.type,
    job_id: params.job_id,
    payload: payloadObj,
    status: 'queued',
    created_at: new Date().toISOString(),
    prev_hash: prevHash,
    hash: currentHash,
    clock_skew_ms: skewMs,
  };

  // Update meta with newest sequence and hash
  await db.put('meta', {
    device_id: params.device_id,
    last_seq: deviceSeq,
    last_sync: meta?.last_sync,
    last_hash: currentHash,
  });

  await db.put('commands', cmd);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rivet:queue-change', { detail: cmd }));
  }

  return cmd;
}

export async function getQueuedCommands(deviceId?: string): Promise<QueuedCommand[]> {
  const db = await getDB();
  let cmds: QueuedCommand[];
  if (deviceId) {
    cmds = await db.getAllFromIndex('commands', 'by_device', deviceId);
  } else {
    cmds = await db.getAll('commands');
  }

  // Filter for queued commands and sort monotonically by device_seq
  return cmds
    .filter((c) => c.status === 'queued')
    .sort((a, b) => a.device_seq - b.device_seq);
}

export async function getQueuedCommandsForUser(userId: string): Promise<QueuedCommand[]> {
  const db = await getDB();
  const cmds = await db.getAllFromIndex('commands', 'by_user', userId);
  return cmds
    .filter((c) => c.status === 'queued')
    .sort((a, b) => a.device_seq - b.device_seq);
}

export async function getAllCommands(deviceId?: string): Promise<QueuedCommand[]> {
  const db = await getDB();
  let cmds: QueuedCommand[];
  if (deviceId) {
    cmds = await db.getAllFromIndex('commands', 'by_device', deviceId);
  } else {
    cmds = await db.getAll('commands');
  }
  return cmds.sort((a, b) => a.device_seq - b.device_seq);
}

export async function updateCommandStatus(
  idempotencyKey: string,
  status: QueuedCommand['status'],
  result?: any,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const db = await getDB();
  const cmd = await db.get('commands', idempotencyKey);
  if (cmd) {
    cmd.status = status;
    if (result !== undefined) cmd.result = result;
    if (errorCode) cmd.error_code = errorCode;
    if (errorMessage) cmd.error_message = errorMessage;
    await db.put('commands', cmd);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rivet:queue-change', { detail: cmd }));
    }
  }
}

export async function clearAllCommands(): Promise<void> {
  const db = await getDB();
  await db.clear('commands');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rivet:queue-change'));
  }
}
