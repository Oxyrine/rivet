import * as React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: 'light' | 'dark' | 'compact';
}

export function Logo({ variant = 'light', ...props }: LogoProps) {
  const isCompact = variant === 'compact';
  const isDark = variant === 'dark';
  
  // Palette
  const textColor = isDark ? '#FFFFFF' : 'var(--ink, #111814)';
  const accentColor = isDark ? '#E86330' : 'var(--brand-accent, #C84C1C)';

  if (isCompact) {
    return (
      <svg
        viewBox="0 0 46 40"
        fill="none"
        aria-label="Rivet"
        role="img"
        style={{
          display: 'block',
          width: 32,
          height: 32,
        }}
        {...props}
      >
        <title>Rivet</title>
        {/* Artistic Sculpted 'R' */}
        <g>
          {/* Main vertical spine & top hook */}
          <path
            d="M 9 9 C 7 7, 10 5, 14 5.5 C 16.5 5.8, 16 9, 15.2 13 C 14.5 17, 14 23, 13.5 29 C 13.2 31.5, 11 31.5, 10 30 C 9.5 28.5, 11 23, 12 18 C 12.8 14, 11 11, 9 9 Z"
            fill={textColor}
          />
          {/* Sculpted Bowl */}
          <path
            d="M 14.5 6 C 21 5.5, 33 6.5, 33.5 14 C 34 20, 27 21.5, 20.5 21.5 C 17.5 21.5, 15.5 21, 14 20 C 14.5 18 17 18.5 20.5 18.5 C 25.5 18.5 29.5 17.2 29 13.8 C 28.5 10.2 23 9.5 15.5 9.8 Z"
            fill={textColor}
          />
          {/* Flowing artistic leg with tapered underline */}
          <path
            d="M 21.5 20 C 23.5 20, 25 21.5, 26.5 24 C 28.5 27.5, 30.5 30.5, 35 32 C 38.5 33.2, 42 33, 44 32.2 C 45 31.8, 44.5 31, 43 31.2 C 39.5 31.8, 36.5 31.2, 33.5 29.8 C 29.5 27.8, 27.2 24.2, 25.2 20.8 C 24 19, 22.8 18.5 21.5 20 Z"
            fill={accentColor}
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: 'auto',
        height: 32,
        minWidth: 96,
      }}
      {...props}
    >
      <title>Rivet</title>
      <g>
        {/* === ARTISTIC CAPITAL 'R' === */}
        {/* Left top hook & vertical stem */}
        <path
          d="M 7 9.5 C 5.5 7.8, 8 6, 11.5 6.2 C 14 6.4, 14.2 9, 13.5 13 C 12.8 17.2, 12.2 23, 11.8 28.5 C 11.5 31, 9.5 31, 8.8 29.5 C 8.2 28, 9.5 23, 10.5 18 C 11.2 14.2, 9.5 11.5, 7 9.5 Z"
          fill={textColor}
        />
        {/* Upper Bowl */}
        <path
          d="M 12 6.5 C 18 5.8, 29.5 6.8, 30 13.5 C 30.5 19, 24.5 20.8, 18.5 20.8 C 15.5 20.8, 13.8 20.2, 12.5 19.5 C 13 17.8 15.2 18.2 18.5 18.2 C 23 18.2 26.5 17 26 13.5 C 25.5 10.2 20.5 9.4 13 9.7 Z"
          fill={textColor}
        />
        {/* Artistic leg swooping underneath 'i' and 'v' (ending gracefully under 'v' at x=58) */}
        <path
          d="M 19.5 19.5 C 21.2 19.5, 22.8 21, 24.2 23.5 C 26 27, 28 30, 33 31.8 C 38 33.6, 47 33.8, 56 31.6 C 58.5 31, 59 30.2, 57.5 30.4 C 50 31.8, 41.5 31.8, 36 30 C 31 28.2, 28.5 24.5, 26.2 20.5 C 24.8 18.5, 22.5 18, 19.5 19.5 Z"
          fill={accentColor}
        />

        {/* === CRISP INDUSTRIAL LETTERFORMS 'ivet' === */}
        {/* Letter 'i' */}
        <g fill={textColor}>
          {/* Dot */}
          <rect x="36.5" y="6" width="4.5" height="4.5" rx="1.5" />
          {/* Stem */}
          <rect x="36.5" y="13.5" width="4.5" height="15" rx="1.5" />
        </g>

        {/* Letter 'v' */}
        <path
          d="M 46 13.5 L 51.5 28.5 L 56 28.5 L 62 13.5 L 57.5 13.5 L 53.8 24.2 L 50.2 13.5 Z"
          fill={textColor}
        />

        {/* Letter 'e' */}
        <path
          d="M 72 13 C 66.5 13, 63 16.5, 63 21 C 63 25.8, 66.8 29, 72.5 29 C 75.8 29, 78.5 27.8, 80 26.2 L 77.2 23.5 C 76.2 24.5, 74.5 25.2, 72.5 25.2 C 69.5 25.2, 67.8 23.5, 67.5 21.2 L 80.5 21.2 C 80.6 20.5, 80.8 19.5, 80.8 18.8 C 80.8 15.2, 77.2 13, 72 13 Z M 67.6 18.5 C 68.2 16.2, 70 15.2, 72.2 15.2 C 74.5 15.2, 76.2 16.2, 76.5 18.5 Z"
          fill={textColor}
        />

        {/* Letter 't' */}
        <path
          d="M 87.5 7 L 87.5 13.5 L 93 13.5 L 93 16.8 L 87.5 16.8 L 87.5 24.5 C 87.5 25.8, 88.2 26.2, 89.8 26.2 C 90.8 26.2, 92 25.8, 92.8 25.2 L 93.8 28.2 C 92.5 29.2, 90.5 29.8, 88.2 29.8 C 84.8 29.8, 83.2 28, 83.2 24.5 L 83.2 16.8 L 80 16.8 L 80 13.5 L 83.2 13.5 L 83.2 9 Z"
          fill={textColor}
        />
      </g>
    </svg>
  );
}
