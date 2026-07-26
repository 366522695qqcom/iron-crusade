/**
 * 定点数 Q16.16
 *
 * 实现依据：技术设计文档 2.1 + 附录 C.1
 *
 * - 表示：int32，高 16 位整数 + 低 16 位小数
 * - 范围：[-32768, 32767.99998]
 * - 精度：1/65536 ≈ 1.5e-5
 * - 所有数值字段统一用 Fixed，禁止裸 number 参与逻辑判定（ESLint 拦截，附录 C.1.5）
 * - 浮点仅允许在渲染层用于显示（如把 Fixed.toNumber() 喂给 Cocos 节点）
 *
 * mul/div 用拆高低位模拟 Int64，避免 JS 整型位运算溢出（详见附录 C.1.2 / C.1.3）。
 *
 * 单测边界提示（详见附录 C.1.4）：
 * - mul 大数 ±32767 × ±32767：必须用拆位实现，直接 raw*raw 会丢精度
 * - mul 负数：-6 * 7 = -42 / -6 * -7 = 42
 * - div 零：抛 'Fixed.div by zero'
 * - 跨引擎一致性：同 raw + 同操作序列，V8 / JSC / SpiderMonkey 必须位级相等
 *
 * 确定性约束：
 * - 本文件是 core/ 内唯一允许使用 Math.* 白名单函数的文件
 *   （Math.round / Math.floor / Math.trunc，附录 C.1.5）
 * - core/ 其余文件禁止裸 number 参与逻辑判定，禁止 Math.random
 */
export class Fixed {
  /** 1.0 的 raw 值（内部使用，外部请用 Fixed.ONE） */
  static readonly ONE_RAW = 65536;
  /** 1.0 的 Fixed 常量 */
  static readonly ONE: Fixed = new Fixed(65536);
  /** 0.5（1/2）常量 */
  static readonly HALF: Fixed = new Fixed(32768);
  /** 0.25（1/4）常量 */
  static readonly QUARTER: Fixed = new Fixed(16384);
  /** 0.75（3/4）常量 */
  static readonly THREE_QUARTERS: Fixed = new Fixed(49152);
  /** 0.1（1/10）常量 */
  static readonly TENTH: Fixed = new Fixed(6554);
  /** 最小精度单位（raw = 1） */
  static readonly EPS: Fixed = new Fixed(1);
  /** 0 的常量 */
  static readonly ZERO: Fixed = new Fixed(0);
  /** Q16.16 最大值（≈ 32767.99998） */
  static readonly MAX: Fixed = new Fixed(0x7fffffff);
  /** Q16.16 最小值（-32768） */
  static readonly MIN: Fixed = new Fixed(0x80000000 | 0);

  /** raw 为 int32 内部表示，外部不应直接读写 */
  constructor(public raw: number) {}

  /** 整数 → Fixed */
  static fromInt(n: number): Fixed {
    return new Fixed((n << 16) | 0);
  }

  /** 浮点 → Fixed（仅 Fixed 内部允许 Math.round） */
  static fromNumber(n: number): Fixed {
    return new Fixed(Math.round(n * Fixed.ONE_RAW) | 0);
  }

  /** Fixed → 浮点（仅渲染层使用，core 内禁止参与逻辑判定） */
  toNumber(): number {
    return this.raw / Fixed.ONE_RAW;
  }

  /** Fixed → 整数（向零截断） */
  toInt(): number {
    return Math.trunc(this.raw / Fixed.ONE_RAW);
  }

  /** 加法：int32 加法后 | 0 截断回 int32（溢出 wrap，确定性） */
  add(b: Fixed): Fixed {
    return new Fixed((this.raw + b.raw) | 0);
  }

  /** 减法 */
  sub(b: Fixed): Fixed {
    return new Fixed((this.raw - b.raw) | 0);
  }

  /**
   * 乘法（Int64 模拟，附录 C.1.2）：
   *
   * 拆成带符号高 16 位 + 无符号低 16 位，四项乘积均 < 2^32 < 2^53，
   * Number 可精确表示，求和 < 2^34 < 2^53，保证跨引擎一致。
   *
   * 正确性：
   *   a = aHi·2^16 + aLo，b = bHi·2^16 + bLo
   *   a·b = aHi·bHi·2^32 + (aHi·bLo + aLo·bHi)·2^16 + aLo·bLo
   *   (a·b) >> 16 = aHi·bHi·2^16 + (aHi·bLo + aLo·bHi) + floor(aLo·bLo / 2^16)
   *
   * 边界提示：±32767 × ±32767 必须通过拆位实现，绝不能用 a.raw * b.raw。
   */
  mul(b: Fixed): Fixed {
    const a = this.raw;
    const bb = b.raw;
    const aHi = a >> 16;       // -32768..32767（带符号）
    const aLo = a & 0xffff;    // 0..65535（无符号）
    const bHi = bb >> 16;
    const bLo = bb & 0xffff;
    const p0 = aLo * bLo;      // 无符号
    const p1 = aLo * bHi;      // 带符号
    const p2 = aHi * bLo;      // 带符号
    const p3 = aHi * bHi;      // 带符号
    // Q16.16 结果 = (a × b) >> 16 = p3 << 16 + p2 + p1 + floor(p0 / 2^16)
    const result = (p3 * 65536) + p2 + p1 + Math.floor(p0 / 65536);
    return new Fixed(result | 0);
  }

  /**
   * 除法（Int64 模拟，附录 C.1.3）：
   *
   * dividend = a.raw * 2^16，最大 2^31 × 2^16 = 2^47 < 2^53，Number 精确。
   * Math.trunc 保证向零截断（与 C 整型除法一致），跨引擎行为统一。
   *
   * 边界提示：除零抛 'Fixed.div by zero'。
   */
  div(b: Fixed): Fixed {
    if (b.raw === 0) throw new Error('Fixed.div by zero');
    const dividend = this.raw * 65536;
    const result = Math.trunc(dividend / b.raw);
    return new Fixed(result | 0);
  }

  /** 三态比较：-1 / 0 / 1 */
  cmp(b: Fixed): number {
    if (this.raw < b.raw) return -1;
    if (this.raw > b.raw) return 1;
    return 0;
  }

  equals(b: Fixed): boolean { return this.raw === b.raw; }
  greaterThan(b: Fixed): boolean { return this.raw > b.raw; }
  greaterOrEqual(b: Fixed): boolean { return this.raw >= b.raw; }
  lessThan(b: Fixed): boolean { return this.raw < b.raw; }
  lessOrEqual(b: Fixed): boolean { return this.raw <= b.raw; }

  min(b: Fixed): Fixed { return this.raw <= b.raw ? this : b; }
  max(b: Fixed): Fixed { return this.raw >= b.raw ? this : b; }

  /** 取负 */
  neg(): Fixed { return new Fixed((-this.raw) | 0); }

  /** 取绝对值 */
  abs(): Fixed { return this.raw < 0 ? this.neg() : this; }
}
