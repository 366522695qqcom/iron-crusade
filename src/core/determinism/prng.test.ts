/**
 * PRNG 确定性测试
 *
 * 实现依据：技术设计文档 2.2 + 附录 C.3.7
 * - 同 seed 必产生完全相同的随机序列
 * - 跨引擎一致（xorshift32 仅用位运算）
 * - 零种子兜底为黄金分割常数
 */
import { describe, it, expect } from 'vitest';
import { PRNG } from './prng';
import { Fixed } from './fixed';

describe('PRNG 确定性', () => {
  it('同 seed 必产生完全相同的序列', () => {
    const p1 = new PRNG(12345);
    const p2 = new PRNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(p1.nextUint32()).toBe(p2.nextUint32());
    }
  });

  it('不同 seed 产生不同序列（概率性，取前 5 项必不同）', () => {
    const p1 = new PRNG(1);
    const p2 = new PRNG(2);
    let diff = 0;
    for (let i = 0; i < 5; i++) {
      if (p1.nextUint32() !== p2.nextUint32()) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('零种子兜底为黄金分割常数（避免恒 0 输出）', () => {
    // 若未兜底，xorshift32(0) 永远输出 0
    const p0 = new PRNG(0);
    expect(p0.nextUint32()).not.toBe(0);
    // 兜底后初始 state = 0x9e3779b9，第一次输出与 seed=0x9e3779b9 一致
    const pGold = new PRNG(0x9e3779b9);
    const pZero = new PRNG(0);
    expect(pZero.nextUint32()).toBe(pGold.nextUint32());
  });

  it('next() 返回 [0, 1) 的 Fixed', () => {
    const p = new PRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = p.next();
      expect(v.raw).toBeGreaterThanOrEqual(0);
      expect(v.raw).toBeLessThan(Fixed.ONE_RAW);
    }
  });

  it('nextInt(n) 返回 [0, n)', () => {
    const p = new PRNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = p.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('nextInt(0) 抛错', () => {
    const p = new PRNG(1);
    expect(() => p.nextInt(0)).toThrow();
    expect(() => p.nextInt(-1)).toThrow();
  });

  it('range(min, max) 返回 [min, max)', () => {
    const p = new PRNG(99);
    for (let i = 0; i < 1000; i++) {
      const v = p.range(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });

  it('联机场景：两个客户端同 seed 同步推进，状态完全一致', () => {
    // 模拟联机：Host 生成 seed，下发到客户端
    const hostSeed = 0xdeadbeef;
    const hostPrng = new PRNG(hostSeed);
    const clientPrng = new PRNG(hostSeed);

    // 每帧调用一次 nextUint32，1000 帧后状态必相等
    for (let i = 0; i < 1000; i++) {
      expect(hostPrng.nextUint32()).toBe(clientPrng.nextUint32());
    }
  });
});
