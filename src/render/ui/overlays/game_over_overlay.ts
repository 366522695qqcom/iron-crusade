/**
 * 游戏结算弹窗（render/ui/overlays/game_over_overlay.ts）
 *
 * 实现依据：M2 系统补全 - 胜负判定与结算
 *
 * 设计要点：
 * - 全屏半透明遮罩 + 居中结算面板
 * - 胜方大标题（胜方绿色"全面胜利"/败方红色"战败"）
 * - 关键统计：持续 tick、歼敌师数、丢失师数、控制VP、战斗时长（天）
 * - 提供「再来一局」「返回主菜单」按钮
 * - 结算时游戏暂停（state.speed=0 由 surrender_system 设置，此处只显示）
 */
import { Node, Color } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addFullWidget } from '../../core/node_factory';
import { drawOverlay, drawPanel } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  COMBAT_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
} from '../../core/ui_theme';

export type GameOverAction = 'restart' | 'exitToMenu';

export interface GameOverStats {
  winnerId: string;
  winnerName: string;
  loserName: string;
  isPlayerWin: boolean;
  durationTicks: number;
  playerDivsKilled: number;
  enemyDivsKilled: number;
  playerProvincesLost: number;
  enemyProvincesLost: number;
  playerControlledVPs: number;
  totalVPs: number;
}

export class GameOverOverlay {
  private _node: Node | null = null;
  private _actionCb: ((action: GameOverAction) => void) | null = null;
  private _titleLabel: any = null;
  private _subtitleLabel: any = null;
  private _statsLabels: any[] = [];

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode('GameOverOverlay', parent, DESIGN_WIDTH, DESIGN_HEIGHT);
    addFullWidget(node);
    node.active = false;
    this._node = node;

    const { graphics: overlayGfx } = makeGraphicsNode(node, 'Overlay', DESIGN_WIDTH, DESIGN_HEIGHT);
    drawOverlay(overlayGfx, -DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0.85);

    const panelW = 520;
    const panelH = 520;
    const panelNode = createNode('Panel', node, panelW, panelH);
    panelNode.setPosition(0, 0, 0);

    const { graphics: bgGfx } = makeGraphicsNode(panelNode, 'Bg', panelW, panelH);
    drawPanel(bgGfx, -panelW / 2, -panelH / 2, panelW, panelH, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    this._titleLabel = makeLabel(panelNode, '胜利!', FONT_SIZE.TITLE_LG, INDUSTRY_PALETTE.resourceOk, 'Title').label;
    this._titleLabel.node.setPosition(0, panelH / 2 - SPACING.XL * 1.5, 0);

    this._subtitleLabel = makeLabel(panelNode, '', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Subtitle').label;
    this._subtitleLabel.node.setPosition(0, panelH / 2 - SPACING.XL * 2.5, 0);

    const statsStartY = panelH / 2 - SPACING.XL * 4;
    const statsLines = 8;
    for (let i = 0; i < statsLines; i++) {
      const lb = makeLabel(panelNode, '', FONT_SIZE.BODY, NEUTRAL_PALETTE.textSecondary, `Stat_${i}`).label;
      lb.node.setPosition(-panelW / 2 + SPACING.XL, statsStartY - i * (FONT_SIZE.BODY + SPACING.SM), 0);
      lb.horizontalAlign = 0;
      this._statsLabels.push(lb);
    }

    const btnW = 220;
    const btnH = 48;
    const gap = SPACING.MD;
    const btns: { action: GameOverAction; label: string; fill: Color; pressed: Color }[] = [
      { action: 'restart', label: '再来一局', fill: COMBAT_PALETTE.primary, pressed: COMBAT_PALETTE.pressed },
      { action: 'exitToMenu', label: '返回主菜单', fill: NEUTRAL_PALETTE.bgMid, pressed: NEUTRAL_PALETTE.textSecondary },
    ];
    for (let i = 0; i < btns.length; i++) {
      const def = btns[i];
      const x = (i - (btns.length - 1) / 2) * (btnW + gap);
      const btn = makeButton(panelNode, def.label, btnW, btnH, def.fill, def.pressed, FONT_SIZE.BODY, `Btn_${def.action}`);
      btn.node.setPosition(x, -panelH / 2 + SPACING.XL + btnH / 2, 0);
      btn.node.on('click', () => this._actionCb?.(def.action));
    }

    return node;
  }

  show(stats: GameOverStats): void {
    if (!this._node) return;
    this._node.active = true;
    this.renderStats(stats);
  }

  hide(): void {
    if (this._node) this._node.active = false;
  }

  onAction(cb: (action: GameOverAction) => void): void {
    this._actionCb = cb;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }

  private renderStats(stats: GameOverStats): void {
    const titleColor = stats.isPlayerWin ? INDUSTRY_PALETTE.resourceOk : NEUTRAL_PALETTE.warning;
    const titleText = stats.isPlayerWin ? '全面胜利' : '战败';
    this._titleLabel.string = titleText;
    this._titleLabel.color = titleColor;

    this._subtitleLabel.string = stats.isPlayerWin
      ? `${stats.loserName} 已向 ${stats.winnerName} 投降`
      : `${stats.winnerName} 击败了 ${stats.loserName}`;
    this._subtitleLabel.color = NEUTRAL_PALETTE.textPrimary;

    const days = Math.floor(stats.durationTicks / 24);
    const lines = [
      `战斗时长: ${days} 天 (${stats.durationTicks} ticks)`,
      `我方歼敌师团: ${stats.enemyDivsKilled}`,
      `我方师团损失: ${stats.playerDivsKilled}`,
      `敌方丢失省份: ${stats.enemyProvincesLost}`,
      `我方丢失省份: ${stats.playerProvincesLost}`,
      `最终控制VP: ${stats.playerControlledVPs}/${stats.totalVPs}`,
    ];

    for (let i = 0; i < this._statsLabels.length; i++) {
      const lb = this._statsLabels[i];
      lb.string = i < lines.length ? lines[i] : '';
    }
  }
}
