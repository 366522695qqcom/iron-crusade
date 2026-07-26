/**
 * 每日任务面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.15 每日任务体系：每日 3 任务（建造/生产/作战各 1），未完成不累计
 * - spec B.1.4：实现任务 UI（进度条、领取奖励）
 * - spec S.4.2：每日任务（建造/生产类）属工业建设延展，用 INDUSTRY_PALETTE 高视觉权重；
 *               作战类任务用 COMBAT_PALETTE 低视觉权重（与底部入口栏一致）
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 局内无广告原则：本面板不含任何广告入口 / 数值购买入口。
 * 任务奖励是玩法产出，不是付费门槛。
 */
import { Graphics, Label, Color, Node } from 'cc';
import {
  PanelBase,
  createNode,
  makeLabel,
  makeGraphicsNode,
  makeButton,
  addEdgeWidget,
} from '../../core/node_factory';
import { drawPanel, drawCard, drawProgressBar, colorEquals } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  COMBAT_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

/** 每日任务类型显示名 */
const TYPE_LABELS: Record<string, string> = {
  build: '建造',
  produce: '生产',
  combat: '争端',
};

/** 面板宽度（onMount 与 updateTasks 共享） */
const PANEL_W = 360;
/** 面板高度 */
const PANEL_H = 420;
/** 任务卡宽度（面板内边距后） */
const CARD_W = PANEL_W - 24 * 2;
/** 任务卡高度 */
const CARD_H = 92;

/** 单个任务视图（由 game 层从 DailyTask 转换） */
export interface DailyTaskCardView {
  taskId: string;
  type: 'build' | 'produce' | 'combat';
  title: string;
  current: number;
  target: number;
  /** 0-1 进度比 */
  ratio: number;
  /** 是否已达目标（可领奖） */
  completed: boolean;
  /** 是否已领取奖励 */
  claimed: boolean;
  /** 奖励摘要（如 "+15 政治 / +30 钢"） */
  rewardSummary: string;
}

/** 单个任务卡渲染句柄 */
interface TaskCardHandle {
  cardGfx: Graphics;
  titleLabel: Label;
  typeLabel: Label;
  progressLabel: Label;
  progressBar: Graphics;
  progressBarW: number;
  rewardLabel: Label;
  claimBtn: { node: Node; label: Label };
  taskId: string;
  lastAccent: Color;
  lastRatio: number;
  lastTitleText: string;
  lastTypeText: string;
  lastProgressText: string;
  lastRewardText: string;
  lastClaimText: string;
}

export class DailyTaskPanel extends PanelBase {
  private _cards: TaskCardHandle[] = [];
  private _dateLabel: Label | null = null;
  private _lastDateText = '';
  private _claimCb: ((taskId: string) => void) | null = null;

  onMount(): void {
    const node = this.node!;
    node.setContentSize(PANEL_W, PANEL_H);
    addEdgeWidget(node, 'right', SPACING.LG, 240);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', PANEL_W, PANEL_H);
    drawPanel(bgGfx, -PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    // 顶部标题 + 日期
    makeLabel(node, '每日任务', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, PANEL_H / 2 - SPACING.LG, 0);
    this._dateLabel = makeLabel(node, '—', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Date').label;
    this._dateLabel.node.setPosition(0, PANEL_H / 2 - SPACING.LG - FONT_SIZE.TITLE_LG - SPACING.XS, 0);

    // 3 张任务卡（纵向排列）
    const gap = SPACING.SM;
    const startY = PANEL_H / 2 - SPACING.LG - FONT_SIZE.TITLE_LG - SPACING.MD - CARD_H / 2;
    for (let i = 0; i < 3; i++) {
      const cardNode = createNode(`Task_${i}`, node);
      const y = startY - i * (CARD_H + gap);
      cardNode.setPosition(0, y, 0);

      const cardGfx = makeGraphicsNode(cardNode, `CardBg_${i}`, CARD_W, CARD_H);
      drawCard(
        cardGfx.graphics,
        -CARD_W / 2,
        -CARD_H / 2,
        CARD_W,
        CARD_H,
        NEUTRAL_PALETTE.cardBg,
        INDUSTRY_PALETTE.primary,
      );

      // 任务类型标签（左上）
      const typeLbl = makeLabel(cardNode, '—', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `Type_${i}`).label;
      typeLbl.node.setPosition(-CARD_W / 2 + 36, CARD_H / 2 - SPACING.SM - 4, 0);
      typeLbl.horizontalAlign = 0; // LEFT

      // 任务标题（中上）
      const titleLbl = makeLabel(cardNode, '—', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, `Title_${i}`).label;
      titleLbl.node.setPosition(-CARD_W / 2 + 80, CARD_H / 2 - SPACING.SM - 4, 0);
      titleLbl.horizontalAlign = 0; // LEFT

      // 进度数值（中下）
      const progressLbl = makeLabel(cardNode, '0 / 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `Prog_${i}`).label;
      progressLbl.node.setPosition(-CARD_W / 2 + 36, -8, 0);
      progressLbl.horizontalAlign = 0; // LEFT

      // 进度条（中下，靠右）
      const barW = CARD_W - 120;
      const bar = makeGraphicsNode(cardNode, `Bar_${i}`, barW, 6);
      bar.node.setPosition(20, -8, 0);
      drawProgressBar(bar.graphics, -barW / 2, -3, barW, 6, 0);

      // 奖励摘要（底部）
      const rewardLbl = makeLabel(cardNode, '', FONT_SIZE.CAPTION, INDUSTRY_PALETTE.resourceOk, `Reward_${i}`).label;
      rewardLbl.node.setPosition(-CARD_W / 2 + 36, -CARD_H / 2 + SPACING.SM + 4, 0);
      rewardLbl.horizontalAlign = 0; // LEFT

      // 领取按钮（右下）
      const claimBtn = makeButton(
        cardNode,
        '领取',
        64,
        28,
        INDUSTRY_PALETTE.primary,
        INDUSTRY_PALETTE.pressed,
        FONT_SIZE.CAPTION,
        `ClaimBtn_${i}`,
      );
      claimBtn.node.setPosition(CARD_W / 2 - 44, -CARD_H / 2 + SPACING.SM + 8, 0);
      claimBtn.node.active = false;

      this._cards.push({
        cardGfx: cardGfx.graphics,
        titleLabel: titleLbl,
        typeLabel: typeLbl,
        progressLabel: progressLbl,
        progressBar: bar.graphics,
        progressBarW: barW,
        rewardLabel: rewardLbl,
        claimBtn: { node: claimBtn.node, label: claimBtn.label },
        taskId: '',
        lastAccent: new Color(),
        lastRatio: -1,
        lastTitleText: '',
        lastTypeText: '',
        lastProgressText: '',
        lastRewardText: '',
        lastClaimText: '',
      });
    }
  }

  /** 注册领取奖励回调 */
  onClaim(cb: (taskId: string) => void): void {
    this._claimCb = cb;
  }

  /** 更新日期标签 */
  updateDate(dateKey: string): void {
    if (this._dateLabel && this._lastDateText !== dateKey) {
      this._lastDateText = dateKey;
      this._dateLabel.string = dateKey;
    }
  }

  /** 刷新任务卡 */
  updateTasks(views: DailyTaskCardView[]): void {
    for (let i = 0; i < this._cards.length; i++) {
      const handle = this._cards[i];
      const view = views[i];
      handle.claimBtn.node.off('click');

      if (!view) {
        if (handle.lastTypeText !== '—') {
          handle.lastTypeText = '—';
          handle.typeLabel.string = '—';
        }
        if (handle.lastTitleText !== '—') {
          handle.lastTitleText = '—';
          handle.titleLabel.string = '—';
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
        if (handle.taskId !== '') {
          handle.taskId = '';
        }
        if (handle.lastRatio !== 0) {
          handle.lastRatio = 0;
          drawProgressBar(handle.progressBar, -handle.progressBarW / 2, -3, handle.progressBarW, 6, 0);
        }
        const defaultAccent = INDUSTRY_PALETTE.primary;
        if (!colorEquals(handle.lastAccent, defaultAccent)) {
          handle.lastAccent.r = defaultAccent.r;
          handle.lastAccent.g = defaultAccent.g;
          handle.lastAccent.b = defaultAccent.b;
          handle.lastAccent.a = defaultAccent.a;
          drawCard(
            handle.cardGfx,
            -CARD_W / 2,
            -CARD_H / 2,
            CARD_W,
            CARD_H,
            NEUTRAL_PALETTE.cardBg,
            defaultAccent,
          );
        }
        continue;
      }

      handle.taskId = view.taskId;
      const typeText = `[${TYPE_LABELS[view.type] ?? '—'}]`;
      if (handle.lastTypeText !== typeText) {
        handle.lastTypeText = typeText;
        handle.typeLabel.string = typeText;
      }
      if (handle.lastTitleText !== view.title) {
        handle.lastTitleText = view.title;
        handle.titleLabel.string = view.title;
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

      // 类型配色（S.4.2：建造/生产用工业暖色，作战用作战冷色）
      const accent: Color = view.type === 'combat' ? COMBAT_PALETTE.secondary : INDUSTRY_PALETTE.primary;
      if (!colorEquals(handle.lastAccent, accent)) {
        handle.lastAccent.r = accent.r;
        handle.lastAccent.g = accent.g;
        handle.lastAccent.b = accent.b;
        handle.lastAccent.a = accent.a;
        drawCard(
          handle.cardGfx,
          -CARD_W / 2,
          -CARD_H / 2,
          CARD_W,
          CARD_H,
          NEUTRAL_PALETTE.cardBg,
          accent,
        );
      }

      // 进度条颜色：已完成用 success 绿，进行中用 accent
      const barFg: Color = view.completed ? NEUTRAL_PALETTE.success : accent;
      if (handle.lastRatio !== view.ratio || !colorEquals(handle.lastAccent, barFg)) {
        handle.lastRatio = view.ratio;
        drawProgressBar(
          handle.progressBar,
          -handle.progressBarW / 2,
          -3,
          handle.progressBarW,
          6,
          view.ratio,
          NEUTRAL_PALETTE.bgMid,
          barFg,
        );
      }

      // 领取按钮态
      if (view.completed && !view.claimed) {
        if (handle.lastClaimText !== '领取' || !handle.claimBtn.node.active) {
          handle.lastClaimText = '领取';
          handle.claimBtn.label.string = '领取';
          handle.claimBtn.node.active = true;
        }
        handle.claimBtn.node.on('click', () => {
          if (handle.taskId) this._claimCb?.(handle.taskId);
        });
      } else if (view.claimed) {
        if (handle.lastClaimText !== '已领' || !handle.claimBtn.node.active) {
          handle.lastClaimText = '已领';
          handle.claimBtn.label.string = '已领';
          handle.claimBtn.node.active = true;
        }
        handle.claimBtn.node.off('click');
      } else {
        if (handle.claimBtn.node.active) {
          handle.claimBtn.node.active = false;
        }
      }
    }
  }
}
