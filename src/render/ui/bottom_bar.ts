/**
 * 底部入口栏（render/ui/）
 *
 * 实现依据：
 * - PROJECT.md 3.16 主界面布局：底部入口栏
 * - spec S.4.2：工业建设模块视觉权重高于作战模块（核心落地文件）
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * S.4.2 视觉权重落地：
 * - 读取 BOTTOM_BAR_ENTRIES 视觉权重表
 * - 工业建设类（建造/工厂/资源/科研）：宽 × 1.3、字号 INDUSTRY_LABEL（28px）、暖色高饱和
 * - 作战类（作战/外交）：宽 × 1.0、字号 COMBAT_LABEL（20px）、冷色低饱和
 * - 顺序：工业建设类在前且宽，作战类在后且窄
 *
 * 局内无广告原则：底部入口栏不含任何广告入口（商店入口在主菜单局外，不在局内底部栏）。
 */
import { Graphics, Label, Color, Node } from 'cc';
import { createNode, makeGraphicsNode, addEdgeWidget } from '../core/node_factory';
import { drawButton } from '../core/graphics_util';
import {
  BOTTOM_BAR_ENTRIES,
  NEUTRAL_PALETTE,
  SPACING,
  RADIUS,
  EntryVisualWeight,
} from '../core/ui_theme';

/** 入口点击回调（entryId） */
export type BottomBarEntryClickCb = (entryId: string) => void;

/** 单个入口按钮句柄 */
interface EntryHandle {
  entryId: string;
  node: Node;
  graphics: Graphics;
  label: Label;
  isIndustry: boolean;
}

export class BottomBar {
  private _node: Node | null = null;
  private _handles: EntryHandle[] = [];
  private _clickCb: BottomBarEntryClickCb | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const w = 1280;
    const h = 96;
    const node = createNode('BottomBar', parent, w, h);
    addEdgeWidget(node, 'bottom', 0, 0);
    this._node = node;

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawButton(bgGfx, -w / 2, -h / 2, w, h, NEUTRAL_PALETTE.bgDark, NEUTRAL_PALETTE.bgMid, RADIUS.BUTTON);

    // 计算总宽：工业类按 weight 1.3 倍宽，作战类按 weight 1.0 倍宽
    const baseW = 140;
    const entries: EntryVisualWeight[] = BOTTOM_BAR_ENTRIES;
    let totalW = 0;
    const widths = entries.map((e) => {
      const wMul = e.isIndustry ? 1.3 : 1.0;
      const wLen = Math.round(baseW * wMul);
      totalW += wLen;
      return wLen;
    });
    totalW += (entries.length - 1) * SPACING.SM;

    let cursor = -totalW / 2;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const wLen = widths[i];
      const x = cursor + wLen / 2;
      cursor += wLen + SPACING.SM;

      const item = createNode(`Entry_${e.id}`, node, wLen, h - SPACING.LG);
      item.setPosition(x, 0, 0);

      const g = item.addComponent(Graphics);
      const lbl = item.addComponent(Label);
      lbl.string = e.label;
      lbl.fontSize = e.fontSize;
      lbl.lineHeight = Math.round(e.fontSize * 1.4);
      lbl.color = NEUTRAL_PALETTE.textPrimary;
      lbl.horizontalAlign = 1; // CENTER
      lbl.verticalAlign = 1; // CENTER

      drawButton(g, -wLen / 2, -(h - SPACING.LG) / 2, wLen, h - SPACING.LG, e.color, NEUTRAL_PALETTE.bgMid, RADIUS.BUTTON);

      item.on('click', () => this._clickCb?.(e.id));

      this._handles.push({
        entryId: e.id,
        node: item,
        graphics: g,
        label: lbl,
        isIndustry: e.isIndustry,
      });
    }

    return node;
  }

  /** 注册入口点击回调 */
  onEntryClick(cb: BottomBarEntryClickCb): void {
    this._clickCb = cb;
  }

  /** 设置入口激活态（如「建造」入口在建筑模式下高亮） */
  setActive(entryId: string, active: boolean): void {
    const handle = this._handles.find((h) => h.entryId === entryId);
    if (!handle) return;
    const entry = BOTTOM_BAR_ENTRIES.find((e) => e.id === entryId);
    if (!entry) return;
    const fill: Color = active ? NEUTRAL_PALETTE.textPrimary : entry.color;
    const pressed: Color = active ? NEUTRAL_PALETTE.textSecondary : NEUTRAL_PALETTE.bgMid;
    const h = 96 - SPACING.LG;
    const wLen = handle.node.getContentSize().width;
    drawButton(handle.graphics, -wLen / 2, -h / 2, wLen, h, fill, pressed, RADIUS.BUTTON);
  }

  /** 禁用作战入口（Day1/Day2 阶段，spec S.4.1 战斗延后教学） */
  setCombatEntriesEnabled(enabled: boolean): void {
    for (const handle of this._handles) {
      if (handle.isIndustry) continue;
      handle.node.active = enabled;
    }
  }

  get node(): Node | null {
    return this._node;
  }
}
