/**
 * 顶部资源条 + 国家头部（render/ui/）
 *
 * 实现依据：
 * - PROJECT.md 3.2.6 资源 UI：6 种资源图标 + 储备/上限
 * - PROJECT.md 3.6 国家头部：政治点 / 稳定度 / 争端决心 / 发展路线
 * - spec S.2 脱敏：争端决心（原战争支持度）、发展路线（原意识形态）
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.4.2：顶部资源条属工业建设类，用 INDUSTRY_PALETTE 暖色
 *
 * 设计要点：
 * - 贴顶全宽：左侧国家头部 + 中央 6 资源条 + 右侧时间速度控制入口
 * - 6 资源用代码绘制小方块 + 数值（current/cap），储备满高亮、储备低红色
 * - 不显示任何广告入口（局内顶部条禁止广告）
 */
import { Graphics, Label, Color, Node } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../core/node_factory';
import { drawPanel, drawResourceIcon, drawProgressBar } from '../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  RESOURCE_COLORS,
  FONT_SIZE,
  RADIUS,
} from '../core/ui_theme';
import type { ResourceBarShadow, CountryHeaderShadow } from '../core/shadow_reader';

const RESOURCE_ORDER = ['steel', 'oil', 'tungsten', 'rubber', 'aluminum', 'political'];

/** 单个资源项句柄 */
interface ResourceItemHandle {
  type: string;
  iconGfx: Graphics;
  valueLabel: Label;
  barGfx: Graphics;
  barWidth: number;
  lastRatio: number;
  lastValueText: string;
}

export class TopBar {
  private _node: Node | null = null;
  private _items: ResourceItemHandle[] = [];
  private _countryNameLabel: Label | null = null;
  private _lastCountryName = '';
  private _politicalLabel: Label | null = null;
  private _lastPoliticalText = '';
  private _stabilityBar: Graphics | null = null;
  private _stabilityBarW = 0;
  private _lastStabilityRatio = -1;
  private _stabilityLabel: Label | null = null;
  private _lastStabilityText = '';
  private _disputeBar: Graphics | null = null;
  private _disputeBarW = 0;
  private _lastDisputeRatio = -1;
  private _disputeLabel: Label | null = null;
  private _lastDisputeText = '';
  private _pathLabel: Label | null = null;
  private _lastPathText = '';
  private _pauseBtn: { node: Node; label: Label } | null = null;
  private _pauseCb: (() => void) | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const w = 1280;
    const h = 80;
    const node = createNode('TopBar', parent, w, h);
    addEdgeWidget(node, 'top', 0, 0);
    this._node = node;

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.BUTTON);

    // 左侧国家头部
    const headerX = -w / 2 + 200;
    this._countryNameLabel = makeLabel(node, '—', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'CountryName').label;
    this._countryNameLabel.node.setPosition(headerX - 80, 16, 0);

    this._pathLabel = makeLabel(node, '', FONT_SIZE.CAPTION, INDUSTRY_PALETTE.secondary, 'DevPath').label;
    this._pathLabel.node.setPosition(headerX - 80, -8, 0);

    this._politicalLabel = makeLabel(node, '政治 0', FONT_SIZE.CAPTION, INDUSTRY_PALETTE.resourceOk, 'Political').label;
    this._politicalLabel.node.setPosition(headerX - 80, -24, 0);

    // 中央：稳定度 + 争端决心 mini 条
    const miniBarW = 100;
    this._stabilityBarW = miniBarW;
    this._stabilityLabel = makeLabel(node, '稳定 0%', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'StabLabel').label;
    this._stabilityLabel.node.setPosition(headerX + 40, 8, 0);
    const stabBar = makeGraphicsNode(node, 'StabBar', miniBarW, 6);
    stabBar.node.setPosition(headerX + 40, -6, 0);
    drawProgressBar(stabBar.graphics, -miniBarW / 2, -3, miniBarW, 6, 0, NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.success);
    this._stabilityBar = stabBar.graphics;

    this._disputeBarW = miniBarW;
    this._disputeLabel = makeLabel(node, '争端 0%', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'DisputeLabel').label;
    this._disputeLabel.node.setPosition(headerX + 160, 8, 0);
    const dispBar = makeGraphicsNode(node, 'DispBar', miniBarW, 6);
    dispBar.node.setPosition(headerX + 160, -6, 0);
    drawProgressBar(dispBar.graphics, -miniBarW / 2, -3, miniBarW, 6, 0, NEUTRAL_PALETTE.bgMid, INDUSTRY_PALETTE.secondary);
    this._disputeBar = dispBar.graphics;

    // 右侧：6 资源条
    const resStartX = 60;
    const resGap = 100;
    for (let i = 0; i < RESOURCE_ORDER.length; i++) {
      const x = resStartX + i * resGap;
      const item = createNode(`Res_${RESOURCE_ORDER[i]}`, node);
      item.setPosition(x - w / 2 + 320, 0, 0);

      const icon = makeGraphicsNode(item, 'Icon', 20, 20);
      icon.node.setPosition(-32, 0, 0);
      drawResourceIcon(icon.graphics, -10, -10, 20, RESOURCE_COLORS[RESOURCE_ORDER[i]]);

      const valueLabel = makeLabel(item, '0/0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textPrimary, 'Val').label;
      valueLabel.node.setPosition(8, 8, 0);

      const barW = 80;
      const bar = makeGraphicsNode(item, 'Bar', barW, 6);
      bar.node.setPosition(8, -8, 0);
      drawProgressBar(bar.graphics, -barW / 2, -3, barW, 6, 0);

      this._items.push({
        type: RESOURCE_ORDER[i],
        iconGfx: icon.graphics,
        valueLabel,
        barGfx: bar.graphics,
        barWidth: barW,
        lastRatio: -1,
        lastValueText: '',
      });
    }

    // 右上角暂停按钮
    const pauseBtn = makeButton(node, '⏸', 48, 48, NEUTRAL_PALETTE.cardBg, NEUTRAL_PALETTE.border, FONT_SIZE.TITLE, 'PauseBtn');
    pauseBtn.node.setPosition(w / 2 - 32, 0, 0);
    pauseBtn.node.on('click', () => this._pauseCb?.());
    this._pauseBtn = { node: pauseBtn.node, label: pauseBtn.label };

    return node;
  }

  /** 暴露暂停按钮节点（供外部访问器对齐） */
  get pauseBtn(): { node: Node; label: Label } | null {
    return this._pauseBtn;
  }

  /** 注册暂停按钮回调 */
  onPause(cb: () => void): void {
    this._pauseCb = cb;
  }

  /** 刷新国家头部 */
  updateCountryHeader(header: CountryHeaderShadow): void {
    const nameText = header.name;
    if (this._countryNameLabel && this._lastCountryName !== nameText) {
      this._lastCountryName = nameText;
      this._countryNameLabel.string = nameText;
    }
    const pathText = formatDevPath(header.developmentPath);
    if (this._pathLabel && this._lastPathText !== pathText) {
      this._lastPathText = pathText;
      this._pathLabel.string = pathText;
    }
    const politicalText = `政治 ${Math.round(header.politicalPower)}`;
    if (this._politicalLabel && this._lastPoliticalText !== politicalText) {
      this._lastPoliticalText = politicalText;
      this._politicalLabel.string = politicalText;
    }
    const stabilityText = `稳定 ${Math.round(header.stability * 100)}%`;
    if (this._stabilityLabel && this._lastStabilityText !== stabilityText) {
      this._lastStabilityText = stabilityText;
      this._stabilityLabel.string = stabilityText;
    }
    if (this._stabilityBar && this._lastStabilityRatio !== header.stability) {
      this._lastStabilityRatio = header.stability;
      drawProgressBar(this._stabilityBar, -this._stabilityBarW / 2, -3, this._stabilityBarW, 6, header.stability, NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.success);
    }
    const disputeText = `争端 ${Math.round(header.disputeResolve * 100)}%`;
    if (this._disputeLabel && this._lastDisputeText !== disputeText) {
      this._lastDisputeText = disputeText;
      this._disputeLabel.string = disputeText;
    }
    if (this._disputeBar && this._lastDisputeRatio !== header.disputeResolve) {
      this._lastDisputeRatio = header.disputeResolve;
      drawProgressBar(this._disputeBar, -this._disputeBarW / 2, -3, this._disputeBarW, 6, header.disputeResolve, NEUTRAL_PALETTE.bgMid, INDUSTRY_PALETTE.secondary);
    }
  }

  /** 刷新资源条 */
  updateResourceBar(shadow: ResourceBarShadow): void {
    for (const handle of this._items) {
      const it = shadow.items.find((x) => x.type === handle.type);
      if (!it) continue;
      const valueText = `${Math.round(it.current)}/${Math.round(it.cap)}`;
      if (handle.lastValueText !== valueText) {
        handle.lastValueText = valueText;
        handle.valueLabel.string = valueText;
      }
      if (handle.lastRatio !== it.ratio) {
        handle.lastRatio = it.ratio;
        let barColor: Color = INDUSTRY_PALETTE.resourceOk;
        if (it.ratio >= 0.95) barColor = NEUTRAL_PALETTE.success;
        else if (it.ratio < 0.2) barColor = NEUTRAL_PALETTE.warning;
        drawProgressBar(handle.barGfx, -handle.barWidth / 2, -3, handle.barWidth, 6, it.ratio, NEUTRAL_PALETTE.bgMid, barColor);
      }
    }
  }

  get node(): Node | null {
    return this._node;
  }
}

/** 发展路线本地化（S.1 脱敏字段值的展示文案） */
function formatDevPath(path: string): string {
  switch (path) {
    case 'industrial_authoritarian': return '工业集权线';
    case 'communal': return '公社共治线';
    case 'federal_republic': return '联邦共和线';
    default: return path;
  }
}
