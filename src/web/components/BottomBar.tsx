import { useEffect } from 'react';
import { useGame, GameSpeed, PanelType } from '../store/game_store';
import { Button } from './ui/Button';

const SPEED_OPTIONS: { speed: GameSpeed; label: string }[] = [
  { speed: 0, label: '⏸ 暂停' },
  { speed: 1, label: '1x' },
  { speed: 2, label: '2x' },
  { speed: 5, label: '5x' },
];

interface PanelButtonConfig {
  panel: PanelType;
  label: string;
  icon: string;
}

const PANEL_BUTTONS: PanelButtonConfig[] = [
  { panel: 'factory', label: '工厂', icon: '🏭' },
  { panel: 'building', label: '建造', icon: '🔨' },
  { panel: 'focus', label: '焦点', icon: '⭐' },
  { panel: 'research', label: '科研', icon: '🔬' },
  { panel: 'save', label: '存档', icon: '💾' },
];

const PLAYER_ID = 'p1';

export function BottomBar() {
  const { state, dispatch, getRunner, getWorldState } = useGame();

  useEffect(() => {
    const runner = getRunner();
    if (runner) {
      runner.setSpeed(state.speed);
    }
  }, [state.speed, getRunner]);

  const handleSpeedChange = (speed: GameSpeed) => {
    dispatch({ type: 'SET_SPEED', speed });
  };

  const handleTogglePanel = (panel: PanelType) => {
    dispatch({ type: 'TOGGLE_PANEL', panel });
  };

  const handleAssignAll = () => {
    const runner = getRunner();
    const worldState = getWorldState();
    if (!runner || !worldState) return;

    worldState.factories.forEach((factory) => {
      const province = worldState.provinces.get(factory.provinceId);
      if (province && province.controllerId === PLAYER_ID && factory.state === 'idle') {
        const defaultTaskId = factory.type === 'civilian' ? 'construction' : 'production_infantry_equipment';
        runner.queueAction({ kind: 'assignFactory', factoryId: factory.id, taskId: defaultTaskId });
      }
    });
  };

  let idleFactoryCount = 0;
  const worldState = getWorldState();
  if (worldState) {
    worldState.factories.forEach((f) => {
      const province = worldState.provinces.get(f.provinceId);
      if (province && province.controllerId === PLAYER_ID && f.state === 'idle') {
        idleFactoryCount++;
      }
    });
  }

  return (
    <div
      style={{
        height: '56px',
        backgroundColor: '#0d0d18',
        borderTop: '2px solid #d4a84b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
        gap: '8px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#606080', fontSize: '13px', marginRight: '8px' }}>
          速度控制:
        </span>
        {SPEED_OPTIONS.map(({ speed, label }) => (
          <Button
            key={speed}
            variant={state.speed === speed ? 'primary' : 'secondary'}
            active={state.speed === speed}
            size="medium"
            onClick={() => handleSpeedChange(speed)}
            style={{
              minWidth: speed === 0 ? '80px' : '50px',
              fontWeight: state.speed === speed ? 600 : 400,
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <div style={{ width: '1px', height: '32px', backgroundColor: '#2a2a3e', margin: '0 8px' }} />

      {idleFactoryCount > 0 && (
        <Button
          variant="primary"
          size="medium"
          onClick={handleAssignAll}
          style={{ position: 'relative' }}
        >
          ⚡ 一键分配 ({idleFactoryCount})
        </Button>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {PANEL_BUTTONS.map(({ panel, label, icon }) => (
          <Button
            key={panel}
            variant={state.activePanel === panel ? 'primary' : 'secondary'}
            active={state.activePanel === panel}
            size="medium"
            onClick={() => handleTogglePanel(panel)}
            style={{ position: 'relative' }}
          >
            <span style={{ marginRight: '4px' }}>{icon}</span>
            {label}
            {panel === 'factory' && idleFactoryCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '16px',
                  height: '16px',
                  backgroundColor: '#e06060',
                  borderRadius: '50%',
                  fontSize: '10px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                }}
              >
                {idleFactoryCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      <div style={{ width: '1px', height: '32px', backgroundColor: '#2a2a3e', margin: '0 8px' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {state.selectedProvinceId !== null && (
          <div
            style={{
              padding: '4px 12px',
              backgroundColor: '#1a1a2e',
              borderRadius: '4px',
              border: '1px solid #2a2a3e',
            }}
          >
            <span style={{ color: '#a0a0b0', fontSize: '12px' }}>
              选中省份: <span style={{ color: '#d4a84b' }}>#{state.selectedProvinceId}</span>
            </span>
          </div>
        )}
        {state.buildMode && (
          <div
            style={{
              padding: '4px 12px',
              backgroundColor: '#1e2a1e',
              borderRadius: '4px',
              border: '1px solid #3a5a3a',
            }}
          >
            <span style={{ color: '#60c060', fontSize: '12px' }}>
              🔨 建造模式
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
