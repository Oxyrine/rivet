'use client';

import * as React from 'react';

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'light' | 'dark' | 'compact';
}

export function Logo({ variant = 'light', className = '', style, ...props }: LogoProps) {
  const [replayKey, setReplayKey] = React.useState(0);
  const isCompact = variant === 'compact';
  const isDark = variant === 'dark';

  const textColor = isDark ? '#FFFFFF' : 'var(--ink, #111814)';
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
        .rivet-logo-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .rivet-cursive-text {
          font-family: var(--font-cursive), 'Caveat', 'Segoe Script', cursive;
          font-weight: 700;
          font-size: 36px;
          line-height: 1;
          letter-spacing: -0.5px;
          color: ${textColor};
          white-space: nowrap;
          display: inline-block;
          position: relative;
        }

        /* Writing handwriting reveal animation: R -> i -> v -> e -> t */
        .rivet-writing-layer {
          display: inline-block;
          white-space: nowrap;
          clip-path: inset(0 100% 0 0);
          animation: writeFromRToT 1.35s cubic-bezier(0.45, 0.05, 0.25, 1) 0.1s forwards;
        }

        /* Animated Pen-Tip / Ink Nib traveling from R to T */
        .rivet-pen-nib {
          position: absolute;
          top: 50%;
          left: 0;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: ${accentColor};
          box-shadow: 0 0 6px ${accentColor};
          transform: translateY(-50%);
          pointer-events: none;
          opacity: 0;
          animation: travelPenNib 1.35s cubic-bezier(0.45, 0.05, 0.25, 1) 0.1s forwards;
        }

        /* Underline flourish drawing in as 't' completes */
        .rivet-flourish-stroke {
          position: absolute;
          bottom: -4px;
          left: 4px;
          width: 82%;
          height: 3px;
          stroke-dasharray: 90;
          stroke-dashoffset: 90;
          animation: writeFlourish 0.5s ease-out 1.25s forwards;
        }

        /* Final static logo settle state */
        .rivet-static-settle {
          animation: settleFinalLogo 0.3s ease-out 1.4s forwards;
        }

        @keyframes writeFromRToT {
          0% {
            clip-path: inset(0 100% 0 0);
          }
          100% {
            clip-path: inset(0 0% 0 0);
          }
        }

        @keyframes travelPenNib {
          0% {
            left: 0%;
            opacity: 1;
            transform: translateY(-40%) scale(1.2);
          }
          20% {
            transform: translateY(-10%) scale(1);
          }
          40% {
            transform: translateY(-50%) scale(1.1);
          }
          60% {
            transform: translateY(-20%) scale(1);
          }
          85% {
            left: 92%;
            opacity: 1;
            transform: translateY(-60%) scale(1.2);
          }
          98% {
            left: 98%;
            opacity: 0.8;
            transform: translateY(-40%) scale(0.9);
          }
          100% {
            left: 100%;
            opacity: 0;
            transform: translateY(-50%) scale(0);
          }
        }

        @keyframes writeFlourish {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes settleFinalLogo {
          from {
            filter: drop-shadow(0 0 1px rgba(232, 99, 48, 0.4));
          }
          to {
            filter: drop-shadow(0 0 0 transparent);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rivet-writing-layer {
            clip-path: inset(0 0% 0 0) !important;
            animation: none !important;
          }
          .rivet-pen-nib {
            display: none !important;
          }
          .rivet-flourish-stroke {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
        }
      `}</style>

      {isCompact ? (
        <div className="rivet-logo-wrapper">
          <span
            className="rivet-cursive-text rivet-writing-layer"
            style={{ fontSize: '32px', color: textColor }}
          >
            R
          </span>
          <span className="rivet-pen-nib" style={{ height: '4px', width: '4px' }} />
        </div>
      ) : (
        <div className="rivet-logo-wrapper rivet-static-settle">
          {/* Main Cursive Handwriting Text */}
          <span className="rivet-cursive-text rivet-writing-layer">
            Rivet
          </span>

          {/* Traveling Ink Pen Nib */}
          <span className="rivet-pen-nib" aria-hidden="true" />

          {/* Underline Flourish */}
          <svg className="rivet-flourish-stroke" viewBox="0 0 80 4" fill="none" aria-hidden="true">
            <path
              d="M 2 2 C 24 1, 52 3.5, 78 2"
              stroke={accentColor}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
