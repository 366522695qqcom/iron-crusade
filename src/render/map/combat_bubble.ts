/**
 * 战斗泡泡（render/map/）
 *
 * 实现依据：
 * - M1 feature-grand-war：交火省份上方显示战斗泡泡
 * - spec S.4.2：COMBAT_PALETTE 低饱和蓝灰 + 警告色
 * - 技术设计文档 7.4：cc.Graphics 代码绘制
 *
 * 战斗泡泡显示攻防师团数对比，带脉冲动画。
 */
import { Node, Graphics, Label, Color, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { createNode, makeGraphicsNode, makeLabel } from '../core/node_factory';
import {
  COMBAT_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
} from '../core/ui_theme';
import type { CombatBubbleView } from '../core/shadow_reader';

const BUBBLE_W = 90;
const BUBBLE_H = 36;

export class CombatBubble {
  readonly provinceId: number;
  private _node: Node | null = null;
  private _graphics: Graphics | null = null;
  private _countLabel: Label | null = null;
  private _pulseTween: Tween<UIOpacity> | null = null;
  private _bounceTween: Tween<Node> | null = null;
  private _uiOpacity: UIOpacity | null = null;
  private _lastText = '';

  constructor(provinceId: number) {
    this.provinceId = provinceId;
  }

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode(`CombatBubble_${this.provinceId}`, parent, BUBBLE_W, BUBBLE_H);
    this._node = node;
    this._uiOpacity = node.addComponent(UIOpacity);
    const { graphics } = makeGraphicsNode(node, 'Bg', BUBBLE_W, BUBBLE_H);
    this._graphics = graphics;
    const { label } = makeLabel(node, '', FONT_SIZE.BADGE, NEUTRAL_PALETTE.textPrimary, 'Count');
    this._countLabel = label;
    label.node.setPosition(0, 0, 0);
    this.redraw(0, 0);
    this.startPulse();
    return node;
  }

  setPosition(x: number, y: number): void {
    this._node?.setPosition(x, y + 28, 0);
  }

  update(view: CombatBubbleView): void {
    const text = `${view.attackerDivisions}⚔${view.defenderDivisions}`;
    if (this._lastText !== text) {
      this._lastText = text;
      if (this._countLabel) this._countLabel.string = text;
      this.redraw(view.attackerDivisions, view.defenderDivisions);
    }
  }

  private redraw(a: number, d: number): void {
    const g = this._graphics;
    if (!g) return;
    g.clear();
    const intensity = Math.min(1, (a + d) / 8);
    const fill = new Color(
      COMBAT_PALETTE.secondary.r * 255,
      COMBAT_PALETTE.secondary.g * 255,
      COMBAT_PALETTE.secondary.b * 255,
      220,
    );
    const stroke = intensity > 0.5
      ? new Color(NEUTRAL_PALETTE.warning.r * 255, NEUTRAL_PALETTE.warning.g * 255, NEUTRAL_PALETTE.warning.b * 255, 255)
      : new Color(NEUTRAL_PALETTE.warning.r * 255, NEUTRAL_PALETTE.warning.g * 255, NEUTRAL_PALETTE.warning.b * 255, 200);
    g.fillColor = fill;
    g.strokeColor = stroke;
    g.lineWidth = 2;
    g.roundRect(-BUBBLE_W / 2, -BUBBLE_H / 2, BUBBLE_W, BUBBLE_H, 8);
    g.fill();
    g.stroke();
    // 底部指向三角
    g.moveTo(-6, -BUBBLE_H / 2);
    g.lineTo(0, -BUBBLE_H / 2 - 6);
    g.lineTo(6, -BUBBLE_H / 2);
    g.close();
    g.fill();
  }

  private startPulse(): void {
    if (!this._uiOpacity || this._pulseTween) return;
    this._pulseTween = tween(this._uiOpacity)
      .to(0.6, { opacity: 180 }, { easing: 'sineOut' })
      .to(0.6, { opacity: 255 }, { easing: 'sineIn' })
      .union()
      .repeatForever()
      .start();
    if (this._node) {
      this._node.setScale(1, 1, 1);
      this._bounceTween = tween(this._node)
        .to(0.4, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineOut' })
        .to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
        .union()
        .repeatForever()
        .start();
    }
  }

  destroy(): void {
    if (this._pulseTween) { this._pulseTween.stop(); this._pulseTween = null; }
    if (this._bounceTween) { this._bounceTween.stop(); this._bounceTween = null; }
    this._node?.destroy();
    this._node = null;
  }
}
