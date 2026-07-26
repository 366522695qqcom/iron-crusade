/**
 * 焦点树系统默认实现（spec implement-focus-research T1 + PROJECT.md 3.5）
 *
 * 实现依据：
 * - spec implement-focus-research T1（.trae/specs/implement-focus-research/spec.md / tasks.md）
 * - PROJECT.md 3.5 国家焦点树
 *
 * 职责：
 * - refreshCandidates：按 developmentPath + prerequisites 过滤可选项，用国家专属 PRNG 选 ≤3 个候选
 * - pickFocus：扣政治点、设 activeFocusId、activeProgress=0、refreshInTicks=0（暂停刷新直到完成）
 * - advanceTick：推进 activeProgress；完成时 applyEffect + completedFocusIds.push + 发 focusCompleted 事件
 * - applyEffect：落地 effect（数值直接改 country；buff / research_bonus / political_power_per_day 暂存 module-level 缓存）
 * - getBuff / getPoliticalPowerPerDay：查询 buff 缓存，供 Simulation / FactorySystem / ResearchSystem 用
 *
 * 实现约定（严格遵守）：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math（ESLint 拦截，仅 fixed.ts 白名单允许 Math.round / floor / trunc）
 * - 数值用 Fixed（禁止裸 number 参与逻辑判定；仅 cost / prerequisites 数组索引用 number）
 * - 遍历 SortedMap 用 forEach（保证 key 升序，跨引擎确定性）
 * - 不修改 world_state.ts（FocusTreeState 数据模型不动）
 * - 不修改 focus_tree_iron_cross.json（只读取 schema 内联到 DEFAULT_FOCUS_CONFIGS）
 * - 不修改 interfaces.ts（T3 已定义接口，直接实现）
 * - 焦点配置以 module-level 内联常量提供（避免 Cocos 资源管线 json import 问题），
 *   可通过 setConfig 注入自定义配置（测试 / 模组用）
 */
import { Fixed } from '../determinism/fixed';
import { PRNG } from '../determinism/prng';
import { WorldState } from '../state/world_state';
import { GameEvent } from './types';
import { FocusSystem, Focus, FocusEffect } from './interfaces';

/** 焦点配置：countryId → Focus[] */
type FocusConfigMap = Record<string, Focus[]>;

/**
 * 默认焦点配置（内联，对应 configs/focus_tree_iron_cross.json schema）。
 *
 * 加载时把 JSON number value 转为 Fixed（用 Fixed.fromNumber）。
 * 此处保留与 configs/focus_tree_iron_cross.json 一致的 7 个焦点：
 * - industrial_base / iron_authoritarian_branch / armor_doctrine
 * - communal_branch / mass_industry
 * - federal_republic_branch / global_supply
 *
 * 三条发展路线（工业集权 / 公社共治 / 联邦共和）各对应一条独立焦点分支，
 * industrial_base 为通用起点（requiresDevelopmentPath = null）。
 */
const DEFAULT_FOCUS_CONFIGS: FocusConfigMap = {
  iron_cross: [
    {
      id: 'industrial_base',
      name: '工业基础',
      cost: 25,
      prerequisites: [],
      requiresDevelopmentPath: null,
      effects: [
        { type: 'buff', target: 'civilian_factory_speed', value: Fixed.fromNumber(0.1) },
      ],
    },
    {
      id: 'iron_authoritarian_branch',
      name: '工业集权主线',
      cost: 50,
      prerequisites: ['industrial_base'],
      requiresDevelopmentPath: 'industrial_authoritarian',
      effects: [
        { type: 'buff', target: 'military_factory_speed', value: Fixed.fromNumber(0.2) },
        { type: 'political_power_per_day', value: Fixed.fromNumber(0.5) },
      ],
    },
    {
      id: 'armor_doctrine',
      name: '装甲突击学说',
      cost: 75,
      prerequisites: ['iron_authoritarian_branch'],
      requiresDevelopmentPath: 'industrial_authoritarian',
      effects: [
        { type: 'research_bonus', target: 'armor', value: Fixed.fromNumber(0.15) },
      ],
    },
    {
      id: 'communal_branch',
      name: '公社共治主线',
      cost: 50,
      prerequisites: ['industrial_base'],
      requiresDevelopmentPath: 'communal',
      effects: [
        { type: 'buff', target: 'production_efficiency_cap', value: Fixed.fromNumber(0.1) },
        { type: 'stability', value: Fixed.fromNumber(0.05) },
      ],
    },
    {
      id: 'mass_industry',
      name: '大工业纵深',
      cost: 75,
      prerequisites: ['communal_branch'],
      requiresDevelopmentPath: 'communal',
      effects: [
        { type: 'buff', target: 'factory_output', value: Fixed.fromNumber(0.15) },
      ],
    },
    {
      id: 'federal_republic_branch',
      name: '联邦共和主线',
      cost: 50,
      prerequisites: ['industrial_base'],
      requiresDevelopmentPath: 'federal_republic',
      effects: [
        { type: 'buff', target: 'trade_efficiency', value: Fixed.fromNumber(0.2) },
        { type: 'political_power_per_day', value: Fixed.fromNumber(0.3) },
      ],
    },
    {
      id: 'global_supply',
      name: '全球补给网络',
      cost: 75,
      prerequisites: ['federal_republic_branch'],
      requiresDevelopmentPath: 'federal_republic',
      effects: [
        { type: 'buff', target: 'supply_range', value: Fixed.fromNumber(0.25) },
      ],
    },
  ],
};

/**
 * buff 缓存：countryId → target → 累计 Fixed value（module-level，跨 tick 保留）。
 *
 * 设计折中（spec implement-focus-research T1）：
 * - world_state.ts 不改（FocusTreeState 数据模型不动），故 buff 不存入 WorldState
 * - buff 暂存到 module-level Map，FocusSystem 内部维护，对外暴露 getBuff 查询接口
 * - political_power_per_day / buff / research_bonus 三类 effect 都走此缓存
 * - target 约定：
 *   - 'political_power_per_day'：每日政治点产出加成
 *   - 'research_' + lineId：科研线加成（如 'research_armor'）
 *   - 其他 buff target 原样保留（如 'civilian_factory_speed' / 'trade_efficiency'）
 */
const buffCache: Map<string, Map<string, Fixed>> = new Map();

const FIXED_60000 = Fixed.fromInt(60000);

/**
 * 默认焦点系统实现
 *
 * 串联 refreshCandidates → pickFocus → advanceTick → applyEffect 闭环，
 * 提供 getBuff / getPoliticalPowerPerDay 查询接口供其他子系统消费。
 */
export class DefaultFocusSystem implements FocusSystem {
  /** 焦点配置（默认用 DEFAULT_FOCUS_CONFIGS，可由 setConfig 覆盖） */
  private focusConfigs: FocusConfigMap = DEFAULT_FOCUS_CONFIGS;

  /** 注入自定义配置（测试 / 模组用）；默认用 DEFAULT_FOCUS_CONFIGS */
  setConfig(configs: FocusConfigMap): void {
    this.focusConfigs = configs;
  }

  /**
   * 刷新三选一候选焦点
   *
   * 步骤：
   * 1. 取 state.focusTrees.get(countryId)，不存在则 return
   * 2. 取 country = state.countries.get(countryId)，不存在则 return（无法按 developmentPath 过滤）
   * 3. 加载该国焦点配置（focusConfigs[countryId]），逐个过滤：
   *    - 排除已在 completedFocusIds 中的焦点
   *    - requiresDevelopmentPath 非 null 时必须等于 country.developmentPath
   *    - prerequisites 中所有焦点 ID 必须在 completedFocusIds 中
   * 4. 用国家专属 PRNG 选 ≤3 个候选：
   *    - seed 取 state.seedMap['focus_' + countryId]；不存在则用 state.seed + countryId 哈希派生
   *    - 从可选项数组中确定性选 min(3, 可选数) 个（用 prng.range(0, n) 选索引，取出后从剩余中继续选，保证不重复）
   * 5. 写入 focusTree.candidates，写回 state.focusTrees
   */
  refreshCandidates(state: WorldState, countryId: string): void {
    const focusTree = state.focusTrees.get(countryId);
    if (!focusTree) return;

    const country = state.countries.get(countryId);
    if (!country) return;

    const allFocuses = this.focusConfigs[countryId] ?? [];

    // 构建已完成焦点 Set，避免每个焦点重复 indexOf 线性查找（P2.7）
    const completedSet = new Set(focusTree.completedFocusIds);

    // 过滤可选项
    const eligible: Focus[] = [];
    for (const focus of allFocuses) {
      if (completedSet.has(focus.id)) continue;
      if (
        focus.requiresDevelopmentPath !== null &&
        focus.requiresDevelopmentPath !== country.developmentPath
      ) {
        continue;
      }
      let prereqOk = true;
      for (const p of focus.prerequisites) {
        if (!completedSet.has(p)) {
          prereqOk = false;
          break;
        }
      }
      if (!prereqOk) continue;
      eligible.push(focus);
    }

    // 用国家专属 PRNG 选 ≤3 个候选
    let seed = state.seedMap['focus_' + countryId];
    if (seed === undefined) {
      // 不存在则用 state.seed + countryId 字符串哈希派生
      // state.seed + countryId 触发 JS 字符串拼接（number + string → string）
      seed = this.hashString(state.seed + countryId);
    }
    const prng = new PRNG(seed);

    // 从可选项数组中确定性选 min(3, 可选数) 个（不重复）
    const remaining = eligible.slice();
    const candidates: string[] = [];
    const pickCount = eligible.length < 3 ? eligible.length : 3;
    for (let i = 0; i < pickCount; i++) {
      const idx = prng.range(0, remaining.length);
      candidates.push(remaining[idx].id);
      remaining.splice(idx, 1);
    }

    focusTree.candidates = candidates;
    state.focusTrees.set(countryId, focusTree);
  }

  /**
   * 选择焦点
   *
   * 校验链（任一失败返回 false，不修改状态）：
   * 1. focusTree 存在
   * 2. focusId 在 focusTree.candidates 中
   * 3. focus 配置存在（findFocus）
   * 4. stockpile 存在
   * 5. 政治点 >= focus.cost
   *
   * 校验通过后：
   * - 扣政治点：stockpile.political -= Fixed.fromInt(focus.cost)
   * - 设 focusTree.activeFocusId = focusId
   * - 设 focusTree.activeProgress = Fixed.ZERO
   * - 设 focusTree.refreshInTicks = 0（暂停刷新直到完成）
   * - 写回 stockpile 和 focusTree
   */
  pickFocus(state: WorldState, countryId: string, focusId: string): boolean {
    const focusTree = state.focusTrees.get(countryId);
    if (!focusTree) return false;
    // 校验 focusId 在 candidates 中
    if (focusTree.candidates.indexOf(focusId) < 0) return false;

    const focus = this.findFocus(countryId, focusId);
    if (!focus) return false;

    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return false;

    // 校验政治点足够（不足返回 false，不修改状态）
    const cost = Fixed.fromInt(focus.cost);
    if (stockpile.political.lessThan(cost)) return false;

    // 扣政治点
    stockpile.political = stockpile.political.sub(cost);
    focusTree.activeFocusId = focusId;
    focusTree.activeProgress = Fixed.ZERO;
    focusTree.refreshInTicks = 0; // 暂停刷新直到完成

    state.stockpiles.set(countryId, stockpile);
    state.focusTrees.set(countryId, focusTree);
    return true;
  }

  /**
   * 推进单 tick 焦点
   *
   * 流程：
   * - 取 focusTree = state.focusTrees.get(countryId)，无则 return []
   * - 若 activeFocusId 非空：
   *   - 取焦点配置 focus = findFocus(countryId, activeFocusId)
   *   - 推进进度：activeProgress += dtMs / (60000 × cost)（60s 基准，cost 越高越慢）
   *   - 若 activeProgress >= Fixed.ONE：
   *     - 对 focus.effects 每个调用 applyEffect
   *     - completedFocusIds.push(focus.id)
   *     - activeFocusId = null / activeProgress = Fixed.ZERO
   *     - refreshInTicks = 600（60s 后刷新候选）
   *     - events.push({ kind: 'focusCompleted', countryId, focusId: focus.id })
   * - 否则（activeFocusId 为空）：
   *   - refreshInTicks -= 1
   *   - 若 refreshInTicks <= 0：调用 refreshCandidates 并重置 refreshInTicks = 600
   * - 写回 state.focusTrees
   *
   * @returns 本 tick 产生的 GameEvent 列表（focusCompleted）
   */
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[] {
    const focusTree = state.focusTrees.get(countryId);
    if (!focusTree) return [];

    const events: GameEvent[] = [];

    if (focusTree.activeFocusId !== null) {
      const focus = this.findFocus(countryId, focusTree.activeFocusId);
      if (focus) {
        // 推进进度：progress += dtMs / (60000 × cost)（60s 基准，cost 越高越慢）
        const denom = FIXED_60000.mul(Fixed.fromInt(focus.cost));
        focusTree.activeProgress = focusTree.activeProgress.add(dtMs.div(denom));

        // 完成判定：activeProgress >= 1（Fixed.ONE 是 Fixed 实例，类型匹配 greaterOrEqual）
        if (focusTree.activeProgress.greaterOrEqual(Fixed.ONE)) {
          // 落地所有 effects
          for (const effect of focus.effects) {
            this.applyEffect(state, countryId, effect);
          }
          focusTree.completedFocusIds.push(focus.id);
          focusTree.activeFocusId = null;
          focusTree.activeProgress = Fixed.ZERO;
          focusTree.refreshInTicks = 600; // 60s 后刷新候选
          events.push({ kind: 'focusCompleted', countryId, focusId: focus.id });
        }
      }
    } else {
      // activeFocusId 为空：推进刷新计时
      focusTree.refreshInTicks -= 1;
      if (focusTree.refreshInTicks <= 0) {
        this.refreshCandidates(state, countryId);
        focusTree.refreshInTicks = 600;
      }
    }

    state.focusTrees.set(countryId, focusTree);
    return events;
  }

  /**
   * 落地单个焦点效果
   *
   * 按 effect.type 分支：
   * - political_power_per_day：addBuff(countryId, 'political_power_per_day', value)
   * - stability：country.stability = clamp(country.stability + value, 0, 1)
   * - disputeResolve：country.disputeResolve = clamp(country.disputeResolve + value, 0, 1)
   * - buff：addBuff(countryId, target ?? '', value)
   * - research_bonus：addBuff(countryId, 'research_' + (target ?? ''), value)
   *
   * 仅当 stability / disputeResolve 修改了 country 时写回 state.countries。
   */
  applyEffect(state: WorldState, countryId: string, effect: FocusEffect): void {
    const country = state.countries.get(countryId);
    if (!country) return;

    let modifiedCountry = false;
    switch (effect.type) {
      case 'political_power_per_day':
        this.addBuff(countryId, 'political_power_per_day', effect.value);
        break;
      case 'stability':
        country.stability = this.clampFixed(
          country.stability.add(effect.value),
          Fixed.ZERO,
          Fixed.ONE,
        );
        modifiedCountry = true;
        break;
      case 'disputeResolve':
        country.disputeResolve = this.clampFixed(
          country.disputeResolve.add(effect.value),
          Fixed.ZERO,
          Fixed.ONE,
        );
        modifiedCountry = true;
        break;
      case 'buff':
        this.addBuff(countryId, effect.target ?? '', effect.value);
        break;
      case 'research_bonus':
        this.addBuff(countryId, 'research_' + (effect.target ?? ''), effect.value);
        break;
    }

    // 仅当修改了 country 时写回
    if (modifiedCountry) {
      state.countries.set(countryId, country);
    }
  }

  /** 查询某 buff target 的累计 value（含 research_bonus，target='research_'+lineId）；不存在返回 Fixed.ZERO */
  getBuff(countryId: string, target: string): Fixed {
    const inner = buffCache.get(countryId);
    if (!inner) return Fixed.ZERO;
    const v = inner.get(target);
    if (!v) return Fixed.ZERO;
    return v;
  }

  /**
   * 查询每日政治点产出
   *
   * - base rate = Fixed.fromInt(1)（每日 1 政治点基准）
   * - 加上 getBuff(countryId, 'political_power_per_day') 累计加成
   * - 返回 base.add(buff)
   */
  getPoliticalPowerPerDay(countryId: string): Fixed {
    const base = Fixed.ONE;
    const buff = this.getBuff(countryId, 'political_power_per_day');
    return base.add(buff);
  }

  // ----- 私有辅助方法 -----

  /** 从 focusConfigs 查找指定焦点；找不到返回 null */
  private findFocus(countryId: string, focusId: string): Focus | null {
    const list = this.focusConfigs[countryId];
    if (!list) return null;
    for (const f of list) {
      if (f.id === focusId) return f;
    }
    return null;
  }

  /** 累加 buff 到 module-level 缓存（countryId → target → 累计 Fixed value） */
  private addBuff(countryId: string, target: string, value: Fixed): void {
    let inner = buffCache.get(countryId);
    if (!inner) {
      inner = new Map();
      buffCache.set(countryId, inner);
    }
    const cur = inner.get(target);
    inner.set(target, cur ? cur.add(value) : value);
  }

  /** clamp 工具：val < min 返回 min；val > max 返回 max；否则返回 val */
  private clampFixed(val: Fixed, min: Fixed, max: Fixed): Fixed {
    if (val.lessThan(min)) return min;
    if (val.greaterThan(max)) return max;
    return val;
  }

  /**
   * 简单字符串哈希（djb2 变体，不用 Math，仅用位运算 + 算术）。
   *
   * 公式：h = ((h << 5) + h) + charCode，等价于 h = h * 33 + charCode。
   * 每次 | 0 截断回 int32，保证跨引擎一致。
   * 返回 int32（PRNG 构造时 >>> 0 兜底转 uint32，避免全 0 状态）。
   */
  private hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      // (h << 5) + h 等价于 h * 33（位运算 + 加法，无 Math）
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return h | 0;
  }
}
