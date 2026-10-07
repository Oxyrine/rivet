import * as React from 'react';
import s from './ui.module.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'secondary', busy = false, disabled, children, ...props }, ref) => {
    const rootClass = `${s.button} ${s[variant]} ${className}`.trim();
    return (
      <button
        ref={ref}
        className={rootClass}
        disabled={disabled || busy}
        aria-busy={busy}
        {...props}
      >
        {busy ? 'Please wait...' : children}
      </button>
    );
  }
);
Button.displayName = 'Button';
