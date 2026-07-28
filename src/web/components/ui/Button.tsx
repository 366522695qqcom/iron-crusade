import type { ButtonHTMLAttributes, ReactNode, CSSProperties } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  active?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'medium',
  active = false,
  children,
  style,
  ...props
}: ButtonProps) {
  const baseStyle: CSSProperties = {
    border: `2px solid ${active ? '#d4a84b' : '#3a3a4a'}`,
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: 500,
    transition: 'all 0.15s ease',
    outline: 'none',
  };

  const variants: Record<string, CSSProperties> = {
    primary: {
      backgroundColor: active ? '#d4a84b' : '#1a1a2e',
      color: active ? '#1a1a2e' : '#d4a84b',
    },
    secondary: {
      backgroundColor: active ? '#2a2a3e' : '#12121f',
      color: active ? '#d4a84b' : '#a0a0b0',
    },
    danger: {
      backgroundColor: '#2a1515',
      color: '#e06060',
      borderColor: '#4a2020',
    },
  };

  const sizes: Record<string, CSSProperties> = {
    small: {
      padding: '4px 12px',
      fontSize: '12px',
    },
    medium: {
      padding: '8px 16px',
      fontSize: '14px',
    },
    large: {
      padding: '12px 24px',
      fontSize: '16px',
    },
  };

  return (
    <button
      style={{
        ...baseStyle,
        ...variants[variant],
        ...sizes[size],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
