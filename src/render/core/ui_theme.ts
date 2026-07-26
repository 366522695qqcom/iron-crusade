/**
 * UI 主题常量（render/ 层共用）
 *
 * 实现依据：
 * - PROJECT.md 3.1 玩法重心：工业建设、资源经营为核心卖点，战争作为可选冲突玩法
 * - spec optimize-for-launch S.4.2：调整主界面入口，工业建设模块视觉权重高于作战模块
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主，严控纹理资源量
 *
 * S.4.2 视觉权重落地方式：
 * - 工业建设类入口（建造/工厂/资源/科研）：暖色高饱和（金橙/铜橙），字号大，强调"经营核心"
 * - 作战类入口（拉线/攻势/外交争端）：冷色低饱和（暗灰蓝），字号小，强调"可选冲突"
 * - 新手引导优先教学工业与资源（A.3 Day1/Day2 → Day3 作战延后）
 *
 * 颜色统一 RGBA 0-1 浮点（Cocos Color 标准）。
 */
import { Color } from 'cc';

/** 设计分辨率（抖音小游戏竖屏为主，本游戏横屏策略） */
export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

/** 字号梯度（px） */
export const FONT_SIZE = {
  /** 主标题（如「建造模式」「工业建设」） */
  TITLE_LG: 32,
  /** 工业建设入口标签（S.4.2 视觉权重：大于作战入口） */
  INDUSTRY_LABEL: 28,
  /** 普通面板标题 */
  TITLE: 24,
  /** 作战入口标签（S.4.2 视觉权重：小于工业入口） */
  COMBAT_LABEL: 20,
  /** 正文 */
  BODY: 18,
  /** 辅助文本 */
  CAPTION: 14,
  /** 角标数字 */
  BADGE: 12,
} as const;

/** 间距（px） */
export const SPACING = {
  XS: 4,
  SM: 8,
  MD: 12,
  LG: 16,
  XL: 24,
  XXL: 32,
} as const;

/** 圆角（px） */
export const RADIUS = {
  /** 卡牌圆角 */
  CARD: 12,
  /** 按钮圆角 */
  BUTTON: 8,
  /** 面板圆角 */
  PANEL: 16,
  /** 角标圆角 */
  BADGE: 10,
} as const;

/**
 * 工业建设类配色（S.4.2 高视觉权重）
 *
 * 暖色高饱和：金橙、铜橙、钢铁灰金、资源翠绿。
 * 用于：建造/工厂/资源/科研入口、面板主色、工业建设卡牌。
 */
export const INDUSTRY_PALETTE = {
  /** 工业建设主色（金橙，醒目） */
  primary: new Color(0.95, 0.62, 0.16, 1),
  /** 工业建设辅色（铜橙，饱和） */
  secondary: new Color(0.82, 0.45, 0.18, 1),
  /** 工业建设按下态 */
  pressed: new Color(0.66, 0.36, 0.14, 1),
  /** 钢铁色（资源条/工业图标） */
  steel: new Color(0.55, 0.58, 0.62, 1),
  /** 资源翠绿（资源充足） */
  resourceOk: new Color(0.28, 0.73, 0.45, 1),
  /** 工业面板背景 */
  panelBg: new Color(0.18, 0.16, 0.13, 0.95),
} as const;

/**
 * 作战类配色（S.4.2 低视觉权重）
 *
 * 冷色低饱和：暗灰蓝、深钢蓝。
 * 用于：拉线/攻势/外交争端入口、作战面板、争端结算。
 *
 * S.2 脱敏：原"战争"色（暗红）改为低饱和蓝灰，弱化战争对抗感。
 */
export const COMBAT_PALETTE = {
  /** 作战主色（暗灰蓝，低饱和） */
  primary: new Color(0.32, 0.36, 0.44, 1),
  /** 作战辅色（深钢蓝） */
  secondary: new Color(0.24, 0.28, 0.36, 1),
  /** 作战按下态 */
  pressed: new Color(0.18, 0.22, 0.28, 1),
  /** 争端决心低（橙黄提示，非红） */
  disputeLow: new Color(0.85, 0.65, 0.20, 1),
  /** 管控区色（黄，S.2 脱敏：原"占领"橙红） */
  controlled: new Color(0.78, 0.68, 0.20, 1),
  /** 作战面板背景 */
  panelBg: new Color(0.14, 0.16, 0.20, 0.95),
} as const;

/**
 * 中性/UI 通用配色
 */
export const NEUTRAL_PALETTE = {
  /** 背景深色 */
  bgDark: new Color(0.08, 0.08, 0.10, 1),
  /** 背景中色 */
  bgMid: new Color(0.14, 0.14, 0.16, 1),
  /** 卡牌底色 */
  cardBg: new Color(0.20, 0.20, 0.24, 1),
  /** 边框 */
  border: new Color(0.32, 0.32, 0.36, 1),
  /** 主文本 */
  textPrimary: new Color(0.95, 0.95, 0.95, 1),
  /** 辅助文本 */
  textSecondary: new Color(0.70, 0.70, 0.72, 1),
  /** 禁用文本 */
  textDisabled: new Color(0.40, 0.40, 0.42, 1),
  /** 警告红 */
  warning: new Color(0.85, 0.30, 0.25, 1),
  /** 成功绿 */
  success: new Color(0.30, 0.78, 0.50, 1),
} as const;

/**
 * 资源条 6 种资源图标色（PROJECT.md 3.2.6 顶部资源条）
 *
 * 顶部资源条用代码绘制小方块 + 资源色，避免纹理依赖。
 */
export const RESOURCE_COLORS: Record<string, Color> = {
  steel: new Color(0.62, 0.65, 0.70, 1),
  oil: new Color(0.20, 0.18, 0.16, 1),
  tungsten: new Color(0.42, 0.50, 0.55, 1),
  rubber: new Color(0.55, 0.38, 0.22, 1),
  aluminum: new Color(0.78, 0.80, 0.82, 1),
  political: new Color(0.85, 0.65, 0.20, 1),
};

/**
 * 入口视觉权重（S.4.2 落地核心数据）
 *
 * 工业建设类 weight = 1.0（满权重）：宽 × 1.3、字号 INDUSTRY_LABEL、高饱和色
 * 作战类 weight = 0.6（弱化）：宽 × 1.0、字号 COMBAT_LABEL、低饱和色
 *
 * bottom_bar.ts 读取此表分配入口视觉资源。
 */
export interface EntryVisualWeight {
  /** 入口 ID（如 'build' / 'factory' / 'combat' / 'diplomacy'） */
  id: string;
  /** 显示名 */
  label: string;
  /** 权重 0-1（1 = 满视觉权重） */
  weight: number;
  /** 字号（取自 FONT_SIZE） */
  fontSize: number;
  /** 主色 */
  color: Color;
  /** 是否工业建设类（true = 高视觉权重） */
  isIndustry: boolean;
}

/**
 * 底部入口栏视觉权重表（S.4.2 落地）
 *
 * 顺序：工业建设类在前且宽，作战类在后且窄。
 */
export const BOTTOM_BAR_ENTRIES: EntryVisualWeight[] = [
  // 工业建设类（高视觉权重，S.4.2 核心）
  { id: 'build', label: '建造', weight: 1.0, fontSize: FONT_SIZE.INDUSTRY_LABEL, color: INDUSTRY_PALETTE.primary, isIndustry: true },
  { id: 'factory', label: '工厂', weight: 1.0, fontSize: FONT_SIZE.INDUSTRY_LABEL, color: INDUSTRY_PALETTE.secondary, isIndustry: true },
  { id: 'resource', label: '资源', weight: 0.9, fontSize: FONT_SIZE.INDUSTRY_LABEL, color: INDUSTRY_PALETTE.resourceOk, isIndustry: true },
  { id: 'research', label: '科研', weight: 0.9, fontSize: FONT_SIZE.INDUSTRY_LABEL, color: INDUSTRY_PALETTE.steel, isIndustry: true },
  // 中性（焦点/时间）
  { id: 'focus', label: '焦点', weight: 0.8, fontSize: FONT_SIZE.TITLE, color: NEUTRAL_PALETTE.textPrimary, isIndustry: false },
  // 作战类（低视觉权重，S.4.2 弱化）
  { id: 'combat', label: '作战', weight: 0.6, fontSize: FONT_SIZE.COMBAT_LABEL, color: COMBAT_PALETTE.primary, isIndustry: false },
  { id: 'diplomacy', label: '外交', weight: 0.6, fontSize: FONT_SIZE.COMBAT_LABEL, color: COMBAT_PALETTE.secondary, isIndustry: false },
];

/** 局外商店入口（独立于底部栏，主界面右上角，commerce-redesign spec） */
export const SHOP_ENTRY = {
  label: '商店',
  fontSize: FONT_SIZE.TITLE,
  color: INDUSTRY_PALETTE.primary,
  /** 商店入口仅局外可见，局内不显示（commerce-redesign：局内无任何广告） */
  inGameOnly: false,
} as const;
