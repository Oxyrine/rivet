'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Factory, Moon } from 'lucide-react';
import s from './theme-bar.module.css';

export type Theme = 'gradient' | 'industrial' | 'dark';

export function ThemeBar() {
  const [theme, setTheme] = useState<Theme>('gradient');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('rivet-theme') as Theme | null;
    if (saved && (saved === 'gradient' || saved === 'industrial' || saved === 'dark')) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const current = document.documentElement.getAttribute('data-theme') as Theme | null;
      if (current) setTheme(current);
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
    return (
      <div className={s.themeBarSkeleton} aria-hidden="true" />
    );
  }

  return (
    <div className={s.themeBar} role="group" aria-label="Theme selector">
      <span className={s.label}>Theme:</span>
      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'gradient' ? s.active : ''}`}
        onClick={() => switchTheme('gradient')}
        aria-pressed={theme === 'gradient'}
        title="Claude Gradient Editorial Theme (Clean Canvas, Crisp Display & Pill CTAs)"
      >
        <Sparkles size={13} aria-hidden="true" />
        <span>Gradient</span>
      </button>

      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'industrial' ? s.active : ''}`}
        onClick={() => switchTheme('industrial')}
        aria-pressed={theme === 'industrial'}
        title="Industrial Warm Theme (Rivet Amber, Technical Mono & Compact Cards)"
      >
        <Factory size={13} aria-hidden="true" />
        <span>Industrial</span>
      </button>

      <button
        type="button"
        className={`${s.themeBtn} ${theme === 'dark' ? s.active : ''}`}
        onClick={() => switchTheme('dark')}
        aria-pressed={theme === 'dark'}
        title="Dark Command Theme (Deep Navy/Green & High Contrast Indicators)"
      >
        <Moon size={13} aria-hidden="true" />
        <span>Dark</span>
      </button>
    </div>
  );
}
