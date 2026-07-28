import type { Simulation } from '../../core/simulation';
import type { WorldState } from '../../core/state/world_state';
import type { PlayerAction } from '../../core/simulation/types';
import { DefaultSimulation } from '../../core/simulation';
import {
  DefaultDailyTaskSystem,
} from '../../core/simulation';
import { Fixed } from '../../core/determinism/fixed';

const TICK_MS = 100;
const MAX_CATCHUP_TICKS = 5;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export class WebGameRunner {
  private simulation: Simulation;
  private state: WorldState;
  private speed: 0 | 1 | 2 | 5 = 1;
  private accumulator = 0;
  private currentFrameId = 0;
  private lastDateKey = '';
  private readonly queuedActions: PlayerAction[] = [];
  private readonly dailyTask: DefaultDailyTaskSystem;
  private readonly countryId: string;

  onStateUpdate: ((state: WorldState) => void) | null = null;

  constructor(state: WorldState) {
    this.state = state;
    this.simulation = DefaultSimulation.create(state);

    let playerCountryId = '';
    state.countries.forEach((c) => {
      if (c.isPlayer && playerCountryId === '') {
        playerCountryId = c.id;
      }
    });
    if (!playerCountryId) {
      throw new Error('WebGameRunner: WorldState 中未找到 isPlayer=true 的国家');
    }
    this.countryId = playerCountryId;

    this.dailyTask = new DefaultDailyTaskSystem(this.countryId);
    const todayKey = beijingDateKey(Date.now());
    this.dailyTask.refresh(state, todayKey);
    this.lastDateKey = todayKey;
  }

  setSpeed(speed: 0 | 1 | 2 | 5): void {
    this.speed = speed;
  }

  getSpeed(): 0 | 1 | 2 | 5 {
    return this.speed;
  }

  getState(): WorldState {
    return this.state;
  }

  queueAction(action: PlayerAction): void {
    this.queuedActions.push(action);
  }

  stepFrame(dtMs: number): void {
    if (this.speed === 0) {
      this.notifyUpdate();
      return;
    }

    this.accumulator += dtMs * this.speed;
    let processed = 0;
    while (this.accumulator >= TICK_MS && processed < MAX_CATCHUP_TICKS) {
      const actions: PlayerAction[] = [];
      if (this.queuedActions.length > 0) {
        for (const a of this.queuedActions) actions.push(a);
        this.queuedActions.length = 0;
      }
      const result = this.simulation.tick(this.currentFrameId++, actions);
      this.accumulator -= TICK_MS;
      processed++;

      this.updateDailyTaskProgressFromEvents(result.events);
    }
    if (this.accumulator > TICK_MS * MAX_CATCHUP_TICKS) {
      this.accumulator = 0;
    }

    const todayKey = beijingDateKey(Date.now());
    if (todayKey !== this.lastDateKey) {
      this.lastDateKey = todayKey;
      this.dailyTask.refresh(this.state, todayKey);
    }

    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    if (this.onStateUpdate) {
      this.onStateUpdate(this.state);
    }
  }

  private updateDailyTaskProgressFromEvents(events: import('../../core/simulation/types').GameEvent[]): void {
    const tasks = this.dailyTask.getActiveTasks();
    const incBy = (type: string, delta: Fixed): void => {
      for (const t of tasks) {
        if (t.type !== type || t.completed) continue;
        this.dailyTask.updateProgress(this.state, t.id, t.progress.add(delta));
      }
    };

    for (const ev of events) {
      switch (ev.kind) {
        case 'buildingCompleted': {
          const prov = this.state.provinces.get(ev.provinceId);
          if (prov && prov.controllerId === this.countryId) {
            incBy('build', Fixed.ONE);
          }
          break;
        }
        case 'productionCompleted':
          if (ev.countryId === this.countryId) {
            incBy('produce', Fixed.ONE);
          }
          break;
        case 'provinceControlled':
          if (ev.byCountryId === this.countryId) {
            incBy('combat', Fixed.ONE);
          }
          break;
        case 'warStarted':
          if (ev.relatedIds.attackerId === this.countryId) {
            incBy('combat', Fixed.ONE);
          }
          break;
        case 'surrendered': {
          const dispute = this.state.disputes.get(ev.disputeId);
          if (dispute) {
            const winner = dispute.participants.find((p) => p !== ev.countryId);
            if (winner === this.countryId) {
              incBy('combat', Fixed.ONE);
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }
}

function beijingDateKey(timestampMs: number): string {
  const beijing = new Date(timestampMs + BEIJING_OFFSET_MS);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const d = String(beijing.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
