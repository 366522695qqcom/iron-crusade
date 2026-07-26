/**
 * 存档面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.11 双模式分层：quick（单局归档）+ classic（3 存档槽）
 * - 技术设计文档 6.4 本地持久存档：单存档 <300KB，差分压缩
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 显示快速对局当前/历史存档 + 经典模式 3 个槽位
 * - 提供保存 / 读取 / 删除三种操作
 * - 不显示任何广告入口（局外存档管理也禁止数值广告）
 * - 操作回调由调用方注入，本面板只负责 UI 渲染与事件派发
 */
import { Graphics, Label } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawCard } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

/** 存档槽视图（统一抽象 quick / classic） */
export interface SaveSlotView {
  /** 槽位 ID（如 'qb_current' / 'classic_0'） */
  slotId: string;
  /** 显示名（如「快速对局 - 当前」/「经典存档 1」） */
  label: string;
  /** 摘要（如「1942.6.1 · 钢铁联邦 · 第 320 tick」） */
  summary: string;
  /** 是否有空存档（true 表示该槽位可创建新存档） */
  empty: boolean;
  /** 最后保存时间戳（ms），0 表示未保存 */
  lastSavedMs: number;
}

/** 存档操作类型 */
export type SaveAction = 'save' | 'load' | 'delete' | 'create';

/** 存档操作回调（slotId + action） */
export type SaveActionCb = (slotId: string, action: SaveAction) => void;

/** 单个存档槽的渲染句柄 */
interface SaveSlotHandle {
  gfx: Graphics;
  labelNode: Label;
  summaryNode: Label;
  timeNode: Label;
  saveBtn: { node: import('cc').Node; label: Label };
  loadBtn: { node: import('cc').Node; label: Label };
  deleteBtn: { node: import('cc').Node; label: Label };
  slotId: string;
}

export class SavePanel extends PanelBase {
  private _slots: SaveSlotHandle[] = [];
  private _actionCb: SaveActionCb | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 640;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'center', 0, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '存档', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 4 个槽位（1 quick + 3 classic）
    const slotW = 560;
    const slotH = 88;
    const gap = SPACING.MD;
    const startY = h / 2 - SPACING.LG - FONT_SIZE.TITLE_LG - SPACING.LG - slotH / 2;
    for (let i = 0; i < 4; i++) {
      const slotNode = createNode(`Slot_${i}`, node);
      const y = startY - i * (slotH + gap);
      slotNode.setPosition(0, y, 0);

      const slotGfx = makeGraphicsNode(slotNode, 'Card', slotW, slotH);
      drawCard(slotGfx.graphics, -slotW / 2, -slotH / 2, slotW, slotH, NEUTRAL_PALETTE.cardBg, INDUSTRY_PALETTE.primary);

      const labelNode = makeLabel(slotNode, '—', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Label');
      labelNode.node.setPosition(-slotW / 2 + 80, slotH / 2 - SPACING.MD - 8, 0);

      const summaryNode = makeLabel(slotNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Summary');
      summaryNode.node.setPosition(-slotW / 2 + 80, 0, 0);

      const timeNode = makeLabel(slotNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Time');
      timeNode.node.setPosition(-slotW / 2 + 80, -slotH / 2 + SPACING.MD, 0);

      const saveBtn = makeButton(slotNode, '保存', 64, 28, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.CAPTION, 'SaveBtn');
      saveBtn.node.setPosition(slotW / 2 - 200, 0, 0);

      const loadBtn = makeButton(slotNode, '读取', 64, 28, INDUSTRY_PALETTE.secondary, INDUSTRY_PALETTE.pressed, FONT_SIZE.CAPTION, 'LoadBtn');
      loadBtn.node.setPosition(slotW / 2 - 128, 0, 0);

      const deleteBtn = makeButton(slotNode, '删除', 64, 28, NEUTRAL_PALETTE.warning, INDUSTRY_PALETTE.pressed, FONT_SIZE.CAPTION, 'DeleteBtn');
      deleteBtn.node.setPosition(slotW / 2 - 56, 0, 0);

      this._slots.push({
        gfx: slotGfx.graphics,
        labelNode: labelNode.label,
        summaryNode: summaryNode.label,
        timeNode: timeNode.label,
        saveBtn: { node: saveBtn.node, label: saveBtn.label },
        loadBtn: { node: loadBtn.node, label: loadBtn.label },
        deleteBtn: { node: deleteBtn.node, label: deleteBtn.label },
        slotId: '',
      });
    }
  }

  /** 注册操作回调 */
  onAction(cb: SaveActionCb): void {
    this._actionCb = cb;
  }

  /** 刷新存档槽列表 */
  updateSlots(views: SaveSlotView[]): void {
    for (let i = 0; i < this._slots.length; i++) {
      const handle = this._slots[i];
      const view = views[i];
      if (!view) {
        handle.labelNode.string = '—';
        handle.summaryNode.string = '';
        handle.timeNode.string = '';
        handle.saveBtn.node.active = false;
        handle.loadBtn.node.active = false;
        handle.deleteBtn.node.active = false;
        handle.slotId = '';
        continue;
      }
      handle.slotId = view.slotId;
      handle.labelNode.string = view.label;
      handle.summaryNode.string = view.empty ? '（空槽位）' : view.summary;
      handle.timeNode.string = view.lastSavedMs > 0 ? formatTime(view.lastSavedMs) : '';

      // 重新绑定按钮回调（避免闭包捕获旧 slotId）
      handle.saveBtn.node.off('click');
      handle.loadBtn.node.off('click');
      handle.deleteBtn.node.off('click');

      if (view.empty) {
        // 空槽位：仅显示「新建」按钮（复用 saveBtn）
        handle.saveBtn.label.string = '新建';
        handle.saveBtn.node.active = true;
        handle.saveBtn.node.on('click', () => {
          if (handle.slotId) this._actionCb?.(handle.slotId, 'create');
        });
        handle.loadBtn.node.active = false;
        handle.deleteBtn.node.active = false;
      } else {
        handle.saveBtn.label.string = '保存';
        handle.saveBtn.node.active = true;
        handle.saveBtn.node.on('click', () => {
          if (handle.slotId) this._actionCb?.(handle.slotId, 'save');
        });
        handle.loadBtn.node.active = true;
        handle.loadBtn.node.on('click', () => {
          if (handle.slotId) this._actionCb?.(handle.slotId, 'load');
        });
        handle.deleteBtn.node.active = true;
        handle.deleteBtn.node.on('click', () => {
          if (handle.slotId) this._actionCb?.(handle.slotId, 'delete');
        });
      }
    }
  }
}

/** 时间戳格式化（YYYY-MM-DD HH:MM，北京时间） */
function formatTime(ms: number): string {
  const offset = 8 * 60 * 60 * 1000;
  const d = new Date(ms + offset);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
