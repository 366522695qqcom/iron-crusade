/**
 * 单次会话目标卡片（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.14 单次会话目标：基于存档进度动态生成，主界面顶部目标卡片
 * - spec A 级 - A.4：目标卡片 UI 与完成奖励发放
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 横向卡片，最多 3 个目标并列展示
 * - 进度条 + 描述 + 奖励摘要
 * - 全部完成后卡片变绿，点击领取奖励
 * - 局内显示，无任何广告入口
 */
import { Graphics, Label, Color } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawProgressBar, drawCard, colorEquals } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

/** 会话目标卡片视图（与 game/session/session_goal SessionGoal 对齐） */
export interface SessionGoalCardView {
  /** 目标 ID */
  goalId: string;
  /** 描述文案（如「升级 2 座工厂」） */
  description: string;
  /** 当前进度 */
  current: number;
  /** 目标值 */
  target: number;
  /** 是否已完成 */
  completed: boolean;
  /** 奖励是否已领取 */
  rewardClaimed: boolean;
  /** 奖励摘要（如「+20 政治 / +50 钢铁」） */
  rewardSummary: string;
}

/** 单个目标槽位渲染句柄 */
interface GoalCardHandle {
  gfx: Graphics;
  descLabel: Label;
  progressLabel: Label;
  rewardLabel: Label;
  bar: Graphics;
  barW: number;
  claimBtn: { node: import('cc').Node; label: Label };
  goalId: string;
  lastAccent: Color;
  lastRatio: number;
  lastClaimed: boolean;
  lastDescText: string;
  lastProgressText: string;
  lastRewardText: string;
  lastClaimText: string;
}

export class SessionGoalCard extends PanelBase {
  private _cards: GoalCardHandle[] = [];
  private _claimCb: ((goalId: string) => void) | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 720;
    const h = 120;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'top', SPACING.LG, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '本次会话目标', FONT_SIZE.BODY, NEUTRAL_PALETTE.textSecondary, 'Title')
      .node.setPosition(-w / 2 + 60, h / 2 - SPACING.SM - 8, 0);

    // 3 个并列目标卡槽
    const cardW = 200;
    const cardH = 80;
    const gap = SPACING.SM;
    const totalW = cardW * 3 + gap * 2;
    const startX = -totalW / 2 + cardW / 2;
    const cardY = -8;

    for (let i = 0; i < 3; i++) {
      const cardNode = createNode(`Goal_${i}`, node);
      const x = startX + i * (cardW + gap);
      cardNode.setPosition(x, cardY, 0);

      const cardGfx = makeGraphicsNode(cardNode, 'Card', cardW, cardH);
      drawCard(cardGfx.graphics, -cardW / 2, -cardH / 2, cardW, cardH, NEUTRAL_PALETTE.cardBg, INDUSTRY_PALETTE.primary);

      const descLabel = makeLabel(cardNode, '—', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textPrimary, 'Desc');
      descLabel.node.setPosition(0, cardH / 2 - SPACING.SM - 6, 0);

      const progressLabel = makeLabel(cardNode, '0 / 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Progress');
      progressLabel.node.setPosition(-cardW / 2 + 36, 0, 0);

      const barW = cardW - 100;
      const bar = makeGraphicsNode(cardNode, 'Bar', barW, 6);
      bar.node.setPosition(20, 0, 0);
      drawProgressBar(bar.graphics, -barW / 2, -3, barW, 6, 0);

      const rewardLabel = makeLabel(cardNode, '', FONT_SIZE.CAPTION, INDUSTRY_PALETTE.resourceOk, 'Reward');
      rewardLabel.node.setPosition(0, -cardH / 2 + SPACING.SM + 4, 0);

      const claimBtn = makeButton(cardNode, '领取', 56, 24, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.CAPTION, 'ClaimBtn');
      claimBtn.node.setPosition(cardW / 2 - 36, -cardH / 2 + SPACING.SM + 4, 0);
      claimBtn.node.active = false;

      this._cards.push({
        gfx: cardGfx.graphics,
        descLabel: descLabel.label,
        progressLabel: progressLabel.label,
        rewardLabel: rewardLabel.label,
        bar: bar.graphics,
        barW,
        claimBtn: { node: claimBtn.node, label: claimBtn.label },
        goalId: '',
        lastAccent: new Color(),
        lastRatio: -1,
        lastClaimed: false,
        lastDescText: '',
        lastProgressText: '',
        lastRewardText: '',
        lastClaimText: '',
      });
    }
  }

  /** 注册领取奖励回调 */
  onClaim(cb: (goalId: string) => void): void {
    this._claimCb = cb;
  }

  /** 刷新目标列表 */
  updateGoals(views: SessionGoalCardView[]): void {
    for (let i = 0; i < this._cards.length; i++) {
      const handle = this._cards[i];
      const view = views[i];
      handle.claimBtn.node.off('click');

      if (!view) {
        if (handle.lastDescText !== '—') {
          handle.lastDescText = '—';
          handle.descLabel.string = '—';
        }
        if (handle.lastProgressText !== '') {
          handle.lastProgressText = '';
          handle.progressLabel.string = '';
        }
        if (handle.lastRewardText !== '') {
          handle.lastRewardText = '';
          handle.rewardLabel.string = '';
        }
        if (handle.claimBtn.node.active) {
          handle.claimBtn.node.active = false;
        }
        if (handle.goalId !== '') {
          handle.goalId = '';
        }
        if (handle.lastRatio !== 0) {
          handle.lastRatio = 0;
          drawProgressBar(handle.bar, -handle.barW / 2, -3, handle.barW, 6, 0);
        }
        const defaultAccent = INDUSTRY_PALETTE.primary;
        if (!colorEquals(handle.lastAccent, defaultAccent)) {
          handle.lastAccent.r = defaultAccent.r;
          handle.lastAccent.g = defaultAccent.g;
          handle.lastAccent.b = defaultAccent.b;
          handle.lastAccent.a = defaultAccent.a;
          drawCard(handle.gfx, -100, -40, 200, 80, NEUTRAL_PALETTE.cardBg, defaultAccent);
        }
        continue;
      }

      handle.goalId = view.goalId;
      if (handle.lastDescText !== view.description) {
        handle.lastDescText = view.description;
        handle.descLabel.string = view.description;
      }
      const progressText = `${view.current} / ${view.target}`;
      if (handle.lastProgressText !== progressText) {
        handle.lastProgressText = progressText;
        handle.progressLabel.string = progressText;
      }
      if (handle.lastRewardText !== view.rewardSummary) {
        handle.lastRewardText = view.rewardSummary;
        handle.rewardLabel.string = view.rewardSummary;
      }

      const ratio = view.target > 0 ? view.current / view.target : 0;
      const accent: Color = view.completed ? NEUTRAL_PALETTE.success : INDUSTRY_PALETTE.primary;
      if (!colorEquals(handle.lastAccent, accent)) {
        handle.lastAccent.r = accent.r;
        handle.lastAccent.g = accent.g;
        handle.lastAccent.b = accent.b;
        handle.lastAccent.a = accent.a;
        drawCard(handle.gfx, -100, -40, 200, 80, NEUTRAL_PALETTE.cardBg, accent);
      }
      if (handle.lastRatio !== ratio) {
        handle.lastRatio = ratio;
        drawProgressBar(handle.bar, -handle.barW / 2, -3, handle.barW, 6, ratio, NEUTRAL_PALETTE.bgMid, accent);
      }

      if (view.completed && !view.rewardClaimed) {
        if (handle.lastClaimText !== '领取' || !handle.claimBtn.node.active) {
          handle.lastClaimText = '领取';
          handle.claimBtn.label.string = '领取';
          handle.claimBtn.node.active = true;
        }
        handle.claimBtn.node.on('click', () => {
          if (handle.goalId) this._claimCb?.(handle.goalId);
        });
      } else if (view.rewardClaimed) {
        if (handle.lastClaimText !== '已领' || !handle.claimBtn.node.active) {
          handle.lastClaimText = '已领';
          handle.claimBtn.label.string = '已领';
          handle.claimBtn.node.active = true;
        }
      } else {
        if (handle.claimBtn.node.active) {
          handle.claimBtn.node.active = false;
        }
      }
    }
  }
}
