import { useState, useEffect } from 'react';
import { useGame } from '../../store/game_store';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { saveGame, loadGame, deleteSave, listSaves, SAVE_VERSION } from '../../platform/storage';
import type { SaveMetadata } from '../../platform/storage';

interface SlotInfo {
  slot: number;
  metadata: SaveMetadata | null;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

export function SavePanel() {
  const { getRunner, getWorldState } = useGame();
  const [slots, setSlots] = useState<SlotInfo[]>([
    { slot: 1, metadata: null },
    { slot: 2, metadata: null },
    { slot: 3, metadata: null },
  ]);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const refreshSlots = () => {
    const saves = listSaves();
    setSlots([1, 2, 3].map((slot) => {
      const save = saves.find((s) => s.slot === slot);
      return { slot, metadata: save?.metadata || null };
    }));
  };

  useEffect(() => {
    refreshSlots();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleSave = (slot: number) => {
    const runner = getRunner();
    const worldState = getWorldState();
    if (!runner || !worldState) {
      setMessage({ text: '无法保存：游戏未运行', type: 'error' });
      return;
    }

    let countryName = '铁十字联邦';
    let countryId = 'p1';
    worldState.countries.forEach((c) => {
      if (c.isPlayer) {
        countryName = c.name;
        countryId = c.id;
      }
    });

    try {
      saveGame(slot, {
        version: SAVE_VERSION,
        countryId,
        countryName,
        timestamp: Date.now(),
        tickId: worldState.tickId,
        inGameDate: getGameDate(worldState.tickId),
        worldState: JSON.parse(JSON.stringify(worldState)),
      });
      setMessage({ text: `存档 ${slot} 保存成功！`, type: 'success' });
      refreshSlots();
    } catch (e) {
      setMessage({ text: '保存失败：' + (e as Error).message, type: 'error' });
    }
  };

  const handleLoad = (slot: number) => {
    const saveData = loadGame(slot);
    if (!saveData) {
      setMessage({ text: '加载失败：存档不存在', type: 'error' });
      return;
    }
    setMessage({ text: `存档 ${slot} 已加载，请重启游戏`, type: 'success' });
  };

  const handleDelete = (slot: number) => {
    deleteSave(slot);
    setMessage({ text: `存档 ${slot} 已删除`, type: 'success' });
    refreshSlots();
  };

  return (
    <div>
      <h2 style={{ color: '#d4a84b', fontSize: '18px', margin: '0 0 16px 0' }}>存档管理</h2>

      {message && (
        <div
          style={{
            padding: '10px',
            backgroundColor: message.type === 'success' ? '#1e2a1e' : '#2a1515',
            border: `1px solid ${message.type === 'success' ? '#3a5a3a' : '#4a2020'}`,
            borderRadius: '4px',
            marginBottom: '12px',
            color: message.type === 'success' ? '#60c060' : '#e06060',
            fontSize: '13px',
          }}
        >
          {message.text}
        </div>
      )}

      <Panel title="存档槽位" collapsible={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {slots.map(({ slot, metadata }) => (
            <div
              key={slot}
              style={{
                padding: '12px',
                backgroundColor: metadata ? '#1a1a2e' : '#12121f',
                border: `1px solid ${metadata ? '#2a2a3e' : '#1a1a2e'}`,
                borderRadius: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: metadata ? '8px' : '0' }}>
                <div>
                  <span style={{ color: '#d4a84b', fontSize: '14px', fontWeight: 600 }}>
                    存档槽位 {slot}
                  </span>
                  {!metadata && (
                    <span style={{ color: '#606080', fontSize: '12px', marginLeft: '8px' }}>
                      (空)
                    </span>
                  )}
                </div>
              </div>

              {metadata && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                    <div style={{ color: '#a0a0b0', fontSize: '12px' }}>
                      国家: <span style={{ color: '#e0e0e0' }}>{metadata.countryName || metadata.countryId}</span>
                    </div>
                    <div style={{ color: '#a0a0b0', fontSize: '12px' }}>
                      游戏时间: <span style={{ color: '#e0e0e0' }}>{metadata.inGameDate || getGameDate(metadata.tickId)}</span>
                    </div>
                    <div style={{ color: '#a0a0b0', fontSize: '12px' }}>
                      保存时间: <span style={{ color: '#e0e0e0' }}>{formatDate(metadata.timestamp)}</span>
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <Button
                  variant="primary"
                  size="small"
                  style={{ flex: 1 }}
                  onClick={() => handleSave(slot)}
                >
                  💾 保存
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  style={{ flex: 1 }}
                  onClick={() => handleLoad(slot)}
                  disabled={!metadata}
                >
                  📂 加载
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => handleDelete(slot)}
                  disabled={!metadata}
                >
                  🗑️
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ height: '12px' }} />

      <div style={{ color: '#606080', fontSize: '11px', textAlign: 'center', padding: '8px' }}>
        存档保存在浏览器本地存储中
      </div>
    </div>
  );
}
