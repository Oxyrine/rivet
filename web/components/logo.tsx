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
      viewBox="0 0 150 46"
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: 'auto',
        height: 32,
        minWidth: 110,
        overflow: 'visible',
      }}
      {...props}
    >
      <title>Rivet</title>
      <style>{`
        .rivet-cursive-main {
          stroke-dasharray: 440;
          stroke-dashoffset: 440;
          animation: drawCursiveRivet 1.6s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }
        .rivet-cursive-crossbar {
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          animation: drawCursiveCross 0.3s ease-out 1.45s forwards;
        }
        .rivet-cursive-dot {
          opacity: 0;
          transform-origin: 48px 12px;
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
        {/* 
          Spacious, wide-kerning cursive handwriting:
          R: (12..28), i: (48), v: (68..84), e: (96..108), t: (124..136)
          Generous breathing room between every single letter.
        */}
        <path
          className="rivet-cursive-main"
          d="
            M 14,10 L 12,34
            M 12,34 C 13,24 15,10 22,7 C 29,4 34,7 34,14 C 34,21 26,22 14,22
            C 18,22 22,27 26,34
            C 33,34 41,26 48,20
            L 48,34
            C 55,34 62,26 68,20
            C 71,27 74,34 78,34
            C 82,34 85,26 88,20
            C 91,20 94,22 96,25
            C 98,28 98,34 102,34
            C 105,30 108,20 112,20
            C 114,20 115,23 114,26
            C 112,28 106,29 105,31
            C 104,33 106,34 110,34
            C 116,34 122,20 126,8
            L 126,32
            C 126,34 130,34 136,31
          "
        />

        {/* Accented Cursive Crossbar on 't' */}
        <path
          className="rivet-cursive-crossbar"
          d="M 118,18 L 134,18"
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
