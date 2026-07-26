/**
 * 时间控制条（render/time-control/）
 *
 * 实现依据：
 * - PROJECT.md 3.16 时间控制：暂停 / 1x / 2x / 5x
 * - 技术设计文档 2.4 tick 调度：单机允许 5x，联机仅 1x/2x
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 屏幕右下角横向 4 按钮：⏸ / 1x / 2x / 5x
 * - 当前速度按钮高亮（accent 色）
 * - 联机模式禁用 5x（由调用方 setAllow5x(false) 控制）
 *
 * 局内无广告原则：时间控制不含任何广告入口。
 */
import { Graphics, Label, Node, Color } from 'cc';
import { createNode, addEdgeWidget } from '../core/node_factory';
import { drawButton } from '../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../core/ui_theme';

export type GameSpeedValue = 0 | 1 | 2 | 5;

/** 单个速度按钮句柄 */
interface SpeedButtonHandle {
  speed: GameSpeedValue;
  node: Node;
  graphics: Graphics;
  label: Label;
}

const SPEED_DEFS: { speed: GameSpeedValue; label: string }[] = [
  { speed: 0, label: '⏸' },
  { speed: 1, label: '1x' },
  { speed: 2, label: '2x' },
  { speed: 5, label: '5x' },
];

export class TimeControl {
  private _node: Node | null = null;
  private _handles: SpeedButtonHandle[] = [];
  private _currentSpeed: GameSpeedValue = 1;
  private _allow5x = true;
  private _changeCb: ((speed: GameSpeedValue) => void) | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const btnSize = 48;
    const gap = SPACING.XS;
    const w = btnSize * 4 + gap * 3 + SPACING.LG * 2;
    const h = btnSize + SPACING.LG * 2;
    const node = createNode('TimeControl', parent, w, h);
    addEdgeWidget(node, 'bottom', 96 + SPACING.SM, 0);
    this._node = node;

    const startX = -w / 2 + SPACING.LG + btnSize / 2;
    for (let i = 0; i < SPEED_DEFS.length; i++) {
      const def = SPEED_DEFS[i];
      const item = createNode(`Speed_${def.speed}`, node, btnSize, btnSize);
      const x = startX + i * (btnSize + gap);
      item.setPosition(x, 0, 0);

      const g = item.addComponent(Graphics);
      const lbl = item.addComponent(Label);
      lbl.string = def.label;
      lbl.fontSize = FONT_SIZE.TITLE;
      lbl.lineHeight = Math.round(FONT_SIZE.TITLE * 1.4);
      lbl.color = NEUTRAL_PALETTE.textPrimary;
      lbl.horizontalAlign = 1; // CENTER
      lbl.verticalAlign = 1; // CENTER

      drawButton(g, -btnSize / 2, -btnSize / 2, btnSize, btnSize, NEUTRAL_PALETTE.cardBg, NEUTRAL_PALETTE.bgMid, RADIUS.BUTTON);

      item.on('click', () => {
        if (def.speed === 5 && !this._allow5x) return;
        this.setSpeed(def.speed);
        this._changeCb?.(def.speed);
      });

      this._handles.push({
        speed: def.speed,
        node: item,
        graphics: g,
        label: lbl,
      });
    }

    this.refreshHighlight();
    return node;
  }

  /** 注册速度切换回调 */
  onSpeedChange(cb: (speed: GameSpeedValue) => void): void {
    this._changeCb = cb;
  }

  /** 设置当前速度（外部同步用） */
  setSpeed(speed: GameSpeedValue): void {
    this._currentSpeed = speed;
    this.refreshHighlight();
  }

  /** 设置是否允许 5x（联机模式禁用） */
  setAllow5x(allow: boolean): void {
    this._allow5x = allow;
    const handle = this._handles.find((h) => h.speed === 5);
    if (handle) {
      handle.node.active = allow;
    }
  }

  get currentSpeed(): GameSpeedValue {
    return this._currentSpeed;
  }

  /** 高亮当前速度按钮 */
  private refreshHighlight(): void {
    const btnSize = 48;
    for (const handle of this._handles) {
      const isCurrent = handle.speed === this._currentSpeed;
      const fill: Color = isCurrent ? INDUSTRY_PALETTE.primary : NEUTRAL_PALETTE.cardBg;
      const pressed: Color = isCurrent ? INDUSTRY_PALETTE.pressed : NEUTRAL_PALETTE.bgMid;
      drawButton(handle.graphics, -btnSize / 2, -btnSize / 2, btnSize, btnSize, fill, pressed, RADIUS.BUTTON);
      handle.label.color = isCurrent ? NEUTRAL_PALETTE.textPrimary : NEUTRAL_PALETTE.textSecondary;
    }
  }

  get node(): Node | null {
    return this._node;
  }
}
