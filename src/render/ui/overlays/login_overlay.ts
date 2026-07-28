/**
 * 登录状态覆盖层（render/ui/overlays/login_overlay.ts）
 *
 * 实现依据：feature-douyin-login spec
 *
 * 三种状态：
 * - loggingIn: "正在登录..."加载提示
 * - welcome: 欢迎界面（首次登录成功），显示用户信息和"开始游戏"按钮
 * - failed: "登录失败，点击重试"
 */
import { Node, Label } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addFullWidget } from '../../core/node_factory';
import { drawOverlay, drawPanel } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
} from '../../core/ui_theme';
import type { UserInfo } from '../../../platform/auth';

export type LoginOverlayAction = 'start' | 'retry' | 'requestUserInfo';
export type LoginOverlayState = 'loggingIn' | 'welcome' | 'failed';

export class LoginOverlay {
  private _node: Node | null = null;
  private _actionCb: ((action: LoginOverlayAction) => void) | null = null;
  private _state: LoginOverlayState = 'loggingIn';
  private _titleLabel: Label | null = null;
  private _subtitleLabel: Label | null = null;
  private _userInfoLabel: Label | null = null;
  private _startBtn: ReturnType<typeof makeButton> | null = null;
  private _retryBtn: ReturnType<typeof makeButton> | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode('LoginOverlay', parent, DESIGN_WIDTH, DESIGN_HEIGHT);
    addFullWidget(node);
    node.active = false;
    this._node = node;

    const { graphics: overlayGfx } = makeGraphicsNode(node, 'Overlay', DESIGN_WIDTH, DESIGN_HEIGHT);
    drawOverlay(overlayGfx, -DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0.85);

    const panelW = 420;
    const panelH = 340;
    const panelNode = createNode('Panel', node, panelW, panelH);
    panelNode.setPosition(0, 0, 0);

    const { graphics: bgGfx } = makeGraphicsNode(panelNode, 'Bg', panelW, panelH);
    drawPanel(bgGfx, -panelW / 2, -panelH / 2, panelW, panelH, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    const title = makeLabel(panelNode, '', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title');
    title.node.setPosition(0, panelH / 2 - SPACING.XL, 0);
    this._titleLabel = title.label;

    const sub = makeLabel(panelNode, '', FONT_SIZE.BODY, NEUTRAL_PALETTE.textSecondary, 'Subtitle');
    sub.node.setPosition(0, panelH / 2 - SPACING.XL - SPACING.LG - SPACING.SM, 0);
    this._subtitleLabel = sub.label;

    const userLbl = makeLabel(panelNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'UserInfo');
    userLbl.node.setPosition(0, 0, 0);
    this._userInfoLabel = userLbl.label;

    const btnW = 240;
    const btnH = 52;

    const startBtn = makeButton(panelNode, '开始游戏', btnW, btnH, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.BODY, 'Btn_start');
    startBtn.node.setPosition(0, -panelH / 2 + SPACING.XL + btnH, 0);
    startBtn.node.on('click', () => this._actionCb?.('start'));
    this._startBtn = startBtn;

    const retryBtn = makeButton(panelNode, '重试登录', btnW, btnH, NEUTRAL_PALETTE.warning, INDUSTRY_PALETTE.pressed, FONT_SIZE.BODY, 'Btn_retry');
    retryBtn.node.setPosition(0, -panelH / 2 + SPACING.XL + btnH, 0);
    retryBtn.node.on('click', () => this._actionCb?.('retry'));
    this._retryBtn = retryBtn;

    this.updateUI();
    return node;
  }

  setState(state: LoginOverlayState, user?: UserInfo, errorMsg?: string): void {
    this._state = state;
    this.updateUI(user, errorMsg);
  }

  show(): void {
    if (this._node) this._node.active = true;
  }

  hide(): void {
    if (this._node) this._node.active = false;
  }

  onAction(cb: (action: LoginOverlayAction) => void): void {
    this._actionCb = cb;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }

  private updateUI(user?: UserInfo, errorMsg?: string): void {
    if (!this._titleLabel || !this._subtitleLabel || !this._startBtn || !this._retryBtn || !this._userInfoLabel) return;

    this._startBtn.node.active = false;
    this._retryBtn.node.active = false;
    this._userInfoLabel.node.active = false;

    switch (this._state) {
      case 'loggingIn':
        this._titleLabel.string = '正在登录';
        this._subtitleLabel.string = '正在连接抖音账号...';
        break;
      case 'welcome':
        this._titleLabel.string = '欢迎进入钢铁前线';
        if (user?.isGuest) {
          this._subtitleLabel.string = '游客模式';
        } else {
          this._subtitleLabel.string = user?.nickName ? `欢迎回来，${user.nickName}` : '登录成功';
        }
        if (user) {
          this._userInfoLabel.node.active = true;
          this._userInfoLabel.string = user.isGuest
            ? '提示：在抖音客户端打开可同步存档'
            : `ID: ${user.anonymousOpenId.substring(0, 8)}...`;
        }
        this._startBtn.node.active = true;
        break;
      case 'failed':
        this._titleLabel.string = '登录失败';
        this._subtitleLabel.string = errorMsg || '无法连接服务器，请检查网络';
        this._retryBtn.node.active = true;
        break;
    }
  }
}
