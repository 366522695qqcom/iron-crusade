/**
 * 应用入口（main.ts）
 *
 * 实现依据：
 * - 技术设计文档 1.5 目录结构：src/main.ts 为程序入口
 * - feature-douyin-login spec：抖音登录异步流程
 *
 * 启动流程（异步）：
 * 1. 初始化 Cocos director + 设计分辨率
 * 2. 创建 MainScene（装配所有 UI 子组件）并 runScene
 * 3. 显示登录覆盖层（loggingIn 状态）
 * 4. 调用 DefaultDouyinAuthChannel.login() 进行登录
 * 5. 成功 → 显示 welcome；失败 → 显示 failed，用户点击重试
 * 6. 用户点击"开始游戏" → 创建新游戏 WorldState + Simulation + GameRunner
 * 7. 隐藏登录覆盖层，启动 RAF 循环
 *
 * 用户隔离：使用 UserStorage 为每个用户提供独立存储命名空间
 */
import { director, view } from 'cc';
import { MainScene } from './render/main_scene';
import { GameRunner } from './game/game_runner';
import { DefaultSimulation } from './core/simulation';
import { createNewGameState } from './core/state/initial_state';
import { DefaultDouyinAuthChannel, type UserInfo } from './platform/auth';
import { createUserStorage } from './platform/storage';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const RESOLUTION_POLICY_FIXED_HEIGHT = 2;

let _runner: GameRunner | null = null;
let _currentUser: UserInfo | null = null;

function createGuestUser(): UserInfo {
  return {
    anonymousOpenId: `guest_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
    loginTime: Date.now(),
    isGuest: true,
    nickName: '游客',
  };
}

async function performLogin(auth: DefaultDouyinAuthChannel): Promise<UserInfo> {
  const loginResult = await auth.login();
  if (!loginResult.success || !loginResult.user) {
    return createGuestUser();
  }

  let user = loginResult.user;
  if (!user.isGuest && !user.nickName) {
    const infoResult = await auth.requestUserInfo();
    if (infoResult) {
      user = infoResult;
    }
  }
  return user;
}

function bootGame(mainScene: MainScene, user: UserInfo): void {
  const state = createNewGameState();
  const simulation = DefaultSimulation.create(state);
  const runner = new GameRunner(simulation, state, mainScene, user);
  _runner = runner;
  _currentUser = user;

  const userStorage = createUserStorage(user);
  logInfo(`[boot] User: ${user.isGuest ? 'guest' : (user.nickName || user.anonymousOpenId)}, storage ns: ${userStorage.getNamespace()}`);

  mainScene.timeControl?.onSpeedChange((newSpeed) => {
    runner.setSpeed(newSpeed);
  });

  let lastTs = 0;
  const onFrame = (ts: number): void => {
    if (lastTs === 0) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    runner.stepFrame(dt);
    requestAnimationFrame(onFrame);
  };

  requestAnimationFrame(onFrame);
}

function logInfo(msg: string): void {
  const g = globalThis as unknown as { console?: { log: (...args: unknown[]) => void } };
  if (g.console && typeof g.console.log === 'function') {
    g.console.log(msg);
  }
}

function logError(msg: string): void {
  const g = globalThis as unknown as { console?: { error: (...args: unknown[]) => void } };
  if (g.console && typeof g.console.error === 'function') {
    g.console.error(msg);
  }
}

async function startLoginFlow(mainScene: MainScene): Promise<void> {
  const auth = new DefaultDouyinAuthChannel();
  const loginOverlay = mainScene.loginOverlay;
  if (!loginOverlay) {
    bootGame(mainScene, createGuestUser());
    return;
  }

  loginOverlay.setState('loggingIn');
  loginOverlay.show();

  let user: UserInfo | null = null;
  let lastError: string | undefined;

  while (!user) {
    try {
      user = await performLogin(auth);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    if (!user) {
      loginOverlay.setState('failed', undefined, lastError);
      const retry = await new Promise<boolean>((resolve) => {
        const handler = (action: string) => {
          loginOverlay.onAction(null as unknown as (action: string) => void);
          resolve(action === 'retry');
        };
        loginOverlay.onAction(handler);
      });
      if (!retry) {
        user = createGuestUser();
      }
    }
  }

  loginOverlay.setState('welcome', user);

  loginOverlay.onAction((action) => {
    if (action === 'start') {
      loginOverlay.hide();
      bootGame(mainScene, user!);
    }
  });
}

export function bootstrap(): MainScene {
  view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, RESOLUTION_POLICY_FIXED_HEIGHT);

  const mainScene = new MainScene();
  const scene = mainScene.createScene();
  director.runScene(scene);

  startLoginFlow(mainScene).catch((err) => {
    logError(`[bootstrap] login flow failed, fallback to guest: ${err}`);
    const loginOverlay = mainScene.loginOverlay;
    const guestUser = createGuestUser();
    if (loginOverlay) {
      loginOverlay.setState('welcome', guestUser);
      loginOverlay.onAction((action) => {
        if (action === 'start') {
          loginOverlay.hide();
          bootGame(mainScene, guestUser);
        }
      });
    } else {
      bootGame(mainScene, guestUser);
    }
  });

  return mainScene;
}

export function main(): void {
  bootstrap();
}

export function getCurrentUser(): UserInfo | null {
  return _currentUser;
}

export function getRunner(): GameRunner | null {
  return _runner;
}

main();
