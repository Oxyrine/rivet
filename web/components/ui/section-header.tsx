import * as React from 'react';
import s from './ui.module.css';

interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className={s.sectionHeader}>
      <div className={s.sectionHeaderTop}>
        <div>
          <h2 className={s.sectionTitle}>{title}</h2>
          {description && <p className={s.sectionDescription}>{description}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    </div>
  );
}
