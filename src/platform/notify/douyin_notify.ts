/**
 * 抖音订阅消息推送封装（spec A.5.1）
 *
 * 实现依据：spec `optimize-for-launch` Requirement: 关键事件召回推送
 *           抖音小游戏订阅消息 API：
 *           https://developer.open-douyin.com/docs/game/develop/sdk/interface/subscribe-message/
 *
 * 设计要点：
 * - 封装抖音订阅消息的「请求授权 / 查询授权状态 / 发送」三个能力
 * - 所有 tt API 调用检测 `typeof tt !== 'undefined'`，非抖音环境（如 Web 调试）
 *   fallback 到 noop，返回 false / 'unknown'，不抛异常（平台隔离约束）
 * - 所有方法返回 Promise，异步处理，不阻塞主线程
 * - send 仅在客户端触发占位，实际发送由服务端调用抖音 openapi 完成（注释说明）
 *
 * 平台隔离：本文件不 import cc（platform 层独立于 Cocos），通过全局 `tt` 访问
 * StarkSDK 注入的抖音 API。`declare const tt: any` 为唯一允许的 any（ESLint warn）。
 */

/** 订阅授权状态 */
export type SubscribeAuthStatus = 'accept' | 'reject' | 'unknown';

/**
 * 抖音订阅消息渠道接口
 *
 * 抽象出渠道契约，便于：
 * - 在非抖音环境注入 mock 实现做单测
 * - 未来接入其他推送渠道时替换实现
 */
export interface DouyinNotifyChannel {
  /**
   * 请求用户授权订阅消息（需用户主动触发，如点击按钮）
   * @param templateIds 需要授权的模板 ID 列表
   * @returns 任一模板授权成功返回 true，否则 false
   */
  requestAuthorization(templateIds: string[]): Promise<boolean>;

  /**
   * 发送订阅消息（客户端仅触发占位）
   *
   * 注意：抖音订阅消息的实际发送必须由服务端调用 openapi 完成
   * （https://developer.open-douyin.com/docs/game/develop/server/subscribe-message/send），
   * 客户端无法直接发送。本方法为占位实现：
   * - 抖音环境返回 true（假定服务端发送成功，由服务端 SDK 真正投递）
   * - 非抖音环境返回 false
   * 生产环境应将本方法替换为「上报到服务端，由服务端调用抖音 openapi 发送」。
   *
   * @param templateId 模板 ID
   * @param data       模板参数（与抖音后台模板字段对应）
   * @returns 占位返回：抖音环境 true，非抖音环境 false
   */
  send(templateId: string, data: Record<string, string>): Promise<boolean>;

  /**
   * 查询单个模板的授权状态
   * @param templateId 模板 ID
   * @returns 'accept' | 'reject' | 'unknown'（非抖音环境返回 'unknown'）
   */
  getAuthorizationStatus(templateId: string): Promise<SubscribeAuthStatus>;
}

// 抖音小游戏 StarkSDK 注入的全局 tt 对象。
// 此处 `any` 为平台 SDK 适配的唯一例外（ESLint warn 可接受）。
declare const tt: any;

/**
 * 默认抖音订阅消息渠道实现
 *
 * 平台隔离策略：
 * - 每个方法首先检测 `typeof tt !== 'undefined'` 及对应 API 是否存在
 * - 非抖音环境直接 resolve noop 值（false / 'unknown'），不抛异常
 * - 调用 tt API 时包裹 try/catch，异常时 fallback 到 noop 值
 */
export class DefaultDouyinNotifyChannel implements DouyinNotifyChannel {
  /** 抖音环境检测 */
  private isDouyin(): boolean {
    return typeof tt !== 'undefined' && tt !== null;
  }

  requestAuthorization(templateIds: string[]): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.isDouyin() || typeof tt.requestSubscribeMessage !== 'function') {
        // 非抖音环境或 API 缺失：noop，授权失败
        resolve(false);
        return;
      }
      try {
        tt.requestSubscribeMessage({
          tmplIds: templateIds,
          success: (res: { [key: string]: string }) => {
            // res 形如 { templateId: 'accept' | 'reject' | 'ban' }
            // 任一模板授权即视为成功
            const granted = templateIds.some((id) => res?.[id] === 'accept');
            resolve(granted);
          },
          fail: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  send(templateId: string, data: Record<string, string>): Promise<boolean> {
    // templateId / data 由调用方传入；占位实现暂不实际发送，仅校验参数非空。
    return new Promise<boolean>((resolve) => {
      // 参数校验（防御性，避免空模板 ID 被记录为已发送）
      if (!templateId || !data) {
        resolve(false);
        return;
      }
      if (!this.isDouyin()) {
        // 非抖音环境：noop
        resolve(false);
        return;
      }
      // 生产环境：此处应将 { templateId, data } 上报到服务端，
      // 由服务端调用抖音 openapi subscribeMessage.send 真正投递消息。
      // 客户端占位返回 true，假定服务端发送成功（由 NotifyScheduler 记录为 'sent'）。
      resolve(true);
    });
  }

  getAuthorizationStatus(templateId: string): Promise<SubscribeAuthStatus> {
    return new Promise<SubscribeAuthStatus>((resolve) => {
      if (
        !this.isDouyin() ||
        typeof tt.subscribeMessageStatus !== 'function'
      ) {
        resolve('unknown');
        return;
      }
      try {
        tt.subscribeMessageStatus({
          tmplIds: [templateId],
          success: (res: { [key: string]: string }) => {
            const status = res?.[templateId];
            if (status === 'accept') {
              resolve('accept');
            } else if (status === 'reject') {
              resolve('reject');
            } else {
              resolve('unknown');
            }
          },
          fail: () => resolve('unknown'),
        });
      } catch {
        resolve('unknown');
      }
    });
  }
}
