import type { ReactNode, CSSProperties } from 'react';
import { useGame, PanelType } from '../store/game_store';

interface TabConfig {
  id: PanelType;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'factory', label: '工厂', icon: '🏭' },
  { id: 'building', label: '建造', icon: '🔨' },
  { id: 'focus', label: '焦点', icon: '⭐' },
  { id: 'research', label: '科研', icon: '🔬' },
  { id: 'save', label: '存档', icon: '💾' },
];

interface SidePanelProps {
  children: ReactNode;
}

export function SidePanel({ children }: SidePanelProps) {
  const { state, dispatch } = useGame();
  const { activePanel } = state;
  const isOpen = activePanel !== null;

  const panelStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '400px',
    height: '100%',
    backgroundColor: '#0d0d18',
    borderLeft: '2px solid #d4a84b',
    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    boxShadow: isOpen ? '-8px 0 24px rgba(0,0,0,0.5)' : 'none',
  };

  const tabBarStyle: CSSProperties = {
    display: 'flex',
    backgroundColor: '#12121f',
    borderBottom: '1px solid #2a2a3e',
    flexShrink: 0,
  };

  const tabButtonStyle = (isActive: boolean): CSSProperties => ({
    flex: 1,
    padding: '10px 4px',
    backgroundColor: isActive ? '#1a1a2e' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #d4a84b' : '2px solid transparent',
    color: isActive ? '#d4a84b' : '#808090',
    cursor: 'pointer',
    fontSize: '11px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    transition: 'all 0.15s ease',
  });

  const contentStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  };

  const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    border: '1px solid #3a3a4a',
    borderRadius: '4px',
    color: '#808090',
    cursor: 'pointer',
    fontSize: '14px',
    zIndex: 10,
  };

  const handleTabClick = (panelId: PanelType) => {
    dispatch({ type: 'TOGGLE_PANEL', panel: panelId });
  };

  const handleClose = () => {
    dispatch({ type: 'SET_ACTIVE_PANEL', panel: null });
    dispatch({ type: 'SET_BUILD_MODE', buildingType: null });
  };

  return (
    <div style={panelStyle}>
      {isOpen && (
        <button style={closeButtonStyle} onClick={handleClose}>
          ✕
        </button>
      )}
      <div style={tabBarStyle}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={tabButtonStyle(activePanel === tab.id)}
            onClick={() => handleTabClick(tab.id)}
          >
            <span style={{ fontSize: '18px' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div style={contentStyle}>
        {children}
      </div>
    </div>
  );
}
