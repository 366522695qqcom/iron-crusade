import { useEffect, useRef } from 'react';
import { GameProvider, useGame } from './store/game_store';
import { TopBar } from './components/TopBar';
import { BottomBar } from './components/BottomBar';
import { MapCanvas } from './components/MapCanvas';
import { LoginOverlay } from './components/LoginOverlay';
import { SidePanel } from './components/SidePanel';
import { FactoryPanel } from './components/panels/FactoryPanel';
import { BuildingPanel } from './components/panels/BuildingPanel';
import { FocusPanel } from './components/panels/FocusPanel';
import { ResearchPanel } from './components/panels/ResearchPanel';
import { SavePanel } from './components/panels/SavePanel';

const PLAYER_ID = 'p1';
const IDLE_ALERT_THRESHOLD = 100;

function GameContent() {
  const { state, dispatch, getRunner } = useGame();
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const idleSinceTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    const runner = getRunner();
    if (!runner) return;

    runner.setSpeed(state.speed);

    lastTimeRef.current = 0;

    const loop = (ts: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = ts;
      }
      const dt = ts - lastTimeRef.current;
      lastTimeRef.current = ts;

      runner.stepFrame(dt);

      const worldState = runner.getState();
      let idleCount = 0;
      let maxIdleTicks = 0;
      worldState.factories.forEach((f) => {
        const province = worldState.provinces.get(f.provinceId);
        if (province && province.controllerId === PLAYER_ID && f.state === 'idle') {
          idleCount++;
          const idleFor = worldState.tickId - f.idleSinceTick;
          if (idleFor > maxIdleTicks) {
            maxIdleTicks = idleFor;
          }
        }
      });

      if (idleCount > 0 && maxIdleTicks >= IDLE_ALERT_THRESHOLD) {
        if (idleSinceTickRef.current === null) {
          idleSinceTickRef.current = worldState.tickId;
          dispatch({ type: 'SET_IDLE_ALERT', show: true });
        }
      } else {
        if (idleSinceTickRef.current !== null) {
          idleSinceTickRef.current = null;
          dispatch({ type: 'SET_IDLE_ALERT', show: false });
        }
      }

      dispatch({ type: 'TICK' });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [state.isPlaying, state.speed, dispatch, getRunner]);

  const renderActivePanel = () => {
    switch (state.activePanel) {
      case 'factory':
        return <FactoryPanel />;
      case 'building':
        return <BuildingPanel />;
      case 'focus':
        return <FocusPanel />;
      case 'research':
        return <ResearchPanel />;
      case 'save':
        return <SavePanel />;
      default:
        return null;
    }
  };

  if (!state.isPlaying) {
    return <LoginOverlay />;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0a12',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <TopBar />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MapCanvas />
        <SidePanel>
          {renderActivePanel()}
        </SidePanel>
      </div>
      <BottomBar />
    </div>
  );
}

function App() {
  return (
    <GameProvider>
      <GameContent />
    </GameProvider>
  );
}

export default App;
