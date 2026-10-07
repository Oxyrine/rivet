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
          <path
            className="cursive-r-compact"
            d="M 10,12 L 10,38 M 10,12 C 16,8 28,9 28,18 C 28,24 20,24 10,24 C 15,24 20,28 25,38"
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 126 46"
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: 'auto',
        height: 34,
        minWidth: 104,
        overflow: 'visible',
      }}
      {...props}
    >
      <title>Rivet</title>
      <style>{`
        .rivet-cursive-word {
          stroke-dasharray: 360;
          stroke-dashoffset: 360;
          animation: drawCursiveWord 1.6s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }
        .rivet-cursive-crossbar {
          stroke-dasharray: 20;
          stroke-dashoffset: 20;
          animation: drawCursiveCross 0.3s ease-out 1.45s forwards;
        }
        .rivet-cursive-dot {
          opacity: 0;
          transform-origin: 38px 12px;
          animation: popCursiveDot 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.55s forwards;
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
          Spacious, perfectly kerned cursive wordmark:
          R: (12..28), i: (38..42), v: (54..72), e: (78..88), t: (102..114)
          Each letter is distinctly separated with natural flowing connectors.
        */}
        <path
          className="rivet-cursive-word"
          d="
            M 12,10 L 12,36
            M 12,10 C 18,8 28,9 28,17 C 28,23 20,23 12,23
            C 17,23 22,27 26,36
            C 30,36 34,26 38,20
            L 38,36
            C 43,36 49,26 54,20
            C 57,28 60,36 63,36
            C 66,36 69,26 72,20
            C 74,20 76,21 78,21
            C 82,18 87,20 87,25
            C 87,29 80,28 78,28
            C 76,33 80,36 85,36
            C 90,36 97,22 102,10
            L 102,34
            C 102,36 106,36 112,34
          "
        />

        {/* Accented Cursive Crossbar on 't' */}
        <path
          className="rivet-cursive-crossbar"
          d="M 95,20 L 109,20"
          stroke={accentColor}
          strokeWidth="2.8"
        />

        {/* Accented Dot on 'i' */}
        <circle
          className="rivet-cursive-dot"
          cx="38"
          cy="12"
          r="2.2"
          fill={accentColor}
          stroke="none"
        />
      </g>
    </svg>
  );
}
