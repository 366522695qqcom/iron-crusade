/**
 * 主界面骨架（render/ui/）
 *
 * 实现依据：
 * - PROJECT.md 3.16 主界面布局：顶部资源条 + 中央地图 + 左侧工厂面板 + 右侧焦点/科研面板 + 底部入口栏
 * - spec S.4.2：工业建设模块视觉权重高于作战模块（底部入口栏落地）
 * - spec A 级：双模式 / 助理 / 新手引导 / 会话目标
 * - 技术设计文档 1.4 单 tick 数据流：core → 影子 → 渲染
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 职责：
 * - 挂载所有 UI 子组件（top_bar / bottom_bar / 各 panels / overlays / alerts）
 * - 每帧从 shadow_reader 拉取 MainUiShadow 分发给各子组件 update
 * - 按模式控制显隐（quick / classic / menu）
 * - 局内不显示商店入口（ShopPanel 仅在 menu 模式下挂载）
 *
 * 局内无广告原则：
 * - 主界面（局内）不挂载 ShopPanel
 * - 仅主菜单（局外）挂载 ShopPanel
 */
import { Node } from 'cc';
import { createNode, addFullWidget } from '../core/node_factory';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../core/ui_theme';
import { TopBar } from './top_bar';
import { BottomBar } from './bottom_bar';
import { MapView } from '../map/map_view';
import { MapInteraction } from '../map/map_interaction';
import { ResourcePanel } from './panels/resource_panel';
import { BuildingPanel } from './panels/building_panel';
import { FactoryPanel } from './panels/factory_panel';
import { FocusPanel } from './panels/focus_panel';
import { ResearchPanel } from './panels/research_panel';
import { DiplomacyPanel } from './panels/diplomacy_panel';
import { CombatPanel, CombatPanelShadow } from './panels/combat_panel';
import { AssistantPanel, AssistantPanelShadow } from './panels/assistant_panel';
import { DailyTaskPanel, DailyTaskCardView } from './panels/daily_task_panel';
import { SavePanel } from './panels/save_panel';
import { ShopPanel } from './panels/shop_panel';
import { SessionGoalCard } from './panels/session_goal_card';
import { FocusCard } from './cards/focus_card';
import { PauseOverlay } from './overlays/pause_overlay';
import { OnboardingOverlay } from './overlays/onboarding_overlay';
import type { MainUiShadow } from '../core/shadow_reader';

/** 主界面模式 */
export type MainUiMode = 'menu' | 'quick' | 'classic';

/**
 * 主界面聚合根
 *
 * 持有所有 UI 子组件引用，对外提供 mount / update / setMode 接口。
 * game/ 层调用 mainUi.update(shadow) 完成每帧渲染刷新。
 */
export class MainUi {
  private _node: Node | null = null;
  private _mode: MainUiMode = 'menu';
  private _buildMode = false;
  private _playerCountryId: string | null = null;

  // 子组件
  private _topBar: TopBar | null = null;
  private _bottomBar: BottomBar | null = null;
  private _mapView: MapView | null = null;
  private _mapInteraction: MapInteraction | null = null;
  private _resourcePanel: ResourcePanel | null = null;
  private _buildingPanel: BuildingPanel | null = null;
  private _factoryPanel: FactoryPanel | null = null;
  private _focusPanel: FocusPanel | null = null;
  private _researchPanel: ResearchPanel | null = null;
  private _diplomacyPanel: DiplomacyPanel | null = null;
  private _combatPanel: CombatPanel | null = null;
  private _assistantPanel: AssistantPanel | null = null;
  private _dailyTaskPanel: DailyTaskPanel | null = null;
  private _savePanel: SavePanel | null = null;
  private _shopPanel: ShopPanel | null = null;
  private _sessionGoalCard: SessionGoalCard | null = null;
  private _focusCard: FocusCard | null = null;
  private _pauseOverlay: PauseOverlay | null = null;
  private _onboardingOverlay: OnboardingOverlay | null = null;

  /** 挂载主界面（首次创建所有子节点） */
  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode('MainUi', parent, DESIGN_WIDTH, DESIGN_HEIGHT);
    addFullWidget(node);
    this._node = node;

    // 顶部资源条（局内显示）
    this._topBar = new TopBar();
    this._topBar.mount(node);

    // 中央地图（局内显示）
    this._mapView = new MapView();
    const mapNode = this._mapView.mount(node);
    this._mapInteraction = new MapInteraction();
    this._mapInteraction.mount(mapNode);

    // 左侧工厂面板
    this._factoryPanel = new FactoryPanel();
    this._factoryPanel.mount(node);

    // 右侧资源详情面板（默认隐藏，点击资源条展开）
    this._resourcePanel = new ResourcePanel();
    this._resourcePanel.mount(node);
    this._resourcePanel.hide();

    // 右侧焦点面板
    this._focusPanel = new FocusPanel();
    this._focusPanel.mount(node);

    // 右侧科研面板（默认隐藏）
    this._researchPanel = new ResearchPanel();
    this._researchPanel.mount(node);
    this._researchPanel.hide();

    // 左下外交面板（默认隐藏）
    this._diplomacyPanel = new DiplomacyPanel();
    this._diplomacyPanel.mount(node);
    this._diplomacyPanel.hide();

    // 右侧作战面板（默认隐藏，spec S.4.2 低视觉权重）
    this._combatPanel = new CombatPanel();
    this._combatPanel.mount(node);
    this._combatPanel.hide();

    // 左侧助理面板（局内显示，spec A.2.4）
    this._assistantPanel = new AssistantPanel();
    this._assistantPanel.mount(node);
    this._assistantPanel.hide();

    // 右侧每日任务面板（局内显示，spec B.1.4；右侧偏上，避让焦点面板）
    this._dailyTaskPanel = new DailyTaskPanel();
    this._dailyTaskPanel.mount(node);
    this._dailyTaskPanel.hide();

    // 底部建筑模式面板（默认隐藏）
    this._buildingPanel = new BuildingPanel();
    this._buildingPanel.mount(node);
    this._buildingPanel.hide();

    // 顶部会话目标卡片（局内显示）
    this._sessionGoalCard = new SessionGoalCard();
    this._sessionGoalCard.mount(node);

    // 底部入口栏（局内显示，S.4.2 视觉权重落地）
    this._bottomBar = new BottomBar();
    this._bottomBar.mount(node);
    this._wireBottomBar();

    // 弹窗层（焦点卡牌 / 暂停 / 引导，默认隐藏）
    this._focusCard = new FocusCard();
    this._focusCard.mount(node);

    this._pauseOverlay = new PauseOverlay();
    this._pauseOverlay.mount(node);

    this._onboardingOverlay = new OnboardingOverlay();
    this._onboardingOverlay.mount(node);

    // 局外面板（存档 / 商店，仅 menu 模式挂载显示）
    this._savePanel = new SavePanel();
    this._savePanel.mount(node);
    this._savePanel.hide();

    this._shopPanel = new ShopPanel();
    this._shopPanel.mount(node);
    this._shopPanel.hide();

    return node;
  }

  /** 每帧刷新（game/ 层调用，传入 shadow_reader 读出的影子） */
  update(shadow: MainUiShadow): void {
    this._playerCountryId = shadow.playerCountry.countryId;
    this._topBar?.updateCountryHeader(shadow.playerCountry);
    this._topBar?.updateResourceBar(shadow.resourceBar);
    this._factoryPanel?.update(shadow.factory);
    this._focusPanel?.update(shadow.focus);
    this._researchPanel?.update(shadow.research);
  }

  /** 单独刷新助理面板（AssistantPanelShadow 由 game 层从 AssistantSystem 直接构造） */
  updateAssistant(shadow: AssistantPanelShadow): void {
    this._assistantPanel?.update(shadow);
  }

  /** 单独刷新每日任务面板（DailyTaskCardView[] 由 game 层从 DailyTaskSystem.getActiveTasks() 转换） */
  updateDailyTasks(dateKey: string, views: DailyTaskCardView[]): void {
    this._dailyTaskPanel?.updateDate(dateKey);
    this._dailyTaskPanel?.updateTasks(views);
  }

  /** 单独刷新作战面板（CombatPanelShadow 由 game 层从 state 读取前线/统计构造） */
  updateCombat(shadow: CombatPanelShadow): void {
    this._combatPanel?.update(shadow);
  }

  /** 接线底部入口栏：点击入口 → 切换对应面板显隐 */
  private _wireBottomBar(): void {
    this._bottomBar?.onEntryClick((entryId) => {
      switch (entryId) {
        case 'build':
          this._buildingPanel?.toggle();
          this._buildMode = this._buildingPanel?.isShown ?? false;
          if (this._buildMode && this._playerCountryId) {
            this._mapView?.startBuildMode(this._playerCountryId);
          } else {
            if (this._playerCountryId) {
              this._mapView?.stopBuildMode(this._playerCountryId);
            } else {
              this._mapView?.clearHighlight();
            }
          }
          break;
        case 'factory':
          this._factoryPanel?.toggle();
          break;
        case 'resource':
          this._resourcePanel?.toggle();
          break;
        case 'research':
          this._researchPanel?.toggle();
          break;
        case 'focus':
          this._focusPanel?.toggle();
          break;
        case 'combat':
          this._combatPanel?.toggle();
          break;
        case 'diplomacy':
          this._diplomacyPanel?.toggle();
          break;
        default:
          break;
      }
    });
  }

  /** 切换模式 */
  setMode(mode: MainUiMode): void {
    this._mode = mode;
    const inGame = mode !== 'menu';
    // 局内组件显隐
    this._topBar?.node?.setPosition(0, inGame ? 0 : 1000, 0);
    this._bottomBar?.node?.setPosition(0, inGame ? 0 : 1000, 0);
    this._sessionGoalCard?.node?.setPosition(0, inGame ? 0 : 1000, 0);
    if (inGame) {
      this._assistantPanel?.show();
      this._dailyTaskPanel?.show();
    } else {
      this._assistantPanel?.hide();
      this._dailyTaskPanel?.hide();
    }
    // 局外面板
    if (mode === 'menu') {
      this._savePanel?.show();
      this._shopPanel?.show();
    } else {
      this._savePanel?.hide();
      this._shopPanel?.hide();
    }
  }

  get mode(): MainUiMode {
    return this._mode;
  }

  // 子组件访问器（供 game/ 层注入回调）
  get topBar(): TopBar | null {
    return this._topBar;
  }
  get bottomBar(): BottomBar | null {
    return this._bottomBar;
  }
  get mapView(): MapView | null {
    return this._mapView;
  }
  get mapInteraction(): MapInteraction | null {
    return this._mapInteraction;
  }
  get resourcePanel(): ResourcePanel | null {
    return this._resourcePanel;
  }
  get buildingPanel(): BuildingPanel | null {
    return this._buildingPanel;
  }
  get factoryPanel(): FactoryPanel | null {
    return this._factoryPanel;
  }
  get focusPanel(): FocusPanel | null {
    return this._focusPanel;
  }
  get researchPanel(): ResearchPanel | null {
    return this._researchPanel;
  }
  get diplomacyPanel(): DiplomacyPanel | null {
    return this._diplomacyPanel;
  }
  get combatPanel(): CombatPanel | null {
    return this._combatPanel;
  }
  get assistantPanel(): AssistantPanel | null {
    return this._assistantPanel;
  }
  get dailyTaskPanel(): DailyTaskPanel | null {
    return this._dailyTaskPanel;
  }
  get savePanel(): SavePanel | null {
    return this._savePanel;
  }
  get shopPanel(): ShopPanel | null {
    return this._shopPanel;
  }
  get sessionGoalCard(): SessionGoalCard | null {
    return this._sessionGoalCard;
  }
  get focusCard(): FocusCard | null {
    return this._focusCard;
  }
  get pauseOverlay(): PauseOverlay | null {
    return this._pauseOverlay;
  }
  get onboardingOverlay(): OnboardingOverlay | null {
    return this._onboardingOverlay;
  }
  get node(): Node | null {
    return this._node;
  }
}
