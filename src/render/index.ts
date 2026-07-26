/**
 * render 层统一导出（render/index.ts）
 *
 * 实现依据：技术设计文档 1.5 目录结构 + 1.2 分层架构
 *
 * 导出原则：
 * - 仅导出 game/main.ts 需要的顶层装配类与 shadow 类型
 * - core/* 工具类（node_factory / graphics_util / ui_theme）不在此导出，
 *   由各子模块自行 import（避免循环依赖）
 * - 子面板/卡片/遮罩不在此导出，由 MainUi 内部装配
 */
export { MainScene } from './main_scene';

export type { MainUiMode } from './ui/main_ui';
export { MainUi } from './ui/main_ui';

export { TopBar } from './ui/top_bar';
export { BottomBar } from './ui/bottom_bar';

export { MapView } from './map/map_view';
export { MapInteraction } from './map/map_interaction';
export type { MapInteractionMode } from './map/map_interaction';
export { ProvinceView } from './map/province_view';
export type { ProvinceHighlightState } from './map/province_view';

export { IdleAlert } from './alerts/idle_alert';

export { TimeControl } from './time-control/time_control';
export type { GameSpeedValue } from './time-control/time_control';

// 影子类型（供 game/ 层注入）
export type {
  MainUiShadow,
  ResourceBarShadow,
  ResourceBarItem,
  FocusPanelShadow,
  FocusCandidateShadow,
  ResearchPanelShadow,
  ResearchLineShadow,
  FactoryPanelShadow,
  FactoryShadow,
  CountryHeaderShadow,
} from './core/shadow_reader';
// 助理面板影子（独立构造，不经过 shadow_reader；spec A.2.4）
export type { AssistantPanelShadow, AssistantOpView } from './ui/panels/assistant_panel';
// 每日任务面板视图（独立构造；spec B.1.4）
export type { DailyTaskCardView } from './ui/panels/daily_task_panel';
// 作战面板影子（独立构造；spec S.4.2）
export type { CombatPanelShadow, FrontLineView, CombatStatsView, CombatAction } from './ui/panels/combat_panel';
export {
  readMainUiShadow,
  readResourceBar,
  readFocusPanel,
  readResearchPanel,
  readFactoryPanel,
  readCountryHeader,
  readCombatPanelShadow,
  getPlayerCountryId,
} from './core/shadow_reader';
