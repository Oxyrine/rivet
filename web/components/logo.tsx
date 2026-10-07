'use client';

import * as React from 'react';

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'light' | 'dark' | 'compact';
}

export function Logo({ variant = 'light', className = '', style, ...props }: LogoProps) {
  const isCompact = variant === 'compact';
  const isDark = variant === 'dark';

  const textColor = isDark ? '#FFFFFF' : 'var(--ink, #111814)';
  const accentColor = isDark ? '#E86330' : 'var(--brand-accent, #C84C1C)';

  return (
    <div
      className={`rivet-logo-container ${className}`}
      aria-label="Rivet"
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        userSelect: 'none',
        ...style,
      }}
      {...props}
    >
      <style>{`
        .rivet-cursive-brand {
          font-family: var(--font-cursive), 'Caveat', 'Segoe Script', cursive;
          font-weight: 700;
          font-size: 38px;
          line-height: 1;
          letter-spacing: -0.5px;
          display: inline-block;
          position: relative;
          color: ${textColor};
          white-space: nowrap;
        }

        .rivet-cursive-animated {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          animation: writeRivetCursive 1.4s cubic-bezier(0.42, 0, 0.25, 1) 0.15s forwards;
          clip-path: inset(0 100% 0 0);
        }

        .rivet-cursive-flourish {
          position: absolute;
          bottom: -4px;
          left: 4px;
          width: 85%;
          height: 3px;
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: drawFlourish 0.6s ease-out 1.2s forwards;
        }

        @keyframes writeRivetCursive {
          from {
            clip-path: inset(0 100% 0 0);
          }
          to {
            clip-path: inset(0 0% 0 0);
          }
        }

        @keyframes drawFlourish {
          to {
            stroke-dashoffset: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rivet-cursive-animated {
            clip-path: inset(0 0% 0 0) !important;
            animation: none !important;
          }
          .rivet-cursive-flourish {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
        }
      `}</style>

      {isCompact ? (
        <span
          className="rivet-cursive-brand rivet-cursive-animated"
          style={{ fontSize: '34px', color: textColor }}
        >
          R
        </span>
      ) : (
        <span className="rivet-cursive-brand">
          <span className="rivet-cursive-animated">
            Rivet
          </span>
          {/* Subtle Accent Underline Flourish */}
          <svg className="rivet-cursive-flourish" viewBox="0 0 80 4" fill="none">
            <path
              d="M 2 2 C 25 1, 55 3.5, 78 2"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
