/**
 * 用户隔离存储模块（platform/storage/user_storage.ts）
 *
 * 实现依据：feature-douyin-login spec
 *
 * 职责：
 * - 为每个登录用户提供独立的 storage 命名空间（key 前缀）
 * - 用户未登录时使用 guest 命名空间
 * - 所有读写自动附加 namespace 前缀
 * - 支持：get / set / remove / exists
 *
 * storage key 格式：`gw:{userIdPrefix}:{key}`
 * - userIdPrefix 取 anonymousOpenId 前 8 位或 'guest'
 *
 * 兼容：使用 tt.setStorageSync/tt.getStorageSync 或 localStorage
 */
import type { UserInfo } from '../auth';

const NAMESPACE_PREFIX = 'gw';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  length: number;
  key(index: number): string | null;
}

function getStorage(): StorageLike {
  const g = globalThis as unknown as {
    localStorage?: StorageLike;
    tt?: {
      getStorageSync(key: string): string | undefined;
      setStorageSync(key: string, value: string): void;
      removeStorageSync(key: string): void;
    };
  };
  if (typeof g.localStorage !== 'undefined') {
    return g.localStorage;
  }
  if (g.tt) {
    return {
      getItem: (k: string) => g.tt?.getStorageSync(k) ?? null,
      setItem: (k: string, v: string) => g.tt?.setStorageSync(k, v),
      removeItem: (k: string) => g.tt?.removeStorageSync(k),
      clear: () => { /* noop */ },
      length: 0,
      key: () => null,
    } as unknown as StorageLike;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    length: 0,
    key: () => null,
  } as StorageLike;
}

function namespaceKey(user: UserInfo | null | undefined, key: string): string {
  const prefix = user?.isGuest ? 'guest' : (user?.anonymousOpenId?.substring(0, 8) ?? 'guest');
  return `${NAMESPACE_PREFIX}:${prefix}:${key}`;
}

export interface UserStorage {
  get<T = unknown>(key: string, defaultValue?: T): T | null;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  exists(key: string): boolean;
  clear(): void;
  getNamespace(): string;
}

export function createUserStorage(user: UserInfo | null | undefined): UserStorage {
  const storage = getStorage();
  const ns = user?.isGuest ? 'guest' : (user?.anonymousOpenId?.substring(0, 8) ?? 'guest');

  return {
    get<T = unknown>(key: string, defaultValue?: T): T | null {
      const fullKey = namespaceKey(user, key);
      const raw = storage.getItem(fullKey);
      if (raw == null) return defaultValue ?? null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return defaultValue ?? null;
      }
    },

    set(key: string, value: unknown): void {
      const fullKey = namespaceKey(user, key);
      storage.setItem(fullKey, JSON.stringify(value));
    },

    remove(key: string): void {
      const fullKey = namespaceKey(user, key);
      storage.removeItem(fullKey);
    },

    exists(key: string): boolean {
      const fullKey = namespaceKey(user, key);
      return storage.getItem(fullKey) != null;
    },

    clear(): void {
      const prefix = `${NAMESPACE_PREFIX}:${ns}:`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) keysToRemove.push(k);
      }
      for (const k of keysToRemove) storage.removeItem(k);
    },

    getNamespace(): string {
      return ns;
    },
  };
}
