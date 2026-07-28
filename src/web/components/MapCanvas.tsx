import { useRef, useEffect, useState, useCallback } from 'react';
import type { WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useGame } from '../store/game_store';
import type { Province } from '../../core/state/world_state';
import type { WorldState } from '../../core/state/world_state';

const PROVINCE_COLORS: Record<string, string> = {
  p1: '#2a4a6a',
  e1: '#6a2a2a',
};

const PROVINCE_HOVER_COLORS: Record<string, string> = {
  p1: '#3a5a7a',
  e1: '#7a3a3a',
};

const PROVINCE_SELECTED_COLORS: Record<string, string> = {
  p1: '#4a7aaa',
  e1: '#aa4a4a',
};

const STROKE_COLOR = '#d4a84b';
const STROKE_HOVER_COLOR = '#ffffff';
const BUILDABLE_STROKE_COLOR = '#60c060';
const NON_BUILDABLE_STROKE_COLOR = '#404050';

const GRID_COLS = 10;
const GRID_ROWS = 8;
const PROVINCE_WIDTH = 90;
const PROVINCE_HEIGHT = 70;
const PROVINCE_GAP = 4;
const GRID_OFFSET_X = 50;
const GRID_OFFSET_Y = 50;

interface ProvinceLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getProvinceLayout(provinceId: number, allProvinces: Province[]): ProvinceLayout {
  const sortedIds = allProvinces.map((p) => p.id).sort((a, b) => a - b);
  const index = sortedIds.indexOf(provinceId);
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);

  return {
    x: GRID_OFFSET_X + col * (PROVINCE_WIDTH + PROVINCE_GAP),
    y: GRID_OFFSET_Y + row * (PROVINCE_HEIGHT + PROVINCE_GAP),
    width: PROVINCE_WIDTH,
    height: PROVINCE_HEIGHT,
  };
}

function countBuildingsInProvince(provinceId: number, worldState: WorldState | null): number {
  if (!worldState) return 0;
  let count = 0;
  worldState.buildings.forEach((b) => {
    if (b.provinceId === provinceId && b.state === 'active') count++;
  });
  worldState.factories.forEach((f) => {
    if (f.provinceId === provinceId && f.state !== 'construction') count++;
  });
  return count;
}

function countDivisionsInProvince(provinceId: number, worldState: WorldState | null, ownerId: string): number {
  if (!worldState) return 0;
  let count = 0;
  worldState.divisions.forEach((d) => {
    if (d.currentProvinceId === provinceId && d.ownerId === ownerId) count++;
  });
  return count;
}

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, getWorldState, getRunner } = useGame();
  const [hoveredProvinceId, setHoveredProvinceId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const worldState = getWorldState();
  const provinces: Province[] = [];
  if (worldState) {
    worldState.provinces.forEach((p) => provinces.push(p));
  }

  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1 / zoom;
    const gridTotalWidth = GRID_COLS * (PROVINCE_WIDTH + PROVINCE_GAP) + GRID_OFFSET_X * 2;
    const gridTotalHeight = GRID_ROWS * (PROVINCE_HEIGHT + PROVINCE_GAP) + GRID_OFFSET_Y * 2;
    for (let x = 0; x < gridTotalWidth; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gridTotalHeight);
      ctx.stroke();
    }
    for (let y = 0; y < gridTotalHeight; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(gridTotalWidth, y);
      ctx.stroke();
    }

    const PLAYER_ID = 'p1';
    const { buildMode } = state;

    provinces.forEach((province) => {
      const layout = getProvinceLayout(province.id, provinces);
      const isSelected = state.selectedProvinceId === province.id;
      const isHovered = hoveredProvinceId === province.id;
      const isPlayerOwned = province.controllerId === PLAYER_ID;
      const isBuildable = buildMode !== null && isPlayerOwned;

      let fillColor = PROVINCE_COLORS[province.controllerId] || '#333';
      if (buildMode) {
        fillColor = isBuildable ? `${PROVINCE_COLORS[province.controllerId] || '#333'}` : '#1a1a2a';
      } else if (isSelected) {
        fillColor = PROVINCE_SELECTED_COLORS[province.controllerId] || '#555';
      } else if (isHovered) {
        fillColor = PROVINCE_HOVER_COLORS[province.controllerId] || '#444';
      }

      ctx.fillStyle = fillColor;
      ctx.fillRect(layout.x, layout.y, layout.width, layout.height);

      let strokeColor = STROKE_COLOR;
      let lineWidth = 1.5 / zoom;
      if (buildMode) {
        strokeColor = isBuildable ? BUILDABLE_STROKE_COLOR : NON_BUILDABLE_STROKE_COLOR;
        lineWidth = isBuildable ? 3 / zoom : 1 / zoom;
      } else if (isSelected) {
        strokeColor = STROKE_HOVER_COLOR;
        lineWidth = 3 / zoom;
      } else if (isHovered) {
        strokeColor = STROKE_HOVER_COLOR;
        lineWidth = 2 / zoom;
      }

      if (isBuildable && isHovered) {
        strokeColor = '#a0ffa0';
        lineWidth = 3 / zoom;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(layout.x, layout.y, layout.width, layout.height);

      ctx.fillStyle = isSelected || isHovered || (buildMode && isBuildable) ? '#ffffff' : '#d0d0d0';
      ctx.font = `bold ${12 / zoom}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(province.name, layout.x + layout.width / 2, layout.y + layout.height / 2 - 8 / zoom);

      ctx.font = `${10 / zoom}px system-ui, sans-serif`;
      ctx.fillStyle = isPlayerOwned ? '#8ab0d0' : '#d08080';
      ctx.fillText(`VP: ${province.VP}`, layout.x + layout.width / 2, layout.y + layout.height / 2 + 6 / zoom);

      const buildingCount = countBuildingsInProvince(province.id, worldState);
      if (buildingCount > 0) {
        ctx.font = `${10 / zoom}px system-ui, sans-serif`;
        ctx.fillStyle = '#d4a84b';
        ctx.textAlign = 'left';
        ctx.fillText(`🏭${buildingCount}`, layout.x + 4 / zoom, layout.y + 12 / zoom);
      }

      const divisionCount = worldState ? countDivisionsInProvince(province.id, worldState, province.controllerId) : 0;
      if (divisionCount > 0) {
        const markerSize = 14 / zoom;
        const markerX = layout.x + layout.width - markerSize - 4 / zoom;
        const markerY = layout.y + 4 / zoom;
        ctx.fillStyle = province.controllerId === PLAYER_ID ? '#4080c0' : '#c04040';
        ctx.fillRect(markerX, markerY, markerSize, markerSize);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(markerX, markerY, markerSize, markerSize);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${9 / zoom}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(divisionCount.toString(), markerX + markerSize / 2, markerY + markerSize / 2);
      }

      if (province.infrastructure > 0) {
        ctx.font = `${9 / zoom}px system-ui, sans-serif`;
        ctx.fillStyle = '#808090';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`🛤️${province.infrastructure}`, layout.x + 4 / zoom, layout.y + layout.height - 4 / zoom);
      }
    });

    ctx.restore();

    if (buildMode) {
      ctx.fillStyle = 'rgba(96, 192, 96, 0.1)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#60c060';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔨 建造模式 - 点击己方省份放置建筑', width / 2, 30);
    }
  }, [provinces, state.selectedProvinceId, state.buildMode, hoveredProvinceId, zoom, offset, worldState]);

  useEffect(() => {
    drawMap();
  }, [drawMap, state.worldStateVersion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = width * window.devicePixelRatio;
          canvas.height = height * window.devicePixelRatio;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
          }
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvasSize.width * window.devicePixelRatio;
      canvas.height = canvasSize.height * window.devicePixelRatio;
      canvas.style.width = `${canvasSize.width}px`;
      canvas.style.height = `${canvasSize.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
      drawMap();
    }
  }, [canvasSize, drawMap]);

  const screenToWorld = (screenX: number, screenY: number): { x: number; y: number } => {
    return {
      x: (screenX - offset.x) / zoom,
      y: (screenY - offset.y) / zoom,
    };
  };

  const getProvinceAt = (worldX: number, worldY: number): number | null => {
    for (const province of provinces) {
      const layout = getProvinceLayout(province.id, provinces);
      if (
        worldX >= layout.x &&
        worldX <= layout.x + layout.width &&
        worldY >= layout.y &&
        worldY <= layout.y + layout.height
      ) {
        return province.id;
      }
    }
    return null;
  };

  const handleWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(3, zoom * delta));

    const worldX = (mouseX - offset.x) / zoom;
    const worldY = (mouseY - offset.y) / zoom;

    setOffset({
      x: mouseX - worldX * newZoom,
      y: mouseY - worldY * newZoom,
    });
    setZoom(newZoom);
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 || e.button === 2) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else {
      const worldPos = screenToWorld(mouseX, mouseY);
      const provinceId = getProvinceAt(worldPos.x, worldPos.y);
      setHoveredProvinceId(provinceId);

      if (state.buildMode) {
        const province = provinces.find((p) => p.id === provinceId);
        const isBuildable = province && province.controllerId === 'p1';
        canvas.style.cursor = isBuildable ? 'copy' : 'not-allowed';
      } else {
        canvas.style.cursor = provinceId ? 'pointer' : 'default';
      }
    }
  };

  const handleMouseUp = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const dx = Math.abs(e.clientX - dragStart.x - offset.x);
        const dy = Math.abs(e.clientY - dragStart.y - offset.y);
        if (dx < 5 && dy < 5) {
          const worldPos = screenToWorld(mouseX, mouseY);
          const provinceId = getProvinceAt(worldPos.x, worldPos.y);

          if (state.buildMode && provinceId) {
            const province = provinces.find((p) => p.id === provinceId);
            const runner = getRunner();
            if (province && province.controllerId === 'p1' && runner) {
              runner.queueAction({
                kind: 'placeBuilding',
                type: state.buildMode,
                provinceId,
                factoryCount: 1,
              });
              dispatch({ type: 'SET_BUILD_MODE', buildingType: null });
            }
          } else {
            dispatch({ type: 'SELECT_PROVINCE', provinceId });
          }
        }
      }
    }
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setHoveredProvinceId(null);
    setIsDragging(false);
  };

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (state.buildMode) {
      dispatch({ type: 'SET_BUILD_MODE', buildingType: null });
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0a0a12',
      }}
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{
          display: 'block',
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          fontSize: '11px',
          color: '#606080',
          backgroundColor: 'rgba(13, 13, 24, 0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
        }}
      >
        滚轮缩放 | 拖拽平移 | 右键取消建造
      </div>
    </div>
  );
}
