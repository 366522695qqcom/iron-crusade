/**
 * platform/auth 抖音登录模块统一导出
 */
export type {
  LoginStatus,
  UserInfo,
  LoginResult,
  DouyinAuthChannel,
} from './auth_types';
export { USER_INFO_STORAGE_KEY } from './auth_types';
export { DefaultDouyinAuthChannel } from './douyin_auth';
