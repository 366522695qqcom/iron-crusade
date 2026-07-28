import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';

interface PanelProps {
  title?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function Panel({
  title,
  collapsible = false,
  defaultCollapsed = false,
  children,
  style,
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      style={{
        backgroundColor: '#12121f',
        border: '1px solid #2a2a3e',
        borderRadius: '6px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#1a1a2e',
            borderBottom: collapsed ? 'none' : '1px solid #2a2a3e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: collapsible ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          onClick={() => collapsible && setCollapsed(!collapsed)}
        >
          <span style={{ color: '#d4a84b', fontWeight: 600, fontSize: '14px' }}>
            {title}
          </span>
          {collapsible && (
            <span style={{ color: '#606080', fontSize: '12px' }}>
              {collapsed ? '▼' : '▲'}
            </span>
          )}
        </div>
      )}
      {!collapsed && (
        <div style={{ padding: '12px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
