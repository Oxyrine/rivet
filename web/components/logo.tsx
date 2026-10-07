'use client';

import * as React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: 'light' | 'dark' | 'compact';
}

export function Logo({ variant = 'light', ...props }: LogoProps) {
  const isCompact = variant === 'compact';
  const isDark = variant === 'dark';

  // Palette
  const strokeColor = isDark ? '#FFFFFF' : 'var(--ink, #111814)';
  const accentColor = isDark ? '#E86330' : 'var(--brand-accent, #C84C1C)';

  if (isCompact) {
    return (
      <svg
        viewBox="0 0 44 48"
        fill="none"
        aria-label="Rivet"
        role="img"
        style={{
          display: 'block',
          width: 32,
          height: 34,
          overflow: 'visible',
        }}
        {...props}
      >
        <title>Rivet</title>
        <style>{`
          .cursive-r-compact {
            stroke-dasharray: 120;
            stroke-dashoffset: 120;
            animation: drawCompactR 0.9s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
          }
          @keyframes drawCompactR {
            to { stroke-dashoffset: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .cursive-r-compact { stroke-dashoffset: 0 !important; animation: none !important; }
          }
        `}</style>
        <g stroke={strokeColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path
            className="cursive-r-compact"
            d="
              M 12,10 L 10,34
              M 10,34 C 11,24 13,10 20,7 C 27,4 34,7 34,15 C 34,22 26,23 15,23
              C 20,23 24,28 28,34
            "
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 118 44"
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: 'auto',
        height: 32,
        minWidth: 98,
        overflow: 'visible',
      }}
      {...props}
    >
      <title>Rivet</title>
      <style>{`
        .rivet-cursive-main {
          stroke-dasharray: 380;
          stroke-dashoffset: 380;
          animation: drawCursiveRivet 1.6s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }
        .rivet-cursive-crossbar {
          stroke-dasharray: 20;
          stroke-dashoffset: 20;
          animation: drawCursiveCross 0.3s ease-out 1.45s forwards;
        }
        .rivet-cursive-dot {
          opacity: 0;
          transform-origin: 35px 13px;
          animation: popCursiveDot 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.55s forwards;
        }
        @keyframes drawCursiveRivet {
          to { stroke-dashoffset: 0; }
        }
        @keyframes drawCursiveCross {
          to { stroke-dashoffset: 0; }
        }
        @keyframes popCursiveDot {
          from { opacity: 0; transform: scale(0.2); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rivet-cursive-main,
          .rivet-cursive-crossbar {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
          .rivet-cursive-dot {
            opacity: 1 !important;
            transform: scale(1) !important;
            animation: none !important;
          }
        }
      `}</style>
      <g stroke={strokeColor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {/* Continuous calligraphic handwriting path for 'Rivet' */}
        <path
          className="rivet-cursive-main"
          d="
            M 12,10 L 10,34
            M 10,34 C 11,24 13,10 20,7 C 27,4 34,7 34,15 C 34,22 26,23 15,23
            C 19,23 23,28 26,34
            C 29,34 32,26 35,20
            L 35,34
            C 38,34 43,26 47,20
            C 49,27 52,34 55,34
            C 58,34 62,26 64,20
            C 66,19 68,22 70,26
            C 71,29 71,34 74,34
            C 76,30 79,20 83,20
            C 85,20 86,23 85,26
            C 83,28 77,29 76,31
            C 75,33 77,34 81,34
            C 86,34 92,20 95,8
            L 95,32
            C 95,34 98,34 104,31
          "
        />

        {/* Accented Cursive Crossbar on 't' */}
        <path
          className="rivet-cursive-crossbar"
          d="M 89,18 L 101,18"
          stroke={accentColor}
          strokeWidth="2.6"
        />

        {/* Accented Dot on 'i' */}
        <circle
          className="rivet-cursive-dot"
          cx="35"
          cy="13"
          r="2"
          fill={accentColor}
          stroke="none"
        />
      </g>
    </svg>
  );
}
