/**
 * 师团地图标记（render/map/）
 *
 * 实现依据：
 * - M1 feature-grand-war：师团在地图上以小方块标记显示
 * - spec S.4.2：我方绿色、敌方蓝灰、选中高亮描边
 * - 技术设计文档 7.4：cc.Graphics 代码绘制
 *
 * 师团标记跟随省份位置，显示兵力条与状态颜色。
 */
import { Node, Graphics, Color, tween, Tween, UIOpacity } from 'cc';
import { createNode, makeGraphicsNode } from '../core/node_factory';
import {
  COMBAT_PALETTE,
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
} from '../core/ui_theme';
import type { MapDivisionView } from '../core/shadow_reader';

const MARK_W = 22;
const MARK_H = 16;

const STATUS_COLORS: Record<MapDivisionView['status'], Color> = {
  ready: INDUSTRY_PALETTE.resourceOk,
  moving: COMBAT_PALETTE.primary,
  fighting: NEUTRAL_PALETTE.warning,
  retreating: NEUTRAL_PALETTE.textDisabled,
  training: COMBAT_PALETTE.disputeLow,
};

export class DivisionMarker {
  readonly divisionId: number;
  private _node: Node | null = null;
  private _graphics: Graphics | null = null;
  private _strBar: Graphics | null = null;
  private _selectRing: Graphics | null = null;
  private _statusColor: Color = INDUSTRY_PALETTE.resourceOk;
  private _lastIsPlayer = false;
  private _lastIsSelected = false;
  private _lastStrength = -1;
  private _lastStatus: MapDivisionView['status'] = 'ready';
  private _pulseTween: Tween<UIOpacity> | null = null;
  private _uiOpacity: UIOpacity | null = null;
  private _pulsing = false;
  /** 记录ownerId便于MapInteraction过滤仅玩家师团可点 */
  private _ownerId = '';

  constructor(divisionId: number) {
    this.divisionId = divisionId;
  }

  mount(parent: Node, isPlayer: boolean, ownerId?: string): Node {
    if (this._node) return this._node;
    this._ownerId = ownerId ?? '';
    const node = createNode(`Div_${this.divisionId}`, parent, MARK_W, MARK_H);
    this._node = node;
    this._uiOpacity = node.addComponent(UIOpacity);
    const { graphics } = makeGraphicsNode(node, 'Body', MARK_W, MARK_H);
    this._graphics = graphics;
    const { graphics: ring } = makeGraphicsNode(node, 'Ring', MARK_W + 6, MARK_H + 6);
    this._selectRing = ring;
    const { graphics: bar } = makeGraphicsNode(node, 'StrBar', MARK_W - 4, 3);
    bar.node.setPosition(0, -MARK_H / 2 - 3, 0);
    this._strBar = bar;
    this._lastIsPlayer = isPlayer;
    this.redraw();
    return node;
  }

  setPosition(x: number, y: number): void {
    this._node?.setPosition(x, y, 0);
  }

  setLocalOffset(dx: number, dy: number): void {
    this._node?.setPosition(dx, dy, 0);
  }

  update(view: MapDivisionView, isPlayer: boolean): void {
    this._ownerId = view.ownerId;
    let dirty = false;
    if (this._lastIsPlayer !== isPlayer) { this._lastIsPlayer = isPlayer; dirty = true; }
    if (this._lastStatus !== view.status) { this._lastStatus = view.status; this._statusColor = STATUS_COLORS[view.status]; dirty = true; }
    if (Math.abs(this._lastStrength - view.strength) > 0.02) { this._lastStrength = view.strength; this.drawStrBar(); }
    if (this._lastIsSelected !== view.isSelected) { this._lastIsSelected = view.isSelected; dirty = true; this.updateSelectionPulse(); }
    if (dirty) this.redraw();

    if (view.status === 'fighting' || view.status === 'moving') {
      this.startPulse();
    } else {
      this.stopPulse();
    }
  }

  private redraw(): void {
    const g = this._graphics;
    if (!g) return;
    g.clear();
    const fill: Color = this._lastIsPlayer ? this._statusColor : COMBAT_PALETTE.secondary;
    const stroke: Color = this._lastIsPlayer ? NEUTRAL_PALETTE.textPrimary : NEUTRAL_PALETTE.border;
    g.fillColor = fill;
    g.strokeColor = stroke;
    g.lineWidth = 1;
    g.roundRect(-MARK_W / 2, -MARK_H / 2, MARK_W, MARK_H, 3);
    g.fill();
    g.stroke();
    this.drawStrBar();
    this.drawSelectRing();
  }

  private drawStrBar(): void {
    const b = this._strBar;
    if (!b) return;
    b.clear();
    const ratio = Math.max(0, Math.min(1, this._lastStrength));
    b.fillColor = NEUTRAL_PALETTE.bgMid;
    b.rect(-(MARK_W - 4) / 2, -1.5, MARK_W - 4, 3);
    b.fill();
    const fg = ratio > 0.6 ? INDUSTRY_PALETTE.resourceOk : ratio > 0.3 ? COMBAT_PALETTE.disputeLow : NEUTRAL_PALETTE.warning;
    b.fillColor = fg;
    b.rect(-(MARK_W - 4) / 2, -1.5, (MARK_W - 4) * ratio, 3);
    b.fill();
  }

  private drawSelectRing(): void {
    const r = this._selectRing;
    if (!r) return;
    r.clear();
    if (!this._lastIsSelected) return;
    r.strokeColor = INDUSTRY_PALETTE.primary;
    r.lineWidth = 2;
    r.roundRect(-(MARK_W + 6) / 2, -(MARK_H + 6) / 2, MARK_W + 6, MARK_H + 6, 4);
    r.stroke();
  }

  private updateSelectionPulse(): void {
    this.drawSelectRing();
    if (this._lastIsSelected) this.startPulse();
    else this.stopPulse();
  }

  private startPulse(): void {
    if (this._pulsing || !this._uiOpacity) return;
    this._pulsing = true;
    this._uiOpacity.opacity = 255;
    this._pulseTween = tween(this._uiOpacity)
      .to(0.5, { opacity: 150 }, { easing: 'sineOut' })
      .to(0.5, { opacity: 255 }, { easing: 'sineIn' })
      .union()
      .repeatForever()
      .start();
  }

  private stopPulse(): void {
    if (!this._pulsing) return;
    this._pulsing = false;
    if (this._pulseTween) {
      this._pulseTween.stop();
      this._pulseTween = null;
    }
    if (this._uiOpacity) this._uiOpacity.opacity = 255;
  }

  destroy(): void {
    this.stopPulse();
    this._node?.destroy();
    this._node = null;
  }

  get node(): Node | null { return this._node; }
  get ownerId(): string { return this._ownerId; }
  get isPlayer(): boolean { return this._lastIsPlayer; }

  /** 判断局部坐标点（相对MapRoot）是否落在本标记的命中区域 */
  containsPoint(lx: number, ly: number): boolean {
    if (!this._node) return false;
    const px = this._node.position.x;
    const py = this._node.position.y;
    const hw = (MARK_W + 8) / 2;
    const hh = (MARK_H + 8) / 2;
    return lx >= px - hw && lx <= px + hw && ly >= py - hh && ly <= py + hh;
  }
}
