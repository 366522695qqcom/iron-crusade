/**
 * 应用入口（main.ts）
 *
 * 实现依据：
 * - 技术设计文档 1.5 目录结构：src/main.ts 为程序入口
 * - 技术设计文档 1.4 单 tick 数据流：core → 影子 → 渲染
 * - 技术设计文档 2.4 tick 调度：单机由 RAF 累积时间触发 N 个 tick
 *
 * 职责：
 * - 初始化 Cocos director + 设计分辨率
 * - 创建 MainScene 并 runScene
 * - 创建 GameRunner（game/ 层）桥接 Simulation 与 MainScene
 * - RAF 循环：累积时间 → GameRunner.stepFrame → 影子推送
 *
 * 注：WorldState 初始化由 game/ 层 loadSave / newGame 负责，
 *     main.ts 仅做装配 + RAF 驱动，不含业务逻辑。
 */
import { director, view } from 'cc';
import { MainScene } from './render/main_scene';
import { GameRunner } from './game/game_runner';
import type { WorldState } from './core/state/world_state';
import type { Simulation } from './core/simulation';

/** 设计分辨率常量（与 ui_theme 对齐） */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
/** Cocos resolution policy：FIXED_HEIGHT（适配抖音竖屏转横屏） */
const RESOLUTION_POLICY_FIXED_HEIGHT = 2;

/**
 * 应用引导
 *
 * 调用顺序：
 * 1. 设置设计分辨率
 * 2. 创建 MainScene（装配所有 UI 子组件）
 * 3. director.runScene
 * 4. 创建 GameRunner（桥接 core/ 与 render/）
 * 5. 启动 RAF 循环（onFrame）→ GameRunner.stepFrame
 *
 * @param simulation core 模拟器（由 game/ 层注入）
 * @param state 初始 WorldState（由 game/ 层 loadSave/newGame 注入）
 * @returns MainScene 实例（供外部访问子组件）
 */
export function bootstrap(simulation: Simulation, state: WorldState): MainScene {
  // 设置设计分辨率
  view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, RESOLUTION_POLICY_FIXED_HEIGHT);

  // 创建主场景
  const mainScene = new MainScene();
  const scene = mainScene.createScene();
  director.runScene(scene);

  // 创建游戏运行时桥接层
  const runner = new GameRunner(simulation, state, mainScene);

  // 同步时间控制回调到 runner
  mainScene.timeControl?.onSpeedChange((newSpeed) => {
    runner.setSpeed(newSpeed);
  });

  // 启动 RAF 循环
  let lastTs = 0;
  const onFrame = (ts: number): void => {
    if (lastTs === 0) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    // GameRunner 内部处理速度倍率 + 累积 + tick + 影子推送
    runner.stepFrame(dt);

    requestAnimationFrame(onFrame);
  };

  requestAnimationFrame(onFrame);

  return mainScene;
}

/**
 * 应用启动入口（Cocos Creator onLoad 钩子或抖音小游戏 onShow 钩子调用）
 *
 * 正式接入后由 game/ 层调用 bootstrap(simulation, state)，
 * game/ 层负责 loadSave / newGame 构造 WorldState + DefaultSimulation。
 */
export function main(): void {
  // 占位：实际启动逻辑由 game/modes/ 在构造好 WorldState + Simulation 后调用 bootstrap
  // 此处保留入口签名，避免编译期未使用警告
  void bootstrap;
}
