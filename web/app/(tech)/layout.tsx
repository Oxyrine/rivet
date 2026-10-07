import React from 'react';

export const metadata = {
  title: 'Technician Field App · Rivet',
  description: 'Evidence-preserving offline technician field application',
};

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tech-layout">
      {children}
    </div>
  );
}
