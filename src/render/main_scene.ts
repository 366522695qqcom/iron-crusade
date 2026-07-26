/**
 * 主场景（render/main_scene.ts）
 *
 * 实现依据：
 * - 技术设计文档 1.5 目录结构：render/ 顶层场景装配
 * - 技术设计文档 1.4 单 tick 数据流：core → 影子 → 渲染
 * - 技术设计文档 2.4 tick 调度：单机由 RAF 驱动
 *
 * 职责：
 * - 装配主界面（MainUi）+ 空闲提醒（IdleAlert）+ 时间控制（TimeControl）
 * - 提供 update(dt) 钩子，由 main.ts 的 RAF 循环驱动
 * - 不直接持有 WorldState，由 game/ 层注入 shadow
 *
 * 注：本骨架仅做装配，不真正驱动 tick（tick 推演由 game/ 层 Simulation 负责）。
 */
import { Node, Scene } from 'cc';
import { createNode } from './core/node_factory';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './core/ui_theme';
import { MainUi } from './ui/main_ui';
import { IdleAlert } from './alerts/idle_alert';
import { TimeControl } from './time-control/time_control';
import type { MainUiShadow, FactoryPanelShadow } from './core/shadow_reader';

/**
 * 主场景装配根
 *
 * 由 main.ts 创建并挂载到 Cocos director。
 * game/ 层通过 mainScene.update(shadow) 推送每帧渲染数据。
 */
export class MainScene {
  private _scene: Scene | null = null;
  private _root: Node | null = null;
  private _mainUi: MainUi | null = null;
  private _idleAlert: IdleAlert | null = null;
  private _timeControl: TimeControl | null = null;
  private _mounted = false;

  /** 创建并挂载场景（返回 Cocos Scene 供 director.runScene 使用） */
  createScene(): Scene {
    if (this._scene) return this._scene;
    const scene = new Scene('MainScene');
    this._scene = scene;

    const root = createNode('Root', scene, DESIGN_WIDTH, DESIGN_HEIGHT);
    this._root = root;

    // 主界面
    this._mainUi = new MainUi();
    this._mainUi.mount(root);

    // 空闲提醒浮窗（局内显示，由 factory shadow.alertLevel 触发）
    this._idleAlert = new IdleAlert();
    this._idleAlert.mount(root);

    // 时间控制条（局内显示）
    this._timeControl = new TimeControl();
    this._timeControl.mount(root);

    this._mounted = true;
    return scene;
  }

  /** 每帧更新（由 main.ts 的 RAF 调用，传入 shadow_reader 读出的影子） */
  update(shadow: MainUiShadow): void {
    if (!this._mounted) return;
    this._mainUi?.update(shadow);
    this._idleAlert?.update(shadow.factory);
  }

  /** 仅刷新空闲提醒（独立于主 shadow，便于提醒系统高频刷新） */
  updateIdleAlert(factoryShadow: FactoryPanelShadow): void {
    this._idleAlert?.update(factoryShadow);
  }

  get mainUi(): MainUi | null {
    return this._mainUi;
  }

  get idleAlert(): IdleAlert | null {
    return this._idleAlert;
  }

  get timeControl(): TimeControl | null {
    return this._timeControl;
  }

  get scene(): Scene | null {
    return this._scene;
  }

  get root(): Node | null {
    return this._root;
  }
}
