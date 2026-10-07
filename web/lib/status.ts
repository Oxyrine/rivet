import type { StatusTone } from '@/components/ui/status-label';

export function getStatusConfig(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case 'pending_approval':
      return { label: 'Awaiting approval', tone: 'warning' };
    case 'approved':
      return { label: 'Approved, unassigned', tone: 'warning' };
    case 'assigned':
      return { label: 'Assigned', tone: 'neutral' };
    case 'in_progress':
      return { label: 'In progress', tone: 'neutral' };
    case 'completed':
      return { label: 'Completed', tone: 'positive' };
    case 'verified':
    case 'accepted':
      return { label: 'Verified', tone: 'positive' };
    case 'breached':
      return { label: 'Breached', tone: 'critical' };
    case 'at_risk':
      return { label: 'At risk', tone: 'warning' };
    default:
      return { label: state.replaceAll('_', ' '), tone: 'neutral' };
  }
}
