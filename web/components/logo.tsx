import * as React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: 'light' | 'dark' | 'compact';
}

export function Logo({ variant = 'light', ...props }: LogoProps) {
  const isCompact = variant === 'compact';
  const rColor = variant === 'dark' ? 'var(--brand-on-dark)' : 'var(--brand)';
  const textColor = variant === 'dark' ? '#FFF' : 'var(--ink)';
  
  // Compact viewBox: just the R
  // Full viewBox: includes 'ivet' and swash
  const viewBox = isCompact ? "0 0 56 50" : "0 0 128 50";

  return (
    <svg
      viewBox={viewBox}
      fill="none"
      aria-label="Rivet"
      role="img"
      style={{
        display: 'block',
        width: isCompact ? 32 : 'auto',
        height: isCompact ? 32 : 36,
        minWidth: isCompact ? 32 : 92,
      }}
      {...props}
    >
      <title>Rivet</title>
      <g fill={rColor}>
        <path d="M 17 12 C 14 8, 20 4, 26 4.5 C 29 4.8, 28 8, 25 11 C 22 14, 21 21, 20 28 C 19 35, 17.5 42, 15.5 44 C 14 44.5, 13 43, 14 40 C 15.5 34, 18 22, 20.5 15 C 21.5 12, 20 8, 17 12 Z" />
        <path d="M 18 24 C 21 16, 28 6.5, 38 5.5 C 47 4.5, 54 9, 53.5 17.5 C 53 25, 46 29.5, 36 29.5 C 30 29.5, 25 27, 21 23 C 24 25, 29 27, 35 27 C 43 27, 49 22.5, 48.5 17 C 48 11.5, 43 8.5, 36 9 C 29 9.5, 22 15, 18 24 Z" />
        <path d="M32 27C30 28 29 30 31 32C34 35 38.5 39.5 46 42.5C62 47.5 92 47.5 110 44C116 42.8 120 40.5 122 38.5C123 37.5 121.5 36.6 120.3 37.6C117 40.2 112 41.8 106 42.6C88 45 63 45 48 40.5C41.5 38 37.5 33.5 34.5 29C36 28.5 35 26.8 32 27Z" />
      </g>
      {!isCompact && (
        <text
          x="56"
          y="26"
          fill={textColor}
          fontFamily="var(--font-ibm-plex-sans), sans-serif"
          fontSize="22"
          fontWeight="700"
          letterSpacing="-0.5px"
        >
          ivet
        </text>
      )}
    </svg>
  );
}
