import type { CSSProperties } from 'react';
import type { ResourceType } from '../../../core/types';

interface ResourceIconProps {
  type: ResourceType;
  size?: number;
  style?: CSSProperties;
}

const resourceConfig: Record<ResourceType, { emoji: string; color: string; label: string }> = {
  steel: { emoji: '⚙️', color: '#808890', label: '钢铁' },
  oil: { emoji: '🛢️', color: '#404050', label: '石油' },
  tungsten: { emoji: '🔩', color: '#606878', label: '钨' },
  rubber: { emoji: '⚫', color: '#504838', label: '橡胶' },
  aluminum: { emoji: '🔷', color: '#7090b0', label: '铝' },
  political: { emoji: '👑', color: '#d4a84b', label: '政治点' },
};

export function ResourceIcon({ type, size = 20, style }: ResourceIconProps) {
  const config = resourceConfig[type];
  return (
    <span
      title={config.label}
      style={{
        fontSize: `${size}px`,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size + 4}px`,
        height: `${size + 4}px`,
        ...style,
      }}
    >
      {config.emoji}
    </span>
  );
}

export function getResourceLabel(type: ResourceType): string {
  return resourceConfig[type].label;
}

export function getResourceColor(type: ResourceType): string {
  return resourceConfig[type].color;
}
