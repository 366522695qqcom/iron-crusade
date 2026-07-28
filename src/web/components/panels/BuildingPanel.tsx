import { useGame } from '../../store/game_store';
import { Panel } from '../ui/Panel';
import { ProgressBar } from '../ui/ProgressBar';
import { Button } from '../ui/Button';
import type { BuildingType } from '../../../core/types';

const PLAYER_ID = 'p1';

interface BuildingOption {
  type: BuildingType;
  name: string;
  icon: string;
  description: string;
}

const BUILDING_OPTIONS: BuildingOption[] = [
  { type: 'civilian_factory', name: '民用工厂', icon: '🏭', description: '生产消费品和建造建筑' },
  { type: 'military_factory', name: '军用工厂', icon: '⚔️', description: '生产武器装备' },
  { type: 'infrastructure', name: '基础设施', icon: '🛤️', description: '提升补给和建筑速度' },
  { type: 'mine', name: '开采井', icon: '⛏️', description: '开采资源' },
  { type: 'storage', name: '仓储', icon: '📦', description: '增加资源存储上限' },
];

function getBuildingTypeName(type: BuildingType): string {
  const opt = BUILDING_OPTIONS.find((o) => o.type === type);
  return opt ? opt.name : type;
}

export function BuildingPanel() {
  const { state, dispatch, getWorldState, getRunner } = useGame();
  const worldState = getWorldState();
  const runner = getRunner();
  const { buildMode } = state;

  let availableCivFactories = 0;
  const constructionQueue: { buildingType: BuildingType; provinceId: number; progress: number; assignedFactoryIds: number[] }[] = [];
  const ownedProvinces: { id: number; name: string }[] = [];

  if (worldState) {
    worldState.factories.forEach((f) => {
      const province = worldState.provinces.get(f.provinceId);
      if (province && province.controllerId === PLAYER_ID && f.type === 'civilian' && f.state === 'idle') {
        availableCivFactories++;
      }
    });

    const playerQueue = worldState.constructionQueues.get(PLAYER_ID);
    if (playerQueue) {
      playerQueue.items.forEach((item) => {
        constructionQueue.push({
          buildingType: item.buildingType as BuildingType,
          provinceId: item.provinceId,
          progress: item.progress.toNumber() * 100,
          assignedFactoryIds: item.assignedFactoryIds,
        });
      });
    }

    worldState.provinces.forEach((p) => {
      if (p.controllerId === PLAYER_ID) {
        ownedProvinces.push({ id: p.id, name: p.name });
      }
    });
  }

  const handleSelectBuilding = (type: BuildingType) => {
    if (buildMode === type) {
      dispatch({ type: 'SET_BUILD_MODE', buildingType: null });
    } else {
      dispatch({ type: 'SET_BUILD_MODE', buildingType: type });
    }
  };

  const handleQuickPlace = (type: BuildingType, provinceId: number) => {
    if (runner && availableCivFactories > 0) {
      runner.queueAction({ kind: 'placeBuilding', type, provinceId, factoryCount: 1 });
      dispatch({ type: 'SET_BUILD_MODE', buildingType: null });
    }
  };

  return (
    <div>
      <h2 style={{ color: '#d4a84b', fontSize: '18px', margin: '0 0 16px 0' }}>建造面板</h2>

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
        <span style={{ color: '#a0a0b0', fontSize: '13px' }}>可用民用工厂:</span>
        <span style={{ color: availableCivFactories > 0 ? '#60c060' : '#e06060', fontSize: '16px', fontWeight: 600 }}>
          {availableCivFactories}
        </span>
      </div>

      {buildMode && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#1e2a1e',
            borderRadius: '4px',
            border: '1px solid #3a5a3a',
            marginBottom: '16px',
          }}
        >
          <div style={{ color: '#60c060', fontSize: '13px', marginBottom: '8px' }}>
            🔨 建造模式: {getBuildingTypeName(buildMode)}
          </div>
          <div style={{ color: '#a0a0b0', fontSize: '12px', marginBottom: '8px' }}>
            点击地图上己方省份放置建筑，或选择下方省份快速建造:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {ownedProvinces.map((p) => (
              <Button
                key={p.id}
                variant="primary"
                size="small"
                onClick={() => handleQuickPlace(buildMode, p.id)}
                disabled={availableCivFactories === 0}
              >
                {p.name} (#{p.id})
              </Button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="small"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => dispatch({ type: 'SET_BUILD_MODE', buildingType: null })}
          >
            取消建造
          </Button>
        </div>
      )}

      <Panel title="选择建筑类型" collapsible={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {BUILDING_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleSelectBuilding(opt.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                backgroundColor: buildMode === opt.type ? '#2a3a2a' : '#12121f',
                border: `2px solid ${buildMode === opt.type ? '#60c060' : '#2a2a3e'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '24px' }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: buildMode === opt.type ? '#60c060' : '#e0e0e0', fontSize: '13px', fontWeight: 500 }}>
                  {opt.name}
                </div>
                <div style={{ color: '#808090', fontSize: '11px' }}>{opt.description}</div>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <div style={{ height: '12px' }} />

      <Panel title={`建造队列 (${constructionQueue.length})`} collapsible defaultCollapsed={false}>
        {constructionQueue.length === 0 ? (
          <div style={{ color: '#606080', fontSize: '13px', textAlign: 'center', padding: '12px' }}>
            暂无建造任务
          </div>
        ) : (
          constructionQueue.map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '10px',
                backgroundColor: '#1a1a2e',
                borderRadius: '4px',
                border: '1px solid #2a2a3e',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ color: '#e0e0e0', fontSize: '13px' }}>
                  {getBuildingTypeName(item.buildingType)} - 省份 #{item.provinceId}
                </span>
                <span style={{ color: '#d4a84b', fontSize: '11px' }}>
                  {item.assignedFactoryIds.length} 厂建造中
                </span>
              </div>
              <ProgressBar value={item.progress} height={6} showLabel label={`${Math.round(item.progress)}%`} />
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
