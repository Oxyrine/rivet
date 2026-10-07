import * as React from 'react';
import s from './ui.module.css';

export type StatusTone = 'positive' | 'warning' | 'critical' | 'neutral';

export function StatusLabel({ tone = 'neutral', children }: { tone?: StatusTone; children: React.ReactNode }) {
  const toneClass = {
    positive: s.statusPositive,
    warning: s.statusWarning,
    critical: s.statusCritical,
    neutral: s.statusNeutral,
  }[tone];

  return (
    <span className={`${s.statusLabel} ${toneClass}`}>
      {children}
    </span>
  );
}
