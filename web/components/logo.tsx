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
        viewBox="0 0 44 44"
        fill="none"
        aria-label="Rivet"
        role="img"
        style={{
          display: 'block',
          width: 32,
          height: 32,
          overflow: 'visible',
        }}
        {...props}
      >
        <title>Rivet</title>
        <style>{`
          .cursive-r-stem {
            stroke-dasharray: 60;
            stroke-dashoffset: 60;
            animation: writeRCompact 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s forwards;
          }
          .cursive-r-bowl {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            animation: writeRCompact 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
          }
          @keyframes writeRCompact {
            to { stroke-dashoffset: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .cursive-r-stem, .cursive-r-bowl { stroke-dashoffset: 0 !important; animation: none !important; }
          }
        `}</style>
        <g stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          {/* Cursive R Stem */}
          <path
            className="cursive-r-stem"
            d="M 16,10 C 13,6 8,13 11,20 C 13,26 14.5,33 13,38"
          />
          {/* Cursive R Bowl & Dynamic Leg */}
          <path
            className="cursive-r-bowl"
            stroke={accentColor}
            d="M 13,34 C 14,25 18,10 25,6 C 33,2 41,6 39,16 C 37,23 29,25 21,24 C 25,24 29,27 31,33 C 33,37 36,39 40,38"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 46"
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: 'auto',
        height: 34,
        minWidth: 92,
        overflow: 'visible',
      }}
      {...props}
    >
      <title>Rivet</title>
      <style>{`
        .rivet-cursive-main {
          stroke-dasharray: 360;
          stroke-dashoffset: 360;
          animation: drawCursiveRivet 1.6s cubic-bezier(0.42, 0, 0.25, 1) 0.15s forwards;
        }
        .rivet-cursive-crossbar {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: drawCursiveRivet 0.35s ease-out 1.45s forwards;
        }
        .rivet-cursive-dot {
          opacity: 0;
          transform-origin: 48px 14px;
          animation: popCursiveDot 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.55s forwards;
        }
        @keyframes drawCursiveRivet {
          to { stroke-dashoffset: 0; }
        }
        @keyframes popCursiveDot {
          from { opacity: 0; transform: scale(0.3); }
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
      <g>
        {/* Continuous Cursive Handwriting Path: R -> i -> v -> e -> t */}
        <path
          className="rivet-cursive-main"
          d="M 14,14 C 11,9 7,16 10,23 C 12,28 13.5,35 12,40 C 13,31 16,14 23,9 C 29,5 37,8 36,17 C 35,24 28,26 21,25 C 24,25 28,28 30,34 C 32,38 35,40 39,39 C 42,38 45,28 47,23 C 48,27 48,34 50,38 C 51,40 53,39 55,34 C 57,28 59,23 62,23 C 64,28 65,38 68,38 C 71,38 72,28 74,24 C 76,22 79,25 80,28 C 82,31 84,23 87,23 C 89,24 90,29 87,33 C 84,37 81,38 83,38 C 86,38 90,34 93,28 C 96,22 98,12 100,9 C 100,16 100,32 101,37 C 102,40 105,39 109,33"
          stroke={strokeColor}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Cursive t Crossbar */}
        <path
          className="rivet-cursive-crossbar"
          d="M 93,19 C 97,18.5 103,18.5 107,19"
          stroke={accentColor}
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        {/* Cursive i Dot */}
        <circle
          className="rivet-cursive-dot"
          cx="48"
          cy="14"
          r="2"
          fill={accentColor}
        />
      </g>
    </svg>
  );
}
