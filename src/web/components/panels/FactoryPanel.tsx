import { useGame } from '../../store/game_store';
import { Panel } from '../ui/Panel';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';
import type { Factory } from '../../../core/state/world_state';

const PLAYER_ID = 'p1';

function getStatusText(state: string): string {
  switch (state) {
    case 'idle': return '空闲';
    case 'working': return '工作中';
    case 'construction': return '建造中';
    default: return state;
  }
}

function getStatusColor(state: string): string {
  switch (state) {
    case 'idle': return '#e06060';
    case 'working': return '#60c060';
    case 'construction': return '#d4a84b';
    default: return '#808090';
  }
}

function getFactoryTypeText(type: string): string {
  switch (type) {
    case 'civilian': return '民用工厂';
    case 'military': return '军用工厂';
    case 'dockyard': return '船坞';
    default: return type;
  }
}

interface FactoryItemProps {
  factory: Factory;
  onAssign: (factoryId: number) => void;
}

function FactoryItem({ factory, onAssign }: FactoryItemProps) {
  const progress = factory.productionProgress.toNumber() * 100;
  const isIdle = factory.state === 'idle';

  return (
    <div
      style={{
        padding: '10px',
        backgroundColor: '#1a1a2e',
        borderRadius: '4px',
        border: `1px solid ${isIdle ? '#4a2020' : '#2a2a3e'}`,
        marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div>
          <span style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 500 }}>
            #{factory.id} {getFactoryTypeText(factory.type)}
          </span>
          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#808090' }}>
            省份 #{factory.provinceId}
          </span>
        </div>
        <span
          style={{
            fontSize: '11px',
            color: getStatusColor(factory.state),
            fontWeight: 600,
            padding: '2px 8px',
            backgroundColor: `${getStatusColor(factory.state)}20`,
            borderRadius: '3px',
          }}
        >
          {getStatusText(factory.state)}
        </span>
      </div>

      {!isIdle && factory.taskId && (
        <div style={{ fontSize: '12px', color: '#a0a0b0', marginBottom: '6px' }}>
          任务: {factory.taskId}
        </div>
      )}

      {factory.state === 'working' && (
        <ProgressBar value={progress} height={6} showLabel label={`${Math.round(progress)}%`} />
      )}

      {isIdle && (
        <Button
          variant="primary"
          size="small"
          style={{ width: '100%', marginTop: '4px' }}
          onClick={() => onAssign(factory.id)}
        >
          一键分配任务
        </Button>
      )}
    </div>
  );
}

export function FactoryPanel() {
  const { getRunner, getWorldState } = useGame();
  const worldState = getWorldState();
  const runner = getRunner();

  const civilianFactories: Factory[] = [];
  const militaryFactories: Factory[] = [];
  let idleCount = 0;

  if (worldState) {
    worldState.factories.forEach((factory) => {
      const province = worldState.provinces.get(factory.provinceId);
      if (province && province.controllerId === PLAYER_ID) {
        if (factory.type === 'civilian') {
          civilianFactories.push(factory);
        } else if (factory.type === 'military') {
          militaryFactories.push(factory);
        }
        if (factory.state === 'idle') {
          idleCount++;
        }
      }
    });
  }

  const handleAssign = (factoryId: number) => {
    if (runner) {
      const defaultTaskId = 'production_infantry_equipment';
      runner.queueAction({ kind: 'assignFactory', factoryId, taskId: defaultTaskId });
    }
  };

  const handleAssignAll = () => {
    if (runner) {
      [...civilianFactories, ...militaryFactories].forEach((f) => {
        if (f.state === 'idle') {
          const defaultTaskId = f.type === 'civilian' ? 'construction' : 'production_infantry_equipment';
          runner.queueAction({ kind: 'assignFactory', factoryId: f.id, taskId: defaultTaskId });
        }
      });
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ color: '#d4a84b', fontSize: '18px', margin: 0 }}>工厂管理</h2>
        {idleCount > 0 && (
          <span
            style={{
              backgroundColor: '#4a2020',
              color: '#e06060',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {idleCount} 个空闲
          </span>
        )}
      </div>

      {idleCount > 0 && (
        <Button
          variant="primary"
          size="medium"
          style={{ width: '100%', marginBottom: '16px' }}
          onClick={handleAssignAll}
        >
          一键分配所有空闲工厂
        </Button>
      )}

      <Panel title={`民用工厂 (${civilianFactories.length})`} collapsible defaultCollapsed={false}>
        {civilianFactories.length === 0 ? (
          <div style={{ color: '#606080', fontSize: '13px', textAlign: 'center', padding: '12px' }}>
            暂无民用工厂
          </div>
        ) : (
          civilianFactories.map((f) => (
            <FactoryItem key={f.id} factory={f} onAssign={handleAssign} />
          ))
        )}
      </Panel>

      <div style={{ height: '12px' }} />

      <Panel title={`军用工厂 (${militaryFactories.length})`} collapsible defaultCollapsed={false}>
        {militaryFactories.length === 0 ? (
          <div style={{ color: '#606080', fontSize: '13px', textAlign: 'center', padding: '12px' }}>
            暂无军用工厂
          </div>
        ) : (
          militaryFactories.map((f) => (
            <FactoryItem key={f.id} factory={f} onAssign={handleAssign} />
          ))
        )}
      </Panel>
    </div>
  );
}
