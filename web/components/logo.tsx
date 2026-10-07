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
        viewBox="0 0 44 46"
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
              M 14,10 L 14,34
              M 14,34 C 14,24 16,10 22,7 C 28,4 34,7 34,14 C 34,21 26,22 14,22
              C 19,22 23,27 27,34
            "
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 136 44"
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: 'auto',
        height: 32,
        minWidth: 102,
        overflow: 'visible',
      }}
      {...props}
    >
      <title>Rivet</title>
      <style>{`
        .rivet-cursive-main {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
          animation: drawCursiveRivet 1.5s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }
        .rivet-cursive-crossbar {
          stroke-dasharray: 20;
          stroke-dashoffset: 20;
          animation: drawCursiveCross 0.3s ease-out 1.35s forwards;
        }
        .rivet-cursive-dot {
          opacity: 0;
          transform-origin: 48px 12px;
          animation: popCursiveDot 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.45s forwards;
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
        {/* 
          Mathematically balanced typographic cursive cadence:
          Every character cell is strictly 22px wide on a uniform baseline:
          R: (14..36), i: (36..58), v: (58..80), e: (80..102), t: (102..124)
        */}
        <path
          className="rivet-cursive-main"
          d="
            M 14,10 L 14,34
            M 14,34 C 14,24 16,10 22,7 C 28,4 34,7 34,14 C 34,21 26,22 14,22
            C 19,22 23,27 27,34
            C 31,34 35,24 40,20
            C 44,20 48,20 48,20
            L 48,34
            C 52,34 56,24 62,20
            C 66,27 69,34 72,34
            C 75,34 78,27 82,20
            C 84,20 86,20 88,20
            C 92,18 96,19 96,24
            C 96,28 90,28 89,30
            C 88,33 92,34 96,34
            C 101,34 106,20 110,8
            L 110,32
            C 110,34 114,34 120,31
          "
        />

        {/* Accented Cursive Crossbar on 't' */}
        <path
          className="rivet-cursive-crossbar"
          d="M 102,18 L 118,18"
          stroke={accentColor}
          strokeWidth="2.6"
        />

        {/* Accented Dot on 'i' */}
        <circle
          className="rivet-cursive-dot"
          cx="48"
          cy="12"
          r="2.2"
          fill={accentColor}
          stroke="none"
        />
      </g>
    </svg>
  );
}
