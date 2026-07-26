/**
 * 确定性伪随机数生成器（xorshift32）
 *
 * 实现依据：技术设计文档 2.2
 *
 * - 每个**需要随机的对象**（省份 / 单位 / 玩家 / 焦点刷新）持有独立 PRNG 实例
 * - 种子由 Host 在开局生成并写入 WorldState.seedMap
 * - 联机时 Host 通过快照同步 seedMap，保证所有客户端从同一起点
 *
 * 确定性约束：
 * - 禁止在 core/ 使用 Math.random（ESLint 拦截，附录 C.1.5）
 * - 本文件不依赖任何 Math.* 函数，全部用位运算 + 算术运算
 * - 算法：xorshift32（Marsaglia 2003），轻量、跨引擎一致
 *   （任务描述「如 xorshift128」为算法族举例，技术设计文档 2.2 权威采用 xorshift32）
 */
import { Fixed } from './fixed';

export class PRNG {
  /** uint32 内部状态 */
  private state: number;

  constructor(seed: number) {
    // 避免全 0 状态导致输出恒为 0：用黄金分割常数兜底
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /**
   * 推进一步，返回 uint32（0 .. 4294967295）
   * 算法：xorshift32（Marsaglia 2003）
   *
   * 所有位运算后用 >>> 0 强制转回 uint32，保证跨引擎符号一致。
   */
  nextUint32(): number {
    let x = this.state;
    x ^= (x << 13) | 0;
    x >>>= 0;
    x ^= (x >>> 17);
    x ^= (x << 5) | 0;
    x >>>= 0;
    this.state = x;
    return x >>> 0;
  }

  /**
   * 返回 [0, 1) 的 Fixed
   *
   * 用 nextUint32() >>> 11 取高 21 位得到 u21 ∈ [0, 2097151]，
   * 再右移 5 位得 raw ∈ [0, 65535]，对应 Q16.16 的 [0, 1)。
   *
   * 注意：返回 Fixed 而非浮点，避免浮点参与逻辑判定。
   */
  next(): Fixed {
    const u21 = this.nextUint32() >>> 11; // 0..2097151
    return new Fixed(u21 >>> 5);           // 0..65535，对应 [0, 1)
  }

  /**
   * 返回 [0, range) 的整数（range > 0）
   * 用模运算，跨引擎一致（无浮点）。
   */
  nextInt(range: number): number {
    if (range <= 0) throw new Error('PRNG.nextInt range must be positive');
    return (this.nextUint32() % range) >>> 0;
  }

  /**
   * 返回 [minIncl, maxExcl) 的整数
   */
  range(minIncl: number, maxExcl: number): number {
    if (maxExcl <= minIncl) throw new Error('PRNG.range invalid range');
    return minIncl + this.nextInt(maxExcl - minIncl);
  }
}
