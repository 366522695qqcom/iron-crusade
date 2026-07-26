/**
 * 确定性状态哈希
 *
 * 实现依据：spec implement-core-simulation T1 + 技术设计文档 C.3
 *
 * 用途：联机哈希一致性校验（技术设计文档 T.2.2）。各客户端独立模拟后对
 * WorldState 做序列化 + FNV-1a 32 位哈希，哈希一致即视为状态同步；
 * 不一致则触发回滚 / 状态恢复。
 *
 * 约定：
 * - core/ 内不使用 Math（ESLint 规则，仅 determinism/fixed.ts 在白名单），
 *   故 imul32 本地实现，不调用 Math.imul。
 * - 所有数值用位运算 + >>> 0 保证 uint32 语义，避免符号问题。
 * - 序列化顺序严格按 world_state.ts 中各接口字段声明顺序，跨引擎字节级一致。
 * - UTF-8 编码用 unescape(encodeURIComponent(s)) 兼容路径，不依赖 TextEncoder。
 */
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import {
  BuildingType,
  ResourceType,
  TerrainType,
  FactoryType,
  ProductionTaskType,
  BuildingState,
  FactoryState,
  DevelopmentPath,
} from '../types';
import {
  WorldState,
  Country,
  Province,
  ResourceNode,
  ResourceStockpile,
  Building,
  Factory,
  ConstructionQueue,
  ConstructionQueueItem,
  ProductionTask,
  EquipmentPool,
  Division,
  FocusTreeState,
  ResearchState,
  Dispute,
  Front,
  DivisionStatus,
} from './world_state';

/**
 * 本地实现 32 位整数乘法，等价 Math.imul，但不依赖 Math。
 *
 * 算法：标准 polyfill，拆高低 16 位相乘后合并。
 * - aLo * bLo 最大 65535 * 65535 < 2^32，Number 精确表示。
 * - (aHi * bLo + aLo * bHi) << 16 后 | 0 截断回 int32（wrap 语义与 C 一致）。
 * - 外层 | 0 再次截断为带符号 32 位，与 Math.imul 返回值语义一致。
 *
 * 注意：a / b 入参先 >>> 16 / & 0xffff 归一化为无符号 16 位，
 * 因此对入参的符号位不敏感（与 Math.imul 一致：Math.imul 把入参按 int32 解释，
 * 但拆位后 aHi = a >>> 16 已是无符号高位，结果正确）。
 */
export function imul32(a: number, b: number): number {
  const aHi = a >>> 16;
  const aLo = a & 0xffff;
  const bHi = b >>> 16;
  const bLo = b & 0xffff;
  return ((aLo * bLo) + (((aHi * bLo + aLo * bHi) << 16) | 0)) | 0;
}

/** 枚举字符串 → 序号映射（按 types.ts 声明顺序） */
const BUILDING_TYPE_INDEX: Record<BuildingType, number> = {
  civilian_factory: 0,
  military_factory: 1,
  dockyard: 2,
  infrastructure: 3,
  mine: 4,
  storage: 5,
  supply_hub: 6,
  fort: 7,
};

const RESOURCE_TYPE_INDEX: Record<ResourceType, number> = {
  steel: 0,
  oil: 1,
  tungsten: 2,
  rubber: 3,
  aluminum: 4,
  political: 5,
};

const TERRAIN_TYPE_INDEX: Record<TerrainType, number> = {
  plains: 0,
  mountain: 1,
  forest: 2,
  urban: 3,
  desert: 4,
  marsh: 5,
};

const FACTORY_TYPE_INDEX: Record<FactoryType, number> = {
  civilian: 0,
  military: 1,
  dockyard: 2,
};

const PRODUCTION_TASK_TYPE_INDEX: Record<ProductionTaskType, number> = {
  construction: 0,
  trade: 1,
  production: 2,
};

const BUILDING_STATE_INDEX: Record<BuildingState, number> = {
  planned: 0,
  constructing: 1,
  active: 2,
};

const FACTORY_STATE_INDEX: Record<FactoryState, number> = {
  idle: 0,
  working: 1,
  construction: 2,
};

const DEVELOPMENT_PATH_INDEX: Record<DevelopmentPath, number> = {
  industrial_authoritarian: 0,
  communal: 1,
  federal_republic: 2,
};

const DIVISION_STATUS_INDEX: Record<DivisionStatus, number> = {
  training: 0,
  ready: 1,
  fighting: 2,
  retreating: 3,
};

/**
 * 字节流写入器（P3.1 优化：可增长 Uint8Array + 增量 FNV-1a 哈希）。
 *
 * - 内部维护可扩容 Uint8Array（初始 4KB，不足时翻倍），避免 number[] 逐字节装箱
 *   以及最终 new Uint8Array(number[]) 的拷贝开销。
 * - 可选增量 FNV-1a 哈希：write 时直接更新 hash 状态，hashWorld 无需二次遍历。
 * - 所有数值方法用 & 0xFF + >>> 0 提取各字节，保证小端 + uint32 语义。
 * - P4.5：短字符串 UTF-8 字节缓存，消除每帧重复 encodeURIComponent 开销（国家/省份/焦点
 *   ID 等高频短字符串被序列化数百次/帧）。
 */

const ENCODED_STRING_CACHE = new Map<string, Uint8Array>();
const ENCODED_CACHE_MAX = 512;

function encodeCached(s: string): Uint8Array {
  const cached = ENCODED_STRING_CACHE.get(s);
  if (cached) return cached;
  const utf8 = unescape(encodeURIComponent(s));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    bytes[i] = utf8.charCodeAt(i) & 0xff;
  }
  if (ENCODED_STRING_CACHE.size >= ENCODED_CACHE_MAX) {
    const firstKey = ENCODED_STRING_CACHE.keys().next().value;
    if (firstKey !== undefined) ENCODED_STRING_CACHE.delete(firstKey);
  }
  ENCODED_STRING_CACHE.set(s, bytes);
  return bytes;
}

export class Encoder {
  private buf: Uint8Array;
  private pos = 0;
  private fnv: number | null = null;

  constructor(initialCap = 4096) {
    this.buf = new Uint8Array(initialCap);
  }

  /** 启用增量 FNV-1a 哈希（返回 this 链式调用） */
  withHash(): this {
    this.fnv = 0x811c9dc5;
    return this;
  }

  /** 获取当前 FNV-1a 哈希值（需先 withHash），返回 8 位 hex */
  finalizeHash(): string {
    let h = (this.fnv as number) >>> 0;
    let hex = h.toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  private ensure(n: number): void {
    const need = this.pos + n;
    if (need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
  }

  private writeByte(b: number): void {
    this.buf[this.pos++] = b;
    if (this.fnv !== null) {
      this.fnv = imul32(this.fnv ^ b, 0x01000193);
    }
  }

  i32(n: number): void {
    const v = n | 0;
    this.ensure(4);
    this.writeByte(v & 0xff);
    this.writeByte((v >>> 8) & 0xff);
    this.writeByte((v >>> 16) & 0xff);
    this.writeByte((v >>> 24) & 0xff);
  }

  u32(n: number): void {
    const v = n >>> 0;
    this.ensure(4);
    this.writeByte(v & 0xff);
    this.writeByte((v >>> 8) & 0xff);
    this.writeByte((v >>> 16) & 0xff);
    this.writeByte((v >>> 24) & 0xff);
  }

  u16(n: number): void {
    const v = n & 0xffff;
    this.ensure(2);
    this.writeByte(v & 0xff);
    this.writeByte((v >>> 8) & 0xff);
  }

  u8(n: number): void {
    this.ensure(1);
    this.writeByte(n & 0xff);
  }

  string(s: string): void {
    const bytes = encodeCached(s);
    this.u16(bytes.length);
    this.ensure(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.writeByte(bytes[i]);
    }
  }

  bool(b: boolean): void {
    this.u8(b ? 0x01 : 0x00);
  }

  nullable<T>(v: T | null | undefined, writeVal: (e: Encoder, v: T) => void): void {
    if (v === null || v === undefined) {
      this.u8(0xff);
    } else {
      this.u8(0x00);
      writeVal(this, v);
    }
  }

  fixed(f: Fixed): void {
    this.i32(f.raw);
  }

  /** 返回已写入字节的 Uint8Array 拷贝（不暴露内部 buffer） */
  bytes(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

/** number key 序列化：i32 */
function keyI32(e: Encoder, k: number): void {
  e.i32(k);
}

/** string key 序列化：string */
function keyStr(e: Encoder, k: string): void {
  e.string(k);
}

/**
 * SortedMap 序列化辅助：u32 size + forEach (key, value)。
 * key 为 number → i32；key 为 string → string（u16 + UTF8）。
 * SortedMap.forEach 已保证按 key 升序遍历，跨引擎一致。
 */
function serializeSortedMap<K extends string | number, V>(
  e: Encoder,
  m: SortedMap<K, V>,
  serializeKey: (e: Encoder, k: K) => void,
  serializeValue: (e: Encoder, v: V) => void,
): void {
  e.u32(m.size());
  m.forEach((v, k) => {
    serializeKey(e, k);
    serializeValue(e, v);
  });
}

/** Country 序列化（按 world_state.ts 接口字段顺序） */
function serializeCountry(e: Encoder, c: Country): void {
  e.string(c.id);
  e.string(c.name);
  e.u8(DEVELOPMENT_PATH_INDEX[c.developmentPath]);
  e.bool(c.isPlayer);
  e.bool(c.isAI);
  e.u16(c.capitalProvinceId);
  e.fixed(c.disputeResolve);
  e.fixed(c.stability);
  e.fixed(c.politicalPower);
  e.nullable(c.factionId, (enc, v) => enc.string(v));
  e.u32(c.ownedProvinceIds.length);
  for (const pid of c.ownedProvinceIds) e.u16(pid);
  e.u32(c.controlledProvinceIds.length);
  for (const pid of c.controlledProvinceIds) e.u16(pid);
}

/** Province 序列化 */
function serializeProvince(e: Encoder, p: Province): void {
  e.u16(p.id);
  e.string(p.ownerId);
  e.string(p.controllerId);
  e.string(p.name);
  e.u8(TERRAIN_TYPE_INDEX[p.terrain]);
  e.bool(p.isCoastal);
  e.u8(p.infrastructure);
  e.u8(p.buildingSlots);
  e.u8(p.combatWidth);
  e.u8(p.supplyHubLevel);
  e.u8(p.fortLevel);
  e.u16(p.VP);
}

/** ResourceNode 序列化 */
function serializeResourceNode(e: Encoder, r: ResourceNode): void {
  e.u32(r.id);
  e.u16(r.provinceId);
  e.u8(RESOURCE_TYPE_INDEX[r.type]);
  e.fixed(r.baseYield);
  e.u8(r.mineBuildingLevel);
  e.bool(r.occupied);
}

/** ResourceStockpile 序列化 */
function serializeStockpile(e: Encoder, s: ResourceStockpile): void {
  e.string(s.countryId);
  e.fixed(s.steel);
  e.fixed(s.oil);
  e.fixed(s.tungsten);
  e.fixed(s.rubber);
  e.fixed(s.aluminum);
  e.fixed(s.political);
  e.fixed(s.caps.steel);
  e.fixed(s.caps.oil);
  e.fixed(s.caps.tungsten);
  e.fixed(s.caps.rubber);
  e.fixed(s.caps.aluminum);
  e.fixed(s.caps.political);
  e.u32(s.history.length);
  for (const h of s.history) {
    e.i32(h.tick);
    e.fixed(h.delta);
  }
}

/** Building 序列化 */
function serializeBuilding(e: Encoder, b: Building): void {
  e.u32(b.id);
  e.u16(b.provinceId);
  e.u8(BUILDING_TYPE_INDEX[b.type]);
  e.u8(b.level);
  e.u8(BUILDING_STATE_INDEX[b.state]);
  e.fixed(b.constructionProgress);
  e.u8(b.assignedCivilianFactories);
}

/** Factory 序列化 */
function serializeFactory(e: Encoder, f: Factory): void {
  e.u16(f.id);
  e.u16(f.provinceId);
  e.u8(FACTORY_TYPE_INDEX[f.type]);
  e.u8(f.level);
  e.u8(FACTORY_STATE_INDEX[f.state]);
  e.nullable(f.taskId, (enc, v) => enc.string(v));
  e.i32(f.idleSinceTick);
  e.fixed(f.productionProgress);
}

/** ConstructionQueueItem 序列化 */
function serializeConstructionQueueItem(e: Encoder, it: ConstructionQueueItem): void {
  e.string(it.id);
  e.u8(BUILDING_TYPE_INDEX[it.buildingType]);
  e.u16(it.provinceId);
  e.u8(it.priority);
  e.fixed(it.steelCost);
  e.fixed(it.timeCost);
  e.u32(it.assignedFactoryIds.length);
  for (const fid of it.assignedFactoryIds) e.u16(fid);
  e.fixed(it.progress);
}

/** ConstructionQueue 序列化 */
function serializeConstructionQueue(e: Encoder, q: ConstructionQueue): void {
  e.string(q.countryId);
  e.u32(q.items.length);
  for (const it of q.items) serializeConstructionQueueItem(e, it);
}

/** ProductionTask 序列化 */
function serializeProductionTask(e: Encoder, t: ProductionTask): void {
  e.string(t.id);
  e.u8(PRODUCTION_TASK_TYPE_INDEX[t.type]);
  e.string(t.countryId);
  e.string(t.target);
  e.u32(t.assignedFactoryIds.length);
  for (const fid of t.assignedFactoryIds) e.u16(fid);
  e.u8(t.priority);
  e.fixed(t.progress);
  e.fixed(t.efficiency);
}

/** EquipmentPool 序列化 */
function serializeEquipmentPool(e: Encoder, p: EquipmentPool): void {
  e.string(p.countryId);
  e.u32(p.stocks.length);
  for (const s of p.stocks) {
    e.string(s.type);
    e.i32(s.count);
  }
}

/** Division 序列化 */
function serializeDivision(e: Encoder, d: Division): void {
  e.u32(d.id);
  e.string(d.ownerId);
  e.u32(d.template.length);
  for (const slot of d.template) {
    e.u8(slot.slot);
    e.string(slot.equipmentType);
  }
  e.fixed(d.organization);
  e.fixed(d.hardness);
  e.fixed(d.softAttack);
  e.fixed(d.hardAttack);
  e.u16(d.currentProvinceId);
  e.nullable(d.targetProvinceId, (enc, v) => enc.u16(v));
  e.fixed(d.supply);
  e.fixed(d.strength);
  e.fixed(d.trainingProgress);
  e.u8(DIVISION_STATUS_INDEX[d.status]);
  e.bool(d.inOffensive);
}

/** Front 序列化 */
function serializeFront(e: Encoder, f: Front): void {
  e.string(f.attackerId);
  e.string(f.defenderId);
  e.u16(f.fromProvince);
  e.u16(f.toProvince);
}

/** Front[] 序列化 */
function serializeFrontArray(e: Encoder, fronts: Front[]): void {
  e.u32(fronts.length);
  for (const f of fronts) serializeFront(e, f);
}

/** FocusTreeState 序列化 */
function serializeFocusTreeState(e: Encoder, f: FocusTreeState): void {
  e.string(f.countryId);
  e.u32(f.completedFocusIds.length);
  for (const id of f.completedFocusIds) e.string(id);
  e.nullable(f.activeFocusId, (enc, v) => enc.string(v));
  e.fixed(f.activeProgress);
  e.u32(f.candidates.length);
  for (const id of f.candidates) e.string(id);
  e.i32(f.refreshInTicks);
}

/** ResearchState 序列化 */
function serializeResearchState(e: Encoder, r: ResearchState): void {
  e.string(r.countryId);
  e.u32(r.lines.length);
  for (const line of r.lines) {
    e.string(line.lineId);
    e.string(line.currentNode);
    e.fixed(line.progress);
    e.u8(line.assignedSlot);
  }
}

/**
 * Dispute 序列化（spec S.2 脱敏：原 War 接口）。
 *
 * disputeResolve / controlledVPs 是普通对象，按 Object.entries 序列化。
 * 为跨引擎一致，先 Object.keys().sort() 升序再写。
 */
function serializeDispute(e: Encoder, d: Dispute): void {
  e.string(d.id);
  e.u32(d.participants.length);
  for (const p of d.participants) e.string(p);
  // disputeResolve: Record<string, Fixed>，按 key 升序
  const resolveKeys = Object.keys(d.disputeResolve).sort();
  e.u32(resolveKeys.length);
  for (const k of resolveKeys) {
    e.string(k);
    e.fixed(d.disputeResolve[k]);
  }
  e.u32(d.disputeGoals.length);
  for (const g of d.disputeGoals) e.string(g);
  // controlledVPs: Record<string, number>，按 key 升序
  const vpKeys = Object.keys(d.controlledVPs).sort();
  e.u32(vpKeys.length);
  for (const k of vpKeys) {
    e.string(k);
    e.i32(d.controlledVPs[k]);
  }
}

/**
 * seedMap 序列化（普通对象，非 SortedMap）。
 * 用 Object.keys().sort() 升序：u32 count + 每项 {key string, value i32}。
 */
function serializeSeedMap(e: Encoder, seedMap: Record<string, number>): void {
  const keys = Object.keys(seedMap).sort();
  e.u32(keys.length);
  for (const k of keys) {
    e.string(k);
    e.i32(seedMap[k]);
  }
}

/**
 * 序列化整个 WorldState，字节顺序严格按 world_state.ts 接口字段声明。
 *
 * 注意：技术设计文档 C.3.2 用了旧字段名 wars/ideology，以实际 world_state.ts 为准
 * （此处用 disputes / developmentPath / disputeResolve）。
 */
export function serializeWorld(s: WorldState): Uint8Array {
  const e = new Encoder();
  e.string(s.version);
  e.i32(s.seed);
  e.i32(s.tickId);
  e.i32(s.tickElapsed.raw);
  e.u8(s.speed);
  serializeSortedMap(e, s.countries, keyStr, serializeCountry);
  serializeSortedMap(e, s.provinces, keyI32, serializeProvince);
  serializeSortedMap(e, s.resourceNodes, keyI32, serializeResourceNode);
  serializeSortedMap(e, s.stockpiles, keyStr, serializeStockpile);
  serializeSortedMap(e, s.buildings, keyI32, serializeBuilding);
  serializeSortedMap(e, s.factories, keyI32, serializeFactory);
  serializeSortedMap(e, s.constructionQueues, keyStr, serializeConstructionQueue);
  serializeSortedMap(e, s.productionTasks, keyStr, serializeProductionTask);
  serializeSortedMap(e, s.equipmentPools, keyStr, serializeEquipmentPool);
  serializeSortedMap(e, s.divisions, keyI32, serializeDivision);
  serializeSortedMap(e, s.focusTrees, keyStr, serializeFocusTreeState);
  serializeSortedMap(e, s.research, keyStr, serializeResearchState);
  serializeSortedMap(e, s.disputes, keyStr, serializeDispute);
  serializeSortedMap(e, s.fronts, keyStr, serializeFrontArray);
  e.i32(s.nextEntityId);
  serializeSeedMap(e, s.seedMap);
  return e.bytes();
}

/**
 * FNV-1a 32 位哈希：返回 8 位 hex 字符串。
 *
 * 使用 Encoder 增量哈希（P3.1）：序列化写入时直接更新哈希状态，
 * 无需先生成 Uint8Array 再二次遍历，节省一次完整内存遍历 + 中间数组分配。
 */
export function hashWorld(s: WorldState): string {
  const e = new Encoder(8192).withHash();
  e.string(s.version);
  e.i32(s.seed);
  e.i32(s.tickId);
  e.i32(s.tickElapsed.raw);
  e.u8(s.speed);
  serializeSortedMap(e, s.countries, keyStr, serializeCountry);
  serializeSortedMap(e, s.provinces, keyI32, serializeProvince);
  serializeSortedMap(e, s.resourceNodes, keyI32, serializeResourceNode);
  serializeSortedMap(e, s.stockpiles, keyStr, serializeStockpile);
  serializeSortedMap(e, s.buildings, keyI32, serializeBuilding);
  serializeSortedMap(e, s.factories, keyI32, serializeFactory);
  serializeSortedMap(e, s.constructionQueues, keyStr, serializeConstructionQueue);
  serializeSortedMap(e, s.productionTasks, keyStr, serializeProductionTask);
  serializeSortedMap(e, s.equipmentPools, keyStr, serializeEquipmentPool);
  serializeSortedMap(e, s.divisions, keyI32, serializeDivision);
  serializeSortedMap(e, s.focusTrees, keyStr, serializeFocusTreeState);
  serializeSortedMap(e, s.research, keyStr, serializeResearchState);
  serializeSortedMap(e, s.disputes, keyStr, serializeDispute);
  serializeSortedMap(e, s.fronts, keyStr, serializeFrontArray);
  e.i32(s.nextEntityId);
  serializeSeedMap(e, s.seedMap);
  return e.finalizeHash();
}
