/**
 * 资源系统默认实现（spec implement-core-simulation T2 + PROJECT.md 3.2）
 *
 * 关键规则：
 * - 未消耗资源永久保留，跨 tick / 跨会话 / 跨存档都不丢失（不清零）
 * - 管控区（ResourceNode.occupied === true）产出减半
 * - 超过储备上限的部分丢弃（不保留溢出）
 *
 * 实现约定：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math，全部用 Fixed 运算
 * - 不依赖裸 number 参与逻辑判定（仅 level 等整数索引用 number）
 * - 遍历 SortedMap 用 forEach（保证 key 升序，跨引擎确定性）
 * - 节点所属国家判定：province.controllerId === countryId（管控方产出，非主权方）
 */
import { Fixed } from '../determinism/fixed';
import { ResourceStockpile, WorldState } from '../state/world_state';
import { ResourceType } from '../types';
import { ResourceSystem } from './interfaces';

/** 储备上限对象类型，与 ResourceStockpile['caps'] 同构 */
type Caps = ResourceStockpile['caps'];

/** history 保留的最大条数（对应 7 天 × 10 tick/秒的提示值，超出则 shift） */
const HISTORY_LIMIT = 70;

const FIXED_1000 = Fixed.fromInt(1000);
const FIXED_2 = Fixed.fromInt(2);
/** 仓储加成缓存：countryId → per-type bonus Fixed，storage 建筑变化时 invalidate */
const storageBonusCache = new Map<string, Fixed>();

/** 预计算 mine level 0-5 的 Fixed 值，避免每节点 Fixed.fromInt */
const MINE_LEVEL_FIXED: readonly Fixed[] = [
  Fixed.ZERO,
  Fixed.fromInt(1),
  Fixed.fromInt(2),
  Fixed.fromInt(3),
  Fixed.fromInt(4),
  Fixed.fromInt(5),
];

/**
 * 默认资源系统实现
 *
 * - yieldTick：遍历该国管控省份上的资源节点，按 baseYield × level × (dtMs/1000) 产出，
 *              管控区减半，累加到储备并按 caps 截断，记录 history。
 * - consume：扣减储备，不足返回 false。
 * - reserveCap：基础 caps + 该国 active 仓储建筑加成（每级 +100，不含政治点）。
 */
export class DefaultResourceSystem implements ResourceSystem {
  /**
   * countryId → 该国管控省份上的资源节点 id 列表。
   * 由 rebuildIndex 按需构建，yieldTick 直接遍历避免对所有 resourceNodes 做全表扫描。
   */
  private countryNodeIndex = new Map<string, number[]>();
  private nodeIndexValid = false;

  private rebuildIndex(state: WorldState): void {
    this.countryNodeIndex.clear();
    state.resourceNodes.forEach((node) => {
      const province = state.provinces.get(node.provinceId);
      if (!province) return;
      const cid = province.controllerId;
      let list = this.countryNodeIndex.get(cid);
      if (!list) {
        list = [];
        this.countryNodeIndex.set(cid, list);
      }
      list.push(node.id);
    });
    this.nodeIndexValid = true;
  }

  /**
   * 使资源节点索引失效：
   * - 不传 countryId：全量失效（下次 yieldTick 重建）
   * - 传 countryId：仅删除该国列表（下次该国 yieldTick 会走 rebuild 全量，M1 简化）
   */
  invalidateNodeIndex(countryId?: string): void {
    if (countryId) {
      this.countryNodeIndex.delete(countryId);
    } else {
      this.countryNodeIndex.clear();
      this.nodeIndexValid = false;
    }
  }

  /**
   * 单 tick 资源产出
   *
   * 步骤：
   * 1. 取该国储备 stockpile，不存在则直接返回
   * 2. 通过 this.reserveCap 取「基础 caps + 仓储加成」作为本 tick 截断上限
   * 3. 用 countryNodeIndex 直接定位该国管控资源节点（避免全表 forEach + controllerId 比较）
   * 4. 计算 produced = baseYield × level × (dtMs / 1000)；occupied 时除以 2
   * 5. 累加到 stockpile[type]，超过 caps[type] 则截断为 caps[type]
   * 6. history push { tick: state.tickId, delta: 本 tick 总产出（求和）}，超出 HISTORY_LIMIT 则 shift
   * 7. state.stockpiles.set(countryId, stockpile) 覆盖回写
   */
  yieldTick(state: WorldState, countryId: string, dtMs: Fixed): void {
    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return;

    if (!this.nodeIndexValid) this.rebuildIndex(state);
    const nodeIds = this.countryNodeIndex.get(countryId);

    // 取「基础 caps + 仓储加成」用于截断判断
    const caps = this.reserveCap(state, countryId);
    let totalDelta = Fixed.ZERO;
    let hasChange = false;

    if (nodeIds && nodeIds.length > 0) {
      for (let i = 0; i < nodeIds.length; i++) {
        const node = state.resourceNodes.get(nodeIds[i]);
        if (!node) continue;

        if (node.mineBuildingLevel <= 0) continue;

        const lvl = node.mineBuildingLevel;
        const levelFixed = lvl < MINE_LEVEL_FIXED.length ? MINE_LEVEL_FIXED[lvl] : Fixed.fromInt(lvl);
        let produced = node.baseYield.mul(levelFixed).mul(dtMs).div(FIXED_1000);

        if (node.occupied) {
          produced = produced.div(FIXED_2);
        }

        const current = this.getRes(stockpile, node.type);
        const cap = this.getCap(caps, node.type);
        const added = current.add(produced);
        const truncated = added.greaterThan(cap) ? cap : added;
        this.setRes(stockpile, node.type, truncated);
        hasChange = true;

        totalDelta = totalDelta.add(produced);
      }
    }

    // 记录本 tick 总产出，保留最近 HISTORY_LIMIT 条
    stockpile.history.push({ tick: state.tickId, delta: totalDelta });
    if (stockpile.history.length > HISTORY_LIMIT) {
      stockpile.history.shift();
    }

    if (hasChange) state.stockpiles.set(countryId, stockpile);
  }

  /**
   * 消耗资源
   *
   * 不足返回 false（不修改状态）；足够则扣减并返回 true。
   */
  consume(state: WorldState, countryId: string, type: ResourceType, amount: Fixed): boolean {
    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return false;

    const current = this.getRes(stockpile, type);
    if (current.lessThan(amount)) return false;

    this.setRes(stockpile, type, current.sub(amount));
    state.stockpiles.set(countryId, stockpile);
    return true;
  }

  /**
   * 使指定国家（或全部）的仓储加成缓存失效
   * 在 storage 建筑建成/移除时由 Simulation 调用
   */
  invalidateStorageCache(countryId?: string): void {
    if (countryId) {
      storageBonusCache.delete(countryId);
    } else {
      storageBonusCache.clear();
    }
  }

  /**
   * 储备上限（基础 caps + 仓储建筑加成，带缓存）
   * 无仓储加成时直接返回 stockpile.caps 引用，避免对象分配。
   */
  reserveCap(state: WorldState, countryId: string): Caps {
    let bonus = storageBonusCache.get(countryId);
    if (!bonus) {
      bonus = this.computeStorageBonus(state, countryId);
      storageBonusCache.set(countryId, bonus);
    }

    if (bonus.equals(Fixed.ZERO)) {
      const sp = state.stockpiles.get(countryId);
      return sp ? sp.caps : {
        steel: Fixed.ZERO, oil: Fixed.ZERO, tungsten: Fixed.ZERO,
        rubber: Fixed.ZERO, aluminum: Fixed.ZERO, political: Fixed.ZERO,
      };
    }

    const stockpile = state.stockpiles.get(countryId);
    const base = stockpile ? stockpile.caps : null;
    return {
      steel: (base ? base.steel : Fixed.ZERO).add(bonus),
      oil: (base ? base.oil : Fixed.ZERO).add(bonus),
      tungsten: (base ? base.tungsten : Fixed.ZERO).add(bonus),
      rubber: (base ? base.rubber : Fixed.ZERO).add(bonus),
      aluminum: (base ? base.aluminum : Fixed.ZERO).add(bonus),
      political: base ? base.political : Fixed.ZERO,
    };
  }

  /** 计算该国 storage 建筑带来的总加成（level × 100 累加，用 number 累加减少 Fixed 分配） */
  private computeStorageBonus(state: WorldState, countryId: string): Fixed {
    let total = 0;
    state.buildings.forEach((building) => {
      if (building.type !== 'storage') return;
      if (building.state !== 'active') return;
      const province = state.provinces.get(building.provinceId);
      if (!province) return;
      if (province.controllerId !== countryId) return;
      total += building.level * 100;
    });
    return total === 0 ? Fixed.ZERO : Fixed.fromInt(total);
  }

  /** 读取储备中指定资源类型的当前值 */
  private getRes(stockpile: ResourceStockpile, type: ResourceType): Fixed {
    switch (type) {
      case 'steel':
        return stockpile.steel;
      case 'oil':
        return stockpile.oil;
      case 'tungsten':
        return stockpile.tungsten;
      case 'rubber':
        return stockpile.rubber;
      case 'aluminum':
        return stockpile.aluminum;
      case 'political':
        return stockpile.political;
    }
  }

  /** 设置储备中指定资源类型的值 */
  private setRes(stockpile: ResourceStockpile, type: ResourceType, v: Fixed): void {
    switch (type) {
      case 'steel':
        stockpile.steel = v;
        break;
      case 'oil':
        stockpile.oil = v;
        break;
      case 'tungsten':
        stockpile.tungsten = v;
        break;
      case 'rubber':
        stockpile.rubber = v;
        break;
      case 'aluminum':
        stockpile.aluminum = v;
        break;
      case 'political':
        stockpile.political = v;
        break;
    }
  }

  /** 读取 caps 中指定资源类型的上限 */
  private getCap(caps: Caps, type: ResourceType): Fixed {
    switch (type) {
      case 'steel':
        return caps.steel;
      case 'oil':
        return caps.oil;
      case 'tungsten':
        return caps.tungsten;
      case 'rubber':
        return caps.rubber;
      case 'aluminum':
        return caps.aluminum;
      case 'political':
        return caps.political;
    }
  }
}
