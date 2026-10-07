'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Layers } from 'lucide-react';
import s from './theme-bar.module.css';

export type Theme = 'gradient-alpha' | 'gradient-beta';

export function ThemeBar() {
  const [theme, setTheme] = useState<Theme>('gradient-alpha');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('rivet-theme') as Theme | null;
    if (saved && (saved === 'gradient-alpha' || saved === 'gradient-beta')) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const current = document.documentElement.getAttribute('data-theme') as Theme | null;
      if (current === 'gradient-beta') {
        setTheme('gradient-beta');
      } else {
        setTheme('gradient-alpha');
        document.documentElement.setAttribute('data-theme', 'gradient-alpha');
      }
    }
  }, []);

  const switchTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('rivet-theme', nextTheme);
    } catch (e) {}
  };

  if (!mounted) {
    return <div className={s.themeBarSkeleton} aria-hidden="true" />;
  }

  return (
    <div className={s.themeBar} role="group" aria-label="Gradient design system switcher">
      <span className={s.label}>Design System:</span>

      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'gradient-alpha' ? s.active : ''}`}
        onClick={() => switchTheme('gradient-alpha')}
        aria-pressed={theme === 'gradient-alpha'}
        title="System 1: Command Center — Space Grotesk (-1.9px tracking), Pill CTAs (32px), Soft Stone & Pale Green"
      >
        <Sparkles size={13} aria-hidden="true" />
        <span className={s.btnText}>System 1 · Command (Space Grotesk / Pill)</span>
        <span className={s.btnTextShort}>Sys 1 (Pill)</span>
      </button>

      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'gradient-beta' ? s.active : ''}`}
        onClick={() => switchTheme('gradient-beta')}
        aria-pressed={theme === 'gradient-beta'}
        title="System 2: Editorial — Pure Inter (0 tracking, weight 400/475), 12px Rounded CTAs, Signature Coral & Cream"
      >
        <Layers size={13} aria-hidden="true" />
        <span className={s.btnText}>System 2 · Editorial (Inter / 12px Round)</span>
        <span className={s.btnTextShort}>Sys 2 (12px)</span>
      </button>
    </div>
  );
}
