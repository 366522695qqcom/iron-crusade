/**
 * 节点工厂（render/ 层共用）
 *
 * 实现依据：技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 提供 createNode / addWidget / makeLabel / makeButton 等工厂方法，
 * 避免每个面板都写一遍 cc.Node + addComponent 样板。
 *
 * 设计约定：
 * - 所有节点默认 layer = Layers.Enum.UI_2D（2D UI 层）
 * - 锚点默认 (0.5, 0.5) 居中，调用方可覆盖
 * - 工厂方法只创建节点与组件，不绑定业务逻辑（业务逻辑由各 panel 自己实现）
 */
import {
  Node,
  UITransform,
  Widget,
  Label,
  Graphics,
  Button,
  Color,
  Layers,
  _decorator,
} from 'cc';
import { NEUTRAL_PALETTE, FONT_SIZE } from './ui_theme';

const { ccclass } = _decorator;

/** 创建基础 UI 节点（带 UITransform） */
export function createNode(
  name: string,
  parent: Node | null = null,
  width: number = 0,
  height: number = 0,
): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  const ui = node.addComponent(UITransform);
  if (width > 0 && height > 0) {
    ui.setContentSize(width, height);
  }
  if (parent) {
    parent.addChild(node);
  }
  return node;
}

/** 给节点添加四边对齐 Widget（让节点铺满父节点或贴边） */
export function addFullWidget(
  node: Node,
  top: number = 0,
  bottom: number = 0,
  left: number = 0,
  right: number = 0,
): Widget {
  const w = node.getComponent(Widget) ?? node.addComponent(Widget);
  w.top = top;
  w.bottom = bottom;
  w.left = left;
  w.right = right;
  w.isAlignTop = true;
  w.isAlignBottom = true;
  w.isAlignLeft = true;
  w.isAlignRight = true;
  w.alignMode = 2; // ALWAYS
  return w;
}

/** 给节点添加贴边 Widget（如顶部条贴顶、底部条贴底） */
export function addEdgeWidget(
  node: Node,
  edge: 'top' | 'bottom' | 'left' | 'right' | 'center',
  offset: number = 0,
  crossAxisOffset: number = 0,
): Widget {
  const w = node.getComponent(Widget) ?? node.addComponent(Widget);
  // 先重置
  w.isAlignTop = false;
  w.isAlignBottom = false;
  w.isAlignLeft = false;
  w.isAlignRight = false;
  w.isAlignHorizontalCenter = false;
  w.isAlignVerticalCenter = false;
  switch (edge) {
    case 'top':
      w.isAlignTop = true;
      w.top = offset;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = crossAxisOffset;
      break;
    case 'bottom':
      w.isAlignBottom = true;
      w.bottom = offset;
      w.isAlignHorizontalCenter = true;
      w.horizontalCenter = crossAxisOffset;
      break;
    case 'left':
      w.isAlignLeft = true;
      w.left = offset;
      w.isAlignVerticalCenter = true;
      w.verticalCenter = crossAxisOffset;
      break;
    case 'right':
      w.isAlignRight = true;
      w.right = offset;
      w.isAlignVerticalCenter = true;
      w.verticalCenter = crossAxisOffset;
      break;
    case 'center':
      w.isAlignHorizontalCenter = true;
      w.isAlignVerticalCenter = true;
      w.horizontalCenter = crossAxisOffset;
      w.verticalCenter = offset;
      break;
  }
  w.alignMode = 2; // ALWAYS
  return w;
}

/** 创建文本 Label 节点 */
export function makeLabel(
  parent: Node,
  text: string,
  fontSize: number = FONT_SIZE.BODY,
  color: Color = NEUTRAL_PALETTE.textPrimary,
  name: string = 'Label',
): { node: Node; label: Label } {
  const node = createNode(name, parent);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.4);
  label.color = color;
  label.horizontalAlign = 1; // CENTER
  label.verticalAlign = 1; // CENTER
  label.overflow = 0; // NONE
  return { node, label };
}

/** 创建带 Graphics 组件的节点（用于代码绘制的面板/按钮/卡牌） */
export function makeGraphicsNode(
  parent: Node,
  name: string,
  width: number,
  height: number,
): { node: Node; graphics: Graphics } {
  const node = createNode(name, parent, width, height);
  const g = node.addComponent(Graphics);
  return { node, graphics: g };
}

/** 创建按钮节点（Graphics 背景 + Label 文字 + Button 组件） */
export function makeButton(
  parent: Node,
  label: string,
  width: number,
  height: number,
  fill: Color,
  pressed: Color,
  fontSize: number = FONT_SIZE.BODY,
  name: string = 'Button',
): { node: Node; graphics: Graphics; label: Label; button: Button } {
  const node = createNode(name, parent, width, height);
  const g = node.addComponent(Graphics);
  const lbl = node.addComponent(Label);
  lbl.string = label;
  lbl.fontSize = fontSize;
  lbl.lineHeight = Math.round(fontSize * 1.4);
  lbl.color = NEUTRAL_PALETTE.textPrimary;
  lbl.horizontalAlign = 1; // CENTER
  lbl.verticalAlign = 1; // CENTER
  const btn = node.addComponent(Button);
  btn.transition = 1; // COLOR
  btn.normalColor = fill;
  btn.pressedColor = pressed;
  btn.hoveredColor = fill;
  btn.disabledColor = NEUTRAL_PALETTE.textDisabled;
  return { node, graphics: g, label: lbl, button: btn };
}

// 内部基类实现（避免 @ccclass 装饰器直接作用于抽象类导致反射问题）
class _PanelBaseImpl {
  protected _node: Node | null = null;
  protected _mounted = false;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode(this.constructor.name, parent);
    this._node = node;
    this._mounted = true;
    (this as unknown as { onMount?: () => void }).onMount?.();
    return node;
  }

  show(): void {
    if (this._node) this._node.active = true;
  }

  hide(): void {
    if (this._node) this._node.active = false;
  }

  toggle(): void {
    if (this._node) this._node.active = !this._node.active;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }

  get node(): Node | null {
    return this._node;
  }
}

/**
 * 面板根节点基类（render/ui/panels/ 共用）
 *
 * 提供面板通用生命周期：show / hide / toggle / isShown。
 * 子类继承后实现 onMount（绘制内容）与 onShow / onHide（可选）。
 */
@ccclass('PanelBase')
export abstract class PanelBase extends _PanelBaseImpl {
  abstract onMount(): void;
}
