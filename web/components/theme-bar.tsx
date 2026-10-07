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
    const initialTheme = saved === 'gradient-beta' ? 'gradient-beta' : 'gradient-alpha';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
    document.body?.setAttribute('data-theme', initialTheme);
  }, []);

  const switchTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    document.body?.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('rivet-theme', nextTheme);
    } catch (e) {}
  };

  if (!mounted) {
    return <div className={s.themeBarSkeleton} aria-hidden="true" />;
  }

  return (
    <div className={s.themeBar} role="group" aria-label="Design system switcher">
      <span className={s.label}>Style:</span>

      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'gradient-alpha' ? s.active : ''}`}
        onClick={() => switchTheme('gradient-alpha')}
        aria-pressed={theme === 'gradient-alpha'}
        title="System 1: Command Center (Space Grotesk, Pill 32px CTAs, Near-Black #17171c, Soft Stone)"
      >
        <Sparkles size={14} aria-hidden="true" />
        <span className={s.btnText}>System 1 · Command (Space Grotesk / Pill)</span>
        <span className={s.btnTextShort}>Sys 1 (Pill)</span>
      </button>

      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'gradient-beta' ? s.active : ''}`}
        onClick={() => switchTheme('gradient-beta')}
        aria-pressed={theme === 'gradient-beta'}
        title="System 2: Editorial (Inter Display, 12px Rounded CTAs, Oxide Coral #aa2d00, Warm Cream)"
      >
        <Layers size={14} aria-hidden="true" />
        <span className={s.btnText}>System 2 · Editorial (Inter / 12px Round)</span>
        <span className={s.btnTextShort}>Sys 2 (12px)</span>
      </button>
    </div>
  );
}
