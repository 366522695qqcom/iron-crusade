import { useGame } from '../store/game_store';
import { ResourceIcon } from './ui/ResourceIcon';
import type { ResourceType } from '../../core/types';

const RESOURCES: ResourceType[] = ['steel', 'oil', 'tungsten', 'rubber', 'aluminum', 'political'];
const PLAYER_ID = 'p1';

function formatNumber(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'k';
  }
  return Math.floor(n).toString();
}

function getGameDate(tickId: number): string {
  const START_YEAR = 1936;
  const TICKS_PER_DAY = 864;
  const DAYS_PER_MONTH = 30;
  const MONTHS_PER_YEAR = 12;

  const totalDays = Math.floor(tickId / TICKS_PER_DAY);
  const year = START_YEAR + Math.floor(totalDays / (DAYS_PER_MONTH * MONTHS_PER_YEAR));
  const month = Math.floor((totalDays % (DAYS_PER_MONTH * MONTHS_PER_YEAR)) / DAYS_PER_MONTH) + 1;
  const day = (totalDays % DAYS_PER_MONTH) + 1;

  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

export function TopBar() {
  const { state, getWorldState, dispatch } = useGame();
  const worldState = getWorldState();

  let countryName = '铁十字联邦';
  let playerCountryId = 'p1';
  let resources: Record<ResourceType, number> = {
    steel: 0,
    oil: 0,
    tungsten: 0,
    rubber: 0,
    aluminum: 0,
    political: 0,
  };
  let gameDate = '1936.01.01';
  let tickId = 0;
  let idleFactoryCount = 0;

  if (worldState) {
    const countries: { id: string; name: string; isPlayer: boolean }[] = [];
    worldState.countries.forEach((c) => {
      countries.push({ id: c.id, name: c.name, isPlayer: c.isPlayer });
    });

    const playerCountry = countries.find((c) => c.isPlayer);
    if (playerCountry) {
      countryName = playerCountry.name;
      playerCountryId = playerCountry.id;
    }

    const playerStockpile = worldState.stockpiles.get(playerCountryId);
    if (playerStockpile) {
      resources = {
        steel: playerStockpile.steel.toNumber(),
        oil: playerStockpile.oil.toNumber(),
        tungsten: playerStockpile.tungsten.toNumber(),
        rubber: playerStockpile.rubber.toNumber(),
        aluminum: playerStockpile.aluminum.toNumber(),
        political: playerStockpile.political.toNumber(),
      };
    }

    worldState.factories.forEach((f) => {
      const province = worldState.provinces.get(f.provinceId);
      if (province && province.controllerId === PLAYER_ID && f.state === 'idle') {
        idleFactoryCount++;
      }
    });

    tickId = worldState.tickId;
    gameDate = getGameDate(tickId);
  }

  const showIdleAlert = idleFactoryCount > 0 && state.idleFactoryAlert;

  return (
    <>
      <div
        style={{
          height: '48px',
          backgroundColor: '#0d0d18',
          borderBottom: '2px solid #d4a84b',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '24px',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingRight: '16px',
            borderRight: '1px solid #2a2a3e',
          }}
        >
          <span style={{ color: '#d4a84b', fontWeight: 'bold', fontSize: '16px' }}>
            {countryName}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingRight: '16px',
            borderRight: '1px solid #2a2a3e',
          }}
        >
          <span style={{ color: '#a0a0b0', fontSize: '14px' }}>📅</span>
          <span style={{ color: '#e0e0e0', fontSize: '14px', fontFamily: 'monospace' }}>
            {gameDate}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          {RESOURCES.map((res) => (
            <div key={res} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ResourceIcon type={res} size={18} />
              <span
                style={{
                  color: res === 'political' ? '#d4a84b' : '#c0c0d0',
                  fontSize: '13px',
                  fontWeight: res === 'political' ? 600 : 400,
                  minWidth: res === 'political' ? '50px' : '40px',
                }}
              >
                {formatNumber(resources[res])}
              </span>
            </div>
          ))}
        </div>

        {idleFactoryCount > 0 && (
          <div
            onClick={() => dispatch({ type: 'TOGGLE_PANEL', panel: 'factory' })}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: '#2a1515',
              border: '1px solid #4a2020',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '16px' }}>🏭</span>
            <span style={{ color: '#e06060', fontSize: '12px', fontWeight: 600 }}>
              {idleFactoryCount} 空闲
            </span>
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '8px',
                height: '8px',
                backgroundColor: '#e06060',
                borderRadius: '50%',
                animation: 'pulse 1s infinite',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#606080', fontSize: '12px' }}>
            Tick: {tickId}
          </span>
        </div>
      </div>
      {showIdleAlert && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#2a1515',
            border: '1px solid #e06060',
            borderRadius: '0 0 4px 4px',
            padding: '8px 16px',
            color: '#e06060',
            fontSize: '13px',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠️ 有 {idleFactoryCount} 个工厂空闲中</span>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_PANEL', panel: 'factory' })}
            style={{
              backgroundColor: '#4a2020',
              border: '1px solid #e06060',
              color: '#e06060',
              padding: '2px 8px',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            查看
          </button>
        </div>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </>
  );
}
