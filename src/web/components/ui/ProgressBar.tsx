import type { CSSProperties } from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  backgroundColor?: string;
  height?: number;
  showLabel?: boolean;
  label?: string;
  style?: CSSProperties;
}

export function ProgressBar({
  value,
  max = 100,
  color = '#d4a84b',
  backgroundColor = '#2a2a3e',
  height = 8,
  showLabel = false,
  label,
  style,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div style={{ width: '100%', ...style }}>
      <div
        style={{
          width: '100%',
          height: `${height}px`,
          backgroundColor,
          borderRadius: `${height / 2}px`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: `${height / 2}px`,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      {showLabel && (
        <div style={{ fontSize: '11px', color: '#808090', marginTop: '2px', textAlign: 'right' }}>
          {label || `${Math.round(percentage)}%`}
        </div>
      )}
    </div>
  );
}
