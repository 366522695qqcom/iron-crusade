import { useState } from 'react';
import { useGame } from '../../store/game_store';
import { Panel } from '../ui/Panel';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';

const PLAYER_ID = 'p1';

interface FocusConfig {
  id: string;
  name: string;
  description: string;
  effects: string[];
  cost: number;
}

const FOCUS_PRESETS: FocusConfig[] = [
  {
    id: 'industrial_focus',
    name: '工业振兴',
    description: '大力发展民用工业，提升基础建设能力',
    effects: ['民用工厂产出 +10%', '建造速度 +15%', '基础设施上限 +2'],
    cost: 70,
  },
  {
    id: 'military_focus',
    name: '军事优先',
    description: '优先发展军事工业，扩充军备',
    effects: ['军用工厂产出 +15%', '步兵装备生产 +20%', '训练速度 +10%'],
    cost: 70,
  },
  {
    id: 'technology_focus',
    name: '科技突破',
    description: '投资科研，加速技术发展',
    effects: ['科研速度 +20%', '解锁电子科技', '研究槽位 +1'],
    cost: 70,
  },
];

export function FocusPanel() {
  const { getRunner, getWorldState } = useGame();
  const worldState = getWorldState();
  const runner = getRunner();
  const [selectedFocusId, setSelectedFocusId] = useState<string | null>(null);

  let activeFocusId: string | null = null;
  let activeProgress = 0;
  let candidateFocuses = FOCUS_PRESETS;
  let politicalPower = 0;

  if (worldState) {
    const focusTree = worldState.focusTrees.get(PLAYER_ID);
    if (focusTree) {
      activeFocusId = focusTree.activeFocusId;
      activeProgress = focusTree.activeProgress.toNumber() * 100;
    }

    const stockpile = worldState.stockpiles.get(PLAYER_ID);
    if (stockpile) {
      politicalPower = stockpile.political.toNumber();
    }
  }

  const activeFocus = activeFocusId
    ? FOCUS_PRESETS.find((f) => f.id === activeFocusId) || {
        id: activeFocusId,
        name: activeFocusId,
        description: '当前焦点',
        effects: [],
        cost: 0,
      }
    : null;

  const handleConfirmFocus = () => {
    if (runner && selectedFocusId && !activeFocusId) {
      runner.queueAction({ kind: 'pickFocus', focusId: selectedFocusId });
      setSelectedFocusId(null);
    }
  };

  return (
    <div>
      <h2 style={{ color: '#d4a84b', fontSize: '18px', margin: '0 0 16px 0' }}>国家焦点</h2>

      <div
        style={{
          padding: '10px',
          backgroundColor: '#1a1a2e',
          borderRadius: '4px',
          border: '1px solid #2a2a3e',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#a0a0b0', fontSize: '13px' }}>政治点:</span>
        <span style={{ color: '#d4a84b', fontSize: '16px', fontWeight: 600 }}>
          {Math.floor(politicalPower)}
        </span>
      </div>

      {activeFocus && (
        <Panel title="当前进行中" collapsible={false}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#d4a84b', fontSize: '15px', fontWeight: 600 }}>
              {activeFocus.name}
            </span>
          </div>
          <div style={{ color: '#a0a0b0', fontSize: '12px', marginBottom: '8px' }}>
            {activeFocus.description}
          </div>
          <ProgressBar
            value={activeProgress}
            height={8}
            color="#d4a84b"
            showLabel
            label={`${Math.round(activeProgress)}%`}
          />
        </Panel>
      )}

      {!activeFocusId && (
        <>
          <div style={{ height: '12px' }} />
          <Panel title="选择焦点（三选一）" collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {candidateFocuses.map((focus) => (
                <div
                  key={focus.id}
                  onClick={() => setSelectedFocusId(focus.id)}
                  style={{
                    padding: '12px',
                    backgroundColor: selectedFocusId === focus.id ? '#2a2a3e' : '#12121f',
                    border: `2px solid ${selectedFocusId === focus.id ? '#d4a84b' : '#2a2a3e'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <span style={{ color: selectedFocusId === focus.id ? '#d4a84b' : '#e0e0e0', fontSize: '14px', fontWeight: 600 }}>
                      ⭐ {focus.name}
                    </span>
                    <span style={{ color: '#808090', fontSize: '11px' }}>
                      消耗: {focus.cost} 政治点
                    </span>
                  </div>
                  <div style={{ color: '#a0a0b0', fontSize: '12px', marginBottom: '8px' }}>
                    {focus.description}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {focus.effects.map((effect, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '10px',
                          color: '#60c060',
                          backgroundColor: '#1e2a1e',
                          padding: '2px 6px',
                          borderRadius: '3px',
                        }}
                      >
                        {effect}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedFocusId && (
              <Button
                variant="primary"
                size="medium"
                style={{ width: '100%', marginTop: '12px' }}
                onClick={handleConfirmFocus}
              >
                确认选择焦点
              </Button>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
