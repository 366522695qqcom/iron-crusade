import type { WorldState } from '../../core/state/world_state';

const SAVE_KEY_PREFIX = 'hoi4-web:save:';
export const SAVE_VERSION = '1.0.0';

export interface SaveMetadata {
  version: string;
  countryId: string;
  countryName?: string;
  timestamp: number;
  tickId: number;
  inGameDate?: string;
}

export interface SaveData extends SaveMetadata {
  worldState: WorldState;
}

function isValidSlot(slot: number): boolean {
  return slot >= 1 && slot <= 3;
}

function getSaveKey(slot: number): string {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

export function saveGame(slot: number, data: SaveData): void {
  if (!isValidSlot(slot)) {
    throw new Error(`Invalid save slot: ${slot}. Must be 1-3.`);
  }
  const key = getSaveKey(slot);
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadGame(slot: number): SaveData | null {
  if (!isValidSlot(slot)) {
    return null;
  }
  const key = getSaveKey(slot);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function deleteSave(slot: number): void {
  if (!isValidSlot(slot)) return;
  const key = getSaveKey(slot);
  localStorage.removeItem(key);
}

export function listSaves(): Array<{ slot: number; metadata: SaveMetadata }> {
  const saves: Array<{ slot: number; metadata: SaveMetadata }> = [];
  for (let slot = 1; slot <= 3; slot++) {
    const data = loadGame(slot);
    if (data) {
      const { worldState: _, ...metadata } = data;
      saves.push({ slot, metadata });
    }
  }
  return saves;
}
