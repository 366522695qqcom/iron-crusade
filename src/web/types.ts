export type { SaveData, SaveMetadata } from './platform/storage';
export { saveGame, loadGame, deleteSave, listSaves, SAVE_VERSION } from './platform/storage';
export { createGuestUser } from './platform/auth';
export { WebGameRunner } from './game/web_game_runner';

export type { UserInfo } from '../platform/auth/auth_types';
export type { WorldState } from '../core/state/world_state';
export type { PlayerAction, GameEvent } from '../core/simulation/types';
export { createNewGameState } from '../core/state/initial_state';
