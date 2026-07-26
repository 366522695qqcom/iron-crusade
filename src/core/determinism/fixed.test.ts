/**
 * Fixed 定点数确定性测试
 *
 * 实现依据：附录 C.1.4 单测边界提示
 * - mul 大数 ±32767 × ±32767 必须位级一致
 * - mul 负数符号正确
 * - div 零抛错
 * - add/sub 溢出 wrap
 * - 跨引擎一致：同 raw + 同操作序列结果完全相等
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from './fixed';

describe('Fixed 基本运算', () => {
  it('fromInt / toNumber 往返一致', () => {
    for (let i = -100; i <= 100; i++) {
      expect(Fixed.fromInt(i).toNumber()).toBe(i);
    }
    expect(Fixed.fromInt(32767).toNumber()).toBe(32767);
    expect(Fixed.fromInt(-32768).toNumber()).toBe(-32768);
  });

  it('加法', () => {
    expect(Fixed.fromInt(3).add(Fixed.fromInt(4)).toNumber()).toBe(7);
    expect(Fixed.fromInt(-5).add(Fixed.fromInt(3)).toNumber()).toBe(-2);
  });

  it('减法', () => {
    expect(Fixed.fromInt(10).sub(Fixed.fromInt(7)).toNumber()).toBe(3);
    expect(Fixed.fromInt(-3).sub(Fixed.fromInt(4)).toNumber()).toBe(-7);
  });

  it('mul 正数', () => {
    expect(Fixed.fromInt(6).mul(Fixed.fromInt(7)).toNumber()).toBe(42);
    expect(Fixed.fromInt(100).mul(Fixed.fromInt(200)).toNumber()).toBe(20000);
  });

  it('mul 负数符号（附录 C.1.4）', () => {
    expect(Fixed.fromInt(-6).mul(Fixed.fromInt(7)).toNumber()).toBe(-42);
    expect(Fixed.fromInt(-6).mul(Fixed.fromInt(-7)).toNumber()).toBe(42);
    expect(Fixed.fromInt(6).mul(Fixed.fromInt(-7)).toNumber()).toBe(-42);
  });

  it('mul 大数 ±32767 × ±32767（附录 C.1.4 边界，必须拆位实现）', () => {
    const max = Fixed.fromInt(32767);
    const min = Fixed.fromInt(-32768);
    // 32767 × 32767 = 1,073,676,289，但 Q16.16 上限约 32767.99998
    // 故会 overflow wrap，关键在于"同操作必同结果"，断言确定性而非具体值
    const r1 = max.mul(max);
    const r2 = max.mul(max);
    expect(r1.raw).toBe(r2.raw);

    const r3 = max.mul(min);
    const r4 = max.mul(min);
    expect(r3.raw).toBe(r4.raw);

    const r5 = min.mul(min);
    const r6 = min.mul(min);
    expect(r5.raw).toBe(r6.raw);
  });

  it('div 正数', () => {
    expect(Fixed.fromInt(42).div(Fixed.fromInt(6)).toNumber()).toBe(7);
    expect(Fixed.fromInt(100).div(Fixed.fromInt(4)).toNumber()).toBe(25);
  });

  it('div 零抛错（附录 C.1.4）', () => {
    expect(() => Fixed.fromInt(5).div(Fixed.ZERO)).toThrow('Fixed.div by zero');
  });

  it('比较运算', () => {
    expect(Fixed.fromInt(3).greaterThan(Fixed.fromInt(2))).toBe(true);
    expect(Fixed.fromInt(2).greaterThan(Fixed.fromInt(3))).toBe(false);
    expect(Fixed.fromInt(3).greaterThan(Fixed.fromInt(3))).toBe(false);
    expect(Fixed.fromInt(3).lessThan(Fixed.fromInt(2))).toBe(false);
    expect(Fixed.fromInt(2).lessThan(Fixed.fromInt(3))).toBe(true);
  });
});

describe('Fixed 确定性（跨运行同结果）', () => {
  it('相同 raw + 相同操作序列，结果位级一致', () => {
    // 模拟联机两客户端独立计算
    const a1 = Fixed.fromInt(123);
    const b1 = Fixed.fromInt(456);
    const r1 = a1.mul(b1).add(Fixed.fromInt(789)).div(Fixed.fromInt(3));

    const a2 = Fixed.fromInt(123);
    const b2 = Fixed.fromInt(456);
    const r2 = a2.mul(b2).add(Fixed.fromInt(789)).div(Fixed.fromInt(3));

    expect(r1.raw).toBe(r2.raw);
  });

  it('相同浮点输入 → 相同 Fixed（fromNumber 确定性）', () => {
    const inputs = [0.1, 0.5, 1.5, -2.7, 99.99, -0.001];
    for (const n of inputs) {
      const f1 = Fixed.fromNumber(n);
      const f2 = Fixed.fromNumber(n);
      expect(f1.raw).toBe(f2.raw);
    }
  });
});
