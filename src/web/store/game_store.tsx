import { createContext, useContext, useReducer, useRef, useEffect } from 'react';
import type { ReactNode, Dispatch } from 'react';
import { WebGameRunner } from '../game/web_game_runner';
import { createNewGameState } from '../../core/state/initial_state';
import type { WorldState } from '../../core/state/world_state';
import type { BuildingType } from '../../core/types';

export type GameSpeed = 0 | 1 | 2 | 5;
export type PanelType = 'factory' | 'building' | 'focus' | 'research' | 'save' | null;

export interface GameState {
  isPlaying: boolean;
  speed: GameSpeed;
  worldStateVersion: number;
  selectedProvinceId: number | null;
  activePanel: PanelType;
  buildMode: BuildingType | null;
  idleFactoryAlert: boolean;
}

type GameAction =
  | { type: 'START_GAME' }
  | { type: 'SET_SPEED'; speed: GameSpeed }
  | { type: 'TICK' }
  | { type: 'SELECT_PROVINCE'; provinceId: number | null }
  | { type: 'SET_ACTIVE_PANEL'; panel: PanelType }
  | { type: 'TOGGLE_PANEL'; panel: PanelType }
  | { type: 'SET_BUILD_MODE'; buildingType: BuildingType | null }
  | { type: 'SET_IDLE_ALERT'; show: boolean };

const initialState: GameState = {
  isPlaying: false,
  speed: 1,
  worldStateVersion: 0,
  selectedProvinceId: null,
  activePanel: null,
  buildMode: null,
  idleFactoryAlert: false,
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...state,
        isPlaying: true,
        speed: 1,
        worldStateVersion: state.worldStateVersion + 1,
        activePanel: null,
        buildMode: null,
      };
    case 'SET_SPEED':
      return {
        ...state,
        speed: action.speed,
      };
    case 'TICK':
      return {
        ...state,
        worldStateVersion: state.worldStateVersion + 1,
      };
    case 'SELECT_PROVINCE':
      return {
        ...state,
        selectedProvinceId: action.provinceId,
      };
    case 'SET_ACTIVE_PANEL':
      return {
        ...state,
        activePanel: action.panel,
        buildMode: action.panel === 'building' ? state.buildMode : null,
      };
    case 'TOGGLE_PANEL':
      return {
        ...state,
        activePanel: state.activePanel === action.panel ? null : action.panel,
        buildMode: action.panel !== 'building' ? null : state.buildMode,
      };
    case 'SET_BUILD_MODE':
      return {
        ...state,
        buildMode: action.buildingType,
      };
    case 'SET_IDLE_ALERT':
      return {
        ...state,
        idleFactoryAlert: action.show,
      };
    default:
      return state;
  }
}

interface GameContextValue {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  getRunner: () => WebGameRunner | null;
  getWorldState: () => WorldState | null;
}

const GameContext = createContext<GameContextValue | null>(null);

interface GameProviderProps {
  children: ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const runnerRef = useRef<WebGameRunner | null>(null);
  const worldStateRef = useRef<WorldState | null>(null);

  const getRunner = (): WebGameRunner | null => {
    return runnerRef.current;
  };

  const getWorldState = (): WorldState | null => {
    if (runnerRef.current) {
      worldStateRef.current = runnerRef.current.getState();
    }
    return worldStateRef.current;
  };

  useEffect(() => {
    if (state.isPlaying && !runnerRef.current) {
      const initialWorldState = createNewGameState();
      runnerRef.current = new WebGameRunner(initialWorldState);
      worldStateRef.current = initialWorldState;
    }
  }, [state.isPlaying]);

  const value: GameContextValue = {
    state,
    dispatch,
    getRunner,
    getWorldState,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
