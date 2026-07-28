import { useGame } from '../../store/game_store';
import { Panel } from '../ui/Panel';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';

const PLAYER_ID = 'p1';

interface ResearchLineConfig {
  id: string;
  name: string;
  icon: string;
  nodes: { id: string; name: string }[];
}

interface LineState {
  lineId: string;
  currentNodeIndex: number;
  progress: number;
  assignedSlot: number;
}

const RESEARCH_LINES: ResearchLineConfig[] = [
  {
    id: 'industry',
    name: '工业线',
    icon: '🏭',
    nodes: [
      { id: 'ind_1', name: '基础工业' },
      { id: 'ind_2', name: '流水线生产' },
      { id: 'ind_3', name: '集中规划' },
      { id: 'ind_4', name: '重工业扩张' },
      { id: 'ind_5', name: '自动化制造' },
      { id: 'ind_6', name: '综合工业体系' },
    ],
  },
  {
    id: 'electronics',
    name: '电子线',
    icon: '📡',
    nodes: [
      { id: 'ele_1', name: '基础电子学' },
      { id: 'ele_2', name: '无线通讯' },
      { id: 'ele_3', name: '计算机械' },
      { id: 'ele_4', name: '雷达系统' },
      { id: 'ele_5', name: '密码破译' },
      { id: 'ele_6', name: '综合电子战' },
    ],
  },
  {
    id: 'infantry',
    name: '步兵线',
    icon: '🪖',
    nodes: [
      { id: 'inf_1', name: '基础步兵装备' },
      { id: 'inf_2', name: '工兵装备' },
      { id: 'inf_3', name: '机械化步兵' },
      { id: 'inf_4', name: '突击步枪' },
      { id: 'inf_5', name: '特种作战' },
      { id: 'inf_6', name: '现代步兵学说' },
    ],
  },
  {
    id: 'armor',
    name: '装甲线',
    icon: '🛡️',
    nodes: [
      { id: 'arm_1', name: '基础装甲' },
      { id: 'arm_2', name: '中型坦克' },
      { id: 'arm_3', name: '装甲突击' },
      { id: 'arm_4', name: '重型坦克' },
      { id: 'arm_5', name: '装甲协同' },
      { id: 'arm_6', name: '闪电战学说' },
    ],
  },
  {
    id: 'artillery',
    name: '炮兵线',
    icon: '💥',
    nodes: [
      { id: 'art_1', name: '基础火炮' },
      { id: 'art_2', name: '牵引炮' },
      { id: 'art_3', name: '自行火炮' },
      { id: 'art_4', name: '火箭炮' },
      { id: 'art_5', name: '现代炮兵学说' },
    ],
  },
];

function getDefaultLineStates(): Record<string, LineState> {
  const states: Record<string, LineState> = {};
  RESEARCH_LINES.forEach((line, idx) => {
    states[line.id] = {
      lineId: line.id,
      currentNodeIndex: idx === 0 ? 0 : 0,
      progress: 0,
      assignedSlot: -1,
    };
  });
  return states;
}

export function ResearchPanel() {
  const { getRunner, getWorldState } = useGame();
  const worldState = getWorldState();
  const runner = getRunner();

  let lineStates: Record<string, LineState> = getDefaultLineStates();
  let activeLineId: string | null = null;

  if (worldState) {
    const researchState = worldState.research.get(PLAYER_ID);
    if (researchState) {
      researchState.lines.forEach((line) => {
        lineStates[line.lineId] = {
          lineId: line.lineId,
          currentNodeIndex: line.currentNodeIndex,
          progress: line.progress.toNumber() * 100,
          assignedSlot: line.assignedSlot,
        };
        if (line.assignedSlot >= 0) {
          activeLineId = line.lineId;
        }
      });
    }
  }

  const activeLineState = activeLineId ? lineStates[activeLineId] : null;
  const activeLineConfig = activeLineId ? RESEARCH_LINES.find((l) => l.id === activeLineId) : null;
  const hasActiveResearch = activeLineId !== null;

  const handlePickResearch = (lineId: string) => {
    if (runner && !hasActiveResearch) {
      runner.queueAction({ kind: 'pickResearch', lineId });
    }
  };

  return (
    <div>
      <h2 style={{ color: '#d4a84b', fontSize: '18px', margin: '0 0 16px 0' }}>科研面板</h2>

      {activeLineState && activeLineConfig && (
        <Panel title="当前研究中" collapsible={false}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>{activeLineConfig.icon}</span>
            <div>
              <div style={{ color: '#d4a84b', fontSize: '14px', fontWeight: 600 }}>
                {activeLineConfig.name}
              </div>
              <div style={{ color: '#e0e0e0', fontSize: '13px' }}>
                {activeLineConfig.nodes[activeLineState.currentNodeIndex]?.name || '未知节点'}
              </div>
            </div>
          </div>
          <ProgressBar
            value={activeLineState.progress}
            height={8}
            color="#6080d0"
            showLabel
            label={`${Math.round(activeLineState.progress)}%`}
          />
        </Panel>
      )}

      <div style={{ height: '12px' }} />

      <Panel title="科研线" collapsible={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {RESEARCH_LINES.map((line) => {
            const lineState = lineStates[line.id] || { currentNodeIndex: 0, progress: 0, assignedSlot: -1 };
            const currentIdx = lineState.currentNodeIndex;
            const currentNode = line.nodes[currentIdx];
            const progress = lineState.progress;
            const isActive = lineState.assignedSlot >= 0;

            return (
              <div
                key={line.id}
                style={{
                  padding: '10px',
                  backgroundColor: isActive ? '#1a2a3a' : '#12121f',
                  border: `1px solid ${isActive ? '#6080d0' : '#2a2a3e'}`,
                  borderRadius: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>{line.icon}</span>
                    <div>
                      <div style={{ color: isActive ? '#6080d0' : '#e0e0e0', fontSize: '13px', fontWeight: 500 }}>
                        {line.name}
                      </div>
                      <div style={{ color: '#808090', fontSize: '11px' }}>
                        Lv.{currentIdx + 1} - {currentNode?.name}
                      </div>
                    </div>
                  </div>
                  {!hasActiveResearch && !isActive && (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => handlePickResearch(line.id)}
                    >
                      开始研究
                    </Button>
                  )}
                  {isActive && (
                    <span style={{ color: '#60c060', fontSize: '11px', fontWeight: 600 }}>研究中</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '3px', marginTop: '6px' }}>
                  {line.nodes.map((node, idx) => (
                    <div
                      key={node.id}
                      style={{
                        flex: 1,
                        height: '4px',
                        backgroundColor: idx < currentIdx ? '#6080d0' : idx === currentIdx ? '#3a4a6a' : '#2a2a3e',
                        borderRadius: '2px',
                      }}
                      title={node.name}
                    />
                  ))}
                </div>

                {isActive && (
                  <div style={{ marginTop: '6px' }}>
                    <ProgressBar value={progress} height={4} color="#6080d0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
