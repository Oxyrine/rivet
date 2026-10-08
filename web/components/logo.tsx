'use client';

import * as React from 'react';

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'light' | 'dark' | 'compact';
}

export function Logo({ variant = 'light', className = '', style, ...props }: LogoProps) {
  const [replayKey, setReplayKey] = React.useState(0);
  const isCompact = variant === 'compact';
  const isDark = variant === 'dark';

  const strokeColor = isDark ? '#FFFFFF' : 'var(--ink, #111814)';
  const accentColor = isDark ? '#E86330' : 'var(--brand-accent, #C84C1C)';

  const handleReplay = () => {
    setReplayKey(prev => prev + 1);
  };

  return (
    <div
      key={replayKey}
      className={`rivet-logo-container ${className}`}
      aria-label="Rivet"
      role="img"
      onClick={handleReplay}
      title="Click to replay handwriting animation"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        userSelect: 'none',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    >
      <style>{`
        /* Authentic pen stroke handwriting animations */
        .handwritten-main-stroke {
          stroke-dasharray: 450;
          stroke-dashoffset: 450;
          animation: drawHandwrittenPath 1.6s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }

        .handwritten-crossbar-stroke {
          stroke-dasharray: 25;
          stroke-dashoffset: 25;
          animation: drawHandwrittenCrossbar 0.25s ease-out 1.55s forwards;
        }

        .handwritten-dot-ink {
          opacity: 0;
          transform-origin: 40px 12px;
          animation: dropInkDot 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) 1.65s forwards;
        }

        .handwritten-pen-tip {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${accentColor};
          box-shadow: 0 0 8px ${accentColor};
          pointer-events: none;
          opacity: 0;
          animation: tracePenHandwriting 1.85s cubic-bezier(0.42, 0, 0.25, 1) 0.1s forwards;
        }

        /* Stroke drawing keyframes */
        @keyframes drawHandwrittenPath {
          0% {
            stroke-dashoffset: 450;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes drawHandwrittenCrossbar {
          0% {
            stroke-dashoffset: 25;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes dropInkDot {
          0% {
            opacity: 0;
            transform: scale(0.2);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* Pen tip follows the handwriting path from R -> i -> v -> e -> t -> crossbar -> dot */
        @keyframes tracePenHandwriting {
          0% {
            opacity: 1;
            left: 10%;
            top: 22%;
          }
          12% {
            left: 10%;
            top: 78%;
          }
          24% {
            left: 23%;
            top: 32%;
          }
          32% {
            left: 22%;
            top: 78%;
          }
          42% {
            left: 33%;
            top: 44%;
          }
          50% {
            left: 33%;
            top: 78%;
          }
          58% {
            left: 45%;
            top: 44%;
          }
          66% {
            left: 54%;
            top: 78%;
          }
          74% {
            left: 64%;
            top: 44%;
          }
          82% {
            left: 74%;
            top: 78%;
          }
          90% {
            left: 88%;
            top: 18%;
          }
          94% {
            left: 88%;
            top: 74%;
          }
          97% {
            left: 96%;
            top: 68%;
            opacity: 1;
          }
          98% {
            left: 80%;
            top: 41%;
            opacity: 0.9;
          }
          99% {
            left: 93%;
            top: 41%;
            opacity: 0.7;
          }
          100% {
            left: 33%;
            top: 26%;
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .handwritten-main-stroke,
          .handwritten-crossbar-stroke {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
          .handwritten-dot-ink {
            opacity: 1 !important;
            transform: scale(1) !important;
            animation: none !important;
          }
          .handwritten-pen-tip {
            display: none !important;
          }
        }
      `}</style>

      {isCompact ? (
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
        >
          <title>Rivet</title>
          <g stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {/* R stem & lobe */}
            <path
              className="handwritten-main-stroke"
              d="
                M 14,10 L 12,36
                M 12,36 C 13,24 15,10 22,7 C 29,4 35,7 35,15 C 35,22 27,23 15,23
                C 19,23 23,28 27,36
              "
            />
          </g>
        </svg>
      ) : (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          {/* Animated Pen Nib Indicator */}
          <span className="handwritten-pen-tip" aria-hidden="true" />

          {/* Genuine SVG Cursive Handwriting Wordmark */}
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
          >
            <title>Rivet</title>
            <g strokeLinecap="round" strokeLinejoin="round">
              {/* Main continuous cursive handwriting stroke: R -> i -> v -> e -> t */}
              <path
                className="handwritten-main-stroke"
                d="
                  M 14,10 L 12,36
                  M 12,36 C 13,24 15,10 22,7 C 29,4 35,7 35,15 C 35,22 27,23 15,23
                  C 19,23 23,28 27,36
                  C 31,36 36,26 40,20
                  L 40,36
                  C 44,36 50,26 56,20
                  C 59,28 62,36 66,36
                  C 70,36 74,26 77,20
                  C 79,20 82,22 84,25
                  C 86,28 89,20 93,20
                  C 95,20 96,23 95,26
                  C 93,28 87,29 86,31
                  C 85,33 87,36 92,36
                  C 97,36 103,20 106,8
                  L 106,33
                  C 106,36 110,36 118,32
                "
                stroke={strokeColor}
                strokeWidth="2.8"
              />

              {/* Accented Crossbar on 't' */}
              <path
                className="handwritten-crossbar-stroke"
                d="M 98,19 L 114,19"
                stroke={accentColor}
                strokeWidth="2.8"
              />

              {/* Accented Dot on 'i' */}
              <circle
                className="handwritten-dot-ink"
                cx="40"
                cy="12"
                r="2.2"
                fill={accentColor}
                stroke="none"
              />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
