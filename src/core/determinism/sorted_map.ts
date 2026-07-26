/**
 * 有序 Map：按 key 升序遍历
 *
 * 实现依据：技术设计文档 2.3
 *
 * 确定性约束：
 * - 任何 Map / Set 遍历必须按 key 升序，否则跨引擎遍历顺序差异会导致状态分叉
 * - forEach / entries 在 dirty 标记为 true 时重新排序，保证 delete 后顺序仍正确
 * - 仅支持 string / number 两种 key 类型，避免对象 key 隐式转换的不确定性
 *
 * 性能优化（P2.3）：维护 values 平行数组，forEach/entries 直接索引访问，
 * 消除循环体中 this.store.get(k) 的 Map 查找开销。
 */
export class SortedMap<K extends string | number, V> {
  private store = new Map<K, V>();
  private keys: K[] = [];
  private values: V[] = [];
  private dirty: boolean = false;

  constructor(entries?: [K, V][]) {
    if (entries && entries.length > 0) {
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        this.keys.push(k);
        this.values.push(v);
        this.store.set(k, v);
      }
      this.dirty = false;
    }
  }

  set(k: K, v: V): void {
    if (!this.store.has(k)) {
      this.keys.push(k);
      this.dirty = true;
    } else {
      const i = this.keys.indexOf(k);
      if (i >= 0 && !this.dirty) this.values[i] = v;
    }
    this.store.set(k, v);
  }

  get(k: K): V | undefined {
    return this.store.get(k);
  }

  has(k: K): boolean {
    return this.store.has(k);
  }

  delete(k: K): void {
    if (this.store.delete(k)) {
      const i = this.keys.indexOf(k);
      if (i >= 0) {
        this.keys.splice(i, 1);
        if (!this.dirty) this.values.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.store.clear();
    this.keys = [];
    this.values = [];
    this.dirty = false;
  }

  forEach(cb: (v: V, k: K) => void): void {
    this.ensureSorted();
    const ks = this.keys;
    const vs = this.values;
    for (let i = 0; i < ks.length; i++) {
      cb(vs[i], ks[i]);
    }
  }

  entries(): [K, V][] {
    this.ensureSorted();
    const out: [K, V][] = [];
    const ks = this.keys;
    const vs = this.values;
    for (let i = 0; i < ks.length; i++) {
      out.push([ks[i], vs[i]]);
    }
    return out;
  }

  sortedKeys(): K[] {
    this.ensureSorted();
    return this.keys.slice();
  }

  size(): number {
    return this.keys.length;
  }

  private ensureSorted(): void {
    if (!this.dirty) return;
    this.keys.sort(compareKey);
    this.values.length = 0;
    for (let i = 0; i < this.keys.length; i++) {
      this.values.push(this.store.get(this.keys[i]) as V);
    }
    this.dirty = false;
  }
}

function compareKey<K extends string | number>(a: K, b: K): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
