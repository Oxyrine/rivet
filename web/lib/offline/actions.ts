import { enqueueCommand, QueuedCommand } from './queue';

export interface ActionContext {
  userId: string;
  deviceId: string;
  jobId: string;
}

/**
 * Single code path for all technician field actions.
 * Every action, online or offline, goes directly into the IndexedDB queue first.
 */
export async function executeTechnicianAction(
  context: ActionContext,
  actionType: string,
  payload: Record<string, any> = {}
): Promise<QueuedCommand> {
  const cmd = await enqueueCommand({
    type: actionType,
    job_id: context.jobId,
    user_id: context.userId,
    device_id: context.deviceId,
    payload,
  });

  // Attempt replay if online (managed by replay module in Task 3)
  if (typeof window !== 'undefined' && navigator.onLine) {
    window.dispatchEvent(new CustomEvent('rivet:trigger-replay'));
  }

  return cmd;
}
