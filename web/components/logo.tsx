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
            stroke-dasharray: 140;
            stroke-dashoffset: 140;
            animation: drawCompactR 1s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
          }
          @keyframes drawCompactR {
            to { stroke-dashoffset: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .cursive-r-compact { stroke-dashoffset: 0 !important; animation: none !important; }
          }
        `}</style>
        <g stroke={strokeColor} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          {/* Distinct, highly readable cursive R */}
          <path
            className="cursive-r-compact"
            d="M 10,12 L 10,38 M 10,12 C 10,12 18,7 26,10 C 32,12 33,20 27,24 C 21,27 12,25 10,25 C 15,25 21,25 25,38"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 114 48"
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
        .rivet-cursive-word {
          stroke-dasharray: 320;
          stroke-dashoffset: 320;
          animation: drawCursiveWord 1.5s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }
        .rivet-cursive-crossbar {
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          animation: drawCursiveCross 0.3s ease-out 1.35s forwards;
        }
        .rivet-cursive-dot {
          opacity: 0;
          transform-origin: 39px 12px;
          animation: popCursiveDot 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.45s forwards;
        }
        @keyframes drawCursiveWord {
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
          .rivet-cursive-word,
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
      <g stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* 
          Extremely clean, legible cursive handwriting for 'Rivet'
          R: Stem (10,12 to 10,38), Bowl (10,12 -> 25,10 -> 26,22 -> 10,23), Leg (10,23 -> 22,38)
          i: (22,38 -> 37,20 -> 40,38)
          v: (40,38 -> 47,20 -> 52,38 -> 58,20 -> 61,22)
          e: (61,22 -> 68,19 -> 71,24 -> 63,28 -> 68,38)
          t: (68,38 -> 80,8 -> 80,36 -> 90,38)
        */}
        <path
          className="rivet-cursive-word"
          d="
            M 10,12 L 10,38
            M 10,12 C 16,7 26,9 26,17 C 26,23 18,24 10,24
            C 16,24 20,28 24,38
            C 28,38 34,26 38,20
            L 40,38
            C 43,38 46,26 49,20
            C 51,28 53,38 56,38
            C 58,38 61,25 63,20
            C 65,22 67,23 70,20
            C 73,18 75,23 73,27
            C 68,30 63,30 66,38
            C 68,38 76,20 81,8
            L 81,35
            C 81,38 85,38 90,37
          "
        />

        {/* Accented Cursive Crossbar on 't' */}
        <path
          className="rivet-cursive-crossbar"
          d="M 74,18 L 88,18"
          stroke={accentColor}
          strokeWidth="2.8"
        />

        {/* Accented Dot on 'i' */}
        <circle
          className="rivet-cursive-dot"
          cx="39"
          cy="12"
          r="2.2"
          fill={accentColor}
          stroke="none"
        />
      </g>
    </svg>
  );
}
