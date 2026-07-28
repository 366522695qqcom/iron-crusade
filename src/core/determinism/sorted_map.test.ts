/**
 * SortedMap 确定性测试
 *
 * 实现依据：技术设计文档 2.3 + 附录 C.3
 * - 任何 Map 遍历必须按 key 升序
 * - delete 后剩余 key 仍升序
 * - 跨引擎一致（不依赖 JS Map 插入顺序）
 */
import { describe, it, expect } from 'vitest';
import { SortedMap } from './sorted_map';

describe('SortedMap string key', () => {
  it('按 key 升序遍历（不依赖插入顺序）', () => {
    const m = new SortedMap<string, number>();
    m.set('zebra', 1);
    m.set('apple', 2);
    m.set('mango', 3);
    m.set('banana', 4);
    const keys: string[] = [];
    m.forEach((v, k) => keys.push(k));
    expect(keys).toEqual(['apple', 'banana', 'mango', 'zebra']);
  });

  it('delete 后剩余 key 仍升序', () => {
    const m = new SortedMap<string, number>();
    m.set('c', 3);
    m.set('a', 1);
    m.set('b', 2);
    m.set('d', 4);
    m.delete('b');
    const keys: string[] = [];
    m.forEach((v, k) => keys.push(k));
    expect(keys).toEqual(['a', 'c', 'd']);
  });

  it('覆盖 set 不重复添加 key', () => {
    const m = new SortedMap<string, number>();
    m.set('x', 1);
    m.set('x', 2);
    m.set('x', 3);
    expect(m.size()).toBe(1);
    expect(m.get('x')).toBe(3);
  });
});

describe('SortedMap number key', () => {
  it('按数字升序遍历', () => {
    const m = new SortedMap<number, string>();
    m.set(100, 'a');
    m.set(2, 'b');
    m.set(50, 'c');
    m.set(1, 'd');
    const keys: number[] = [];
    m.forEach((v, k) => keys.push(k));
    expect(keys).toEqual([1, 2, 50, 100]);
  });

  it('负数 key 升序', () => {
    const m = new SortedMap<number, string>();
    m.set(-1, 'a');
    m.set(5, 'b');
    m.set(-10, 'c');
    m.set(0, 'd');
    const keys: number[] = [];
    m.forEach((v, k) => keys.push(k));
    expect(keys).toEqual([-10, -1, 0, 5]);
  });
});

describe('SortedMap 确定性', () => {
  it('相同操作序列必产生相同遍历顺序（跨引擎一致）', () => {
    function buildMap(): SortedMap<string, number> {
      const m = new SortedMap<string, number>();
      m.set('foo', 1);
      m.set('bar', 2);
      m.set('baz', 3);
      m.delete('bar');
      m.set('qux', 4);
      return m;
    }
    const m1 = buildMap();
    const m2 = buildMap();
    const k1: string[] = [];
    const k2: string[] = [];
    m1.forEach((v, k) => k1.push(k));
    m2.forEach((v, k) => k2.push(k));
    expect(k1).toEqual(k2);
    expect(k1).toEqual(['baz', 'foo', 'qux']);
  });

  it('entries() 返回升序 [k, v] 数组', () => {
    const m = new SortedMap<number, string>();
    m.set(3, 'c');
    m.set(1, 'a');
    m.set(2, 'b');
    const entries = m.entries();
    expect(entries).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });
});

describe('SortedMap 构造函数 entries 参数', () => {
  it('空 entries 构造后 forEach 为空', () => {
    const m = new SortedMap<string, number>([]);
    expect(m.size()).toBe(0);
    const keys: string[] = [];
    m.forEach((v, k) => keys.push(k));
    expect(keys).toEqual([]);
  });

  it('已排序 entries 构造后 forEach 顺序与 entries 一致', () => {
    const m = new SortedMap<string, number>([
      ['apple', 1],
      ['banana', 2],
      ['mango', 3],
      ['zebra', 4],
    ]);
    const keys: string[] = [];
    const vals: number[] = [];
    m.forEach((v, k) => { keys.push(k); vals.push(v); });
    expect(keys).toEqual(['apple', 'banana', 'mango', 'zebra']);
    expect(vals).toEqual([1, 2, 3, 4]);
    expect(m.size()).toBe(4);
    expect(m.get('banana')).toBe(2);
  });

  it('构造后 set 新 key 仍能正确排序', () => {
    const m = new SortedMap<string, number>([
      ['b', 2],
      ['c', 3],
    ]);
    m.set('a', 1);
    m.set('d', 4);
    const keys: string[] = [];
    m.forEach((v, k) => keys.push(k));
    expect(keys).toEqual(['a', 'b', 'c', 'd']);
  });

  it('构造后覆盖 set 正常更新 values', () => {
    const m = new SortedMap<string, number>([
      ['b', 2],
      ['c', 3],
    ]);
    m.set('b', 22);
    expect(m.get('b')).toBe(22);
    expect(m.size()).toBe(2);
  });
});
