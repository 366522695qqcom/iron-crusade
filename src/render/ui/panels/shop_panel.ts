/**
 * 局外商店面板（render/ui/panels/）
 *
 * 实现依据：
 * - spec `commerce-redesign` T4 局外商店统一入口
 * - PROJECT.md 第 8 章商业化：局外只卖外观与内容，不卖数值
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 局外可见、局内隐藏（inGameOnly=false，由 main_ui 按模式控制显隐）
 * - 两个分页：「外观」「内容」，互斥切换
 * - 商品仅含展示字段（id/name/description/unlocked/equipped），不含任何数值奖励字段
 * - 解锁方式：看广告（委托 Shop.unlockCosmetic / unlockContent）
 * - 联机模式 Shop.isAvailable()===false → 主界面隐藏入口（本面板仍可独立实例化但不会被挂载）
 *
 * 局内无广告原则：本面板不应对局内模式挂载；调用方负责按模式过滤。
 */
import { Graphics, Label, Color } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawCard } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';
import type { ShopItem } from '../../../platform/ads/shop';

/** 商店分页 */
export type ShopTabPage = 'cosmetics' | 'content';

/** 商店商品视图（与 ShopItem 一致，外加解锁按钮回调） */
export interface ShopItemView extends ShopItem {
  /** 当前页签 */
  page: ShopTabPage;
}

/** 单个商品卡片的渲染句柄 */
interface ShopCardHandle {
  gfx: Graphics;
  nameLabel: Label;
  descLabel: Label;
  statusLabel: Label;
  actionBtn: { node: import('cc').Node; label: Label };
  itemId: string;
  page: ShopTabPage;
}

/** 解锁动作回调（page + itemId） */
export type ShopActionCb = (page: ShopTabPage, itemId: string) => void;

export class ShopPanel extends PanelBase {
  private _cards: ShopCardHandle[] = [];
  private _currentPage: ShopTabPage = 'cosmetics';
  private _actionCb: ShopActionCb | null = null;
  private _equipCb: ((itemId: string) => void) | null = null;
  private _tabLabels: { cosmetics: Label | null; content: Label | null } = {
    cosmetics: null,
    content: null,
  };

  onMount(): void {
    const node = this.node!;
    const w = 720;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'center', 0, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '商店', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 分页切换标签
    const tabY = h / 2 - SPACING.LG - FONT_SIZE.TITLE_LG - SPACING.MD;
    const cosmeticsTab = makeLabel(node, '[ 外观 ]', FONT_SIZE.TITLE, INDUSTRY_PALETTE.primary, 'TabCosmetics');
    cosmeticsTab.node.setPosition(-80, tabY, 0);
    cosmeticsTab.node.on('click', () => this.switchTab('cosmetics'));
    this._tabLabels.cosmetics = cosmeticsTab.label;

    const contentTab = makeLabel(node, '[ 内容 ]', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textSecondary, 'TabContent');
    contentTab.node.setPosition(80, tabY, 0);
    contentTab.node.on('click', () => this.switchTab('content'));
    this._tabLabels.content = contentTab.label;

    // 4 个商品卡槽位（2x2 网格）
    const cardW = 300;
    const cardH = 160;
    const gap = SPACING.MD;
    const gridStartY = tabY - FONT_SIZE.TITLE - SPACING.LG - cardH / 2;
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = (col === 0 ? -1 : 1) * (cardW / 2 + gap / 2);
      const y = gridStartY - row * (cardH + gap);

      const cardNode = createNode(`ShopCard_${i}`, node);
      cardNode.setPosition(x, y, 0);

      const cardGfx = makeGraphicsNode(cardNode, 'Card', cardW, cardH);
      drawCard(cardGfx.graphics, -cardW / 2, -cardH / 2, cardW, cardH, NEUTRAL_PALETTE.cardBg, INDUSTRY_PALETTE.primary);

      const nameLbl = makeLabel(cardNode, '—', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Name');
      nameLbl.node.setPosition(0, cardH / 2 - SPACING.LG - 8, 0);

      const descLbl = makeLabel(cardNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Desc');
      descLbl.node.setPosition(0, 0, 0);

      const statusLbl = makeLabel(cardNode, '未解锁', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.warning, 'Status');
      statusLbl.node.setPosition(-cardW / 2 + 60, -cardH / 2 + 16, 0);

      const actionBtn = makeButton(
        cardNode,
        '看广告解锁',
        120,
        32,
        INDUSTRY_PALETTE.primary,
        INDUSTRY_PALETTE.pressed,
        FONT_SIZE.CAPTION,
        `Btn_${i}`,
      );
      actionBtn.node.setPosition(cardW / 2 - 76, -cardH / 2 + 16, 0);

      this._cards.push({
        gfx: cardGfx.graphics,
        nameLabel: nameLbl.label,
        descLabel: descLbl.label,
        statusLabel: statusLbl.label,
        actionBtn: { node: actionBtn.node, label: actionBtn.label },
        itemId: '',
        page: 'cosmetics',
      });
    }

    this.refreshTabHighlight();
  }

  /** 注册解锁动作回调 */
  onAction(cb: ShopActionCb): void {
    this._actionCb = cb;
  }

  /** 注册装备外观回调（仅外观分页项触发） */
  onEquip(cb: (itemId: string) => void): void {
    this._equipCb = cb;
  }

  /** 切换分页 */
  switchTab(page: ShopTabPage): void {
    if (this._currentPage === page) return;
    this._currentPage = page;
    this.refreshTabHighlight();
  }

  /** 刷新当前页商品列表 */
  updateItems(items: ShopItemView[]): void {
    const pageItems = items.filter((it) => it.page === this._currentPage);
    for (let i = 0; i < this._cards.length; i++) {
      const handle = this._cards[i];
      const item = pageItems[i];
      if (!item) {
        handle.nameLabel.string = '—';
        handle.descLabel.string = '';
        handle.statusLabel.string = '';
        handle.actionBtn.label.string = '';
        handle.actionBtn.node.active = false;
        handle.itemId = '';
        handle.page = this._currentPage;
        continue;
      }
      handle.itemId = item.id;
      handle.page = this._currentPage;
      handle.nameLabel.string = item.name;
      handle.descLabel.string = item.description;

      // 重新绑定按钮回调（避免闭包捕获旧 itemId）
      handle.actionBtn.node.off('click');
      if (item.unlocked) {
        if (this._currentPage === 'cosmetics') {
          handle.statusLabel.string = item.equipped ? '已装备' : '已解锁';
          handle.statusLabel.color = item.equipped ? NEUTRAL_PALETTE.success : NEUTRAL_PALETTE.textSecondary;
          handle.actionBtn.label.string = item.equipped ? '取消装备' : '装备';
          handle.actionBtn.node.active = true;
          handle.actionBtn.node.on('click', () => {
            if (handle.itemId) this._equipCb?.(handle.itemId);
          });
        } else {
          handle.statusLabel.string = '已解锁';
          handle.statusLabel.color = NEUTRAL_PALETTE.success;
          handle.actionBtn.label.string = '';
          handle.actionBtn.node.active = false;
        }
      } else {
        handle.statusLabel.string = '未解锁';
        handle.statusLabel.color = NEUTRAL_PALETTE.warning;
        handle.actionBtn.label.string = '看广告解锁';
        handle.actionBtn.node.active = true;
        handle.actionBtn.node.on('click', () => {
          if (handle.itemId) this._actionCb?.(handle.page, handle.itemId);
        });
      }
    }
  }

  /** 高亮当前页签 */
  private refreshTabHighlight(): void {
    if (this._tabLabels.cosmetics) {
      this._tabLabels.cosmetics.color = this._currentPage === 'cosmetics' ? INDUSTRY_PALETTE.primary : NEUTRAL_PALETTE.textSecondary;
    }
    if (this._tabLabels.content) {
      this._tabLabels.content.color = this._currentPage === 'content' ? INDUSTRY_PALETTE.primary : NEUTRAL_PALETTE.textSecondary;
    }
    // 触发空 update 清空卡片
    for (const handle of this._cards) {
      if (handle.page !== this._currentPage) {
        handle.nameLabel.string = '—';
        handle.descLabel.string = '';
        handle.statusLabel.string = '';
        handle.actionBtn.label.string = '';
        handle.actionBtn.node.active = false;
      }
    }
  }
}

/** 装备状态颜色（供调用方查询，避免硬编码） */
export const SHOP_STATUS_COLOR: { unlocked: Color; equipped: Color; locked: Color } = {
  unlocked: NEUTRAL_PALETTE.textSecondary,
  equipped: NEUTRAL_PALETTE.success,
  locked: NEUTRAL_PALETTE.warning,
};
