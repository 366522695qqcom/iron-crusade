# Tasks（optimize-performance）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **回归红线**：每个任务完成后必须运行 `npx tsc --noEmit`（零错误）+ `npx vitest run`（全过）。确定性测试是所有优化的安全网。

**Goal:** 在不破坏确定性的前提下，消除 31 个性能热点（原 8 个 + 第二轮新增 12 个 + 第三轮新增 11 个），使中端安卓机 FPS≥50、运行时内存<150MB。

**Architecture:** 分 4 批渐进优化，每批独立可验证。P1 常量提升+遍历合并+缓存+引用复用，P2 脏标记+SortedMap 优化+索引，P3 序列化重写+对象池+环形缓冲，P4 按需收尾。

**Tech Stack:** TypeScript + Cocos Creator 3.8 + vitest 1.6.1

---

## P1.1 Fixed 常量提升

**Files:**
- Modify: `src/core/simulation/simulation.ts`
- Modify: `src/core/simulation/resource_system.ts`
- Modify: `src/core/simulation/building_system.ts`
- Modify: `src/core/simulation/factory_system.ts`
- Modify: `src/core/simulation/focus_system.ts`
- Modify: `src/core/simulation/research_system.ts`

- [ ] **Step 1: simulation.ts 提升常量**

在 `simulation.ts` 顶部 import 后添加模块级常量：

```typescript
const FIXED_100 = Fixed.fromInt(100);
const FIXED_864 = Fixed.fromInt(864);
const FIXED_1000 = Fixed.fromInt(1000);
```

替换 tick 方法内的 `Fixed.fromInt(100)` 为 `FIXED_100`，`Fixed.fromInt(864)` / `Fixed.fromInt(100)` / `Fixed.fromInt(1000)` 为对应常量。

- [ ] **Step 2: resource_system.ts 提升常量**

在文件顶部添加：

```typescript
const FIXED_1000 = Fixed.fromInt(1000);
const FIXED_2 = Fixed.fromInt(2);
```

替换 yieldTick 内 `Fixed.fromInt(1000)` 和 `Fixed.fromInt(2)` 为常量。

- [ ] **Step 3: building_system.ts 提升常量**

```typescript
const FIXED_1000 = Fixed.fromInt(1000);
```

替换 advanceTick 内第 205-207 行的 `Fixed.fromInt(1000)`。

- [ ] **Step 4: factory_system.ts 提升常量**

```typescript
const FIXED_60000 = Fixed.fromInt(60000);
const FIXED_10 = Fixed.fromInt(10);
```

替换 produceTick 内对应常量。

- [ ] **Step 5: focus_system.ts 提升常量**

```typescript
const FIXED_60000 = Fixed.fromInt(60000);
```

替换 advanceTick 内第 300 行。

- [ ] **Step 6: research_system.ts 提升常量**

```typescript
const FIXED_BASE_RESEARCH_MS = Fixed.fromInt(90000);
```

替换 advanceTick 内第 226 行（注意 BASE_RESEARCH_MS=90000 不是 60000）。

- [ ] **Step 7: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 零错误，vitest 全过

- [ ] **Step 8: grep 确认无残留**

Run: `grep -rn "Fixed.fromInt([0-9]*)" src/core/simulation/ | grep -v "const FIXED"`
Expected: 仅剩变量形式（如 `Fixed.fromInt(level)`、`Fixed.fromInt(state.speed)`），无纯数字常量在 tick 主循环内

---

## P1.2 渲染层静态资源跳过重绘

**Files:**
- Modify: `src/render/ui/top_bar.ts`
- Modify: `src/render/ui/panels/factory_panel.ts`
- Modify: `src/render/ui/panels/combat_panel.ts`

- [ ] **Step 1: top_bar.ts 删除静态图标重绘**

在 `updateResourceBar` 方法中，删除 update 路径中对静态资源图标的 `drawResourceIcon` 调用。资源图标颜色在 mount 时已固定，每帧重绘是浪费。

保留 mount 时的 drawResourceIcon 调用。

- [ ] **Step 2: graphics_util.ts 添加 colorEquals 工具**

```typescript
export function colorEquals(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
```

- [ ] **Step 3: factory_panel.ts/combat_panel.ts drawCard 加 accent 脏标记**

在每个 handle 缓存 `lastAccent`，仅 accent 变化时才调 `drawCard`。

- [ ] **Step 4: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P1.3 暂停态跳过 shadow 重建

**Files:**
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 修改 stepFrame 暂停分支**

在 `stepFrame` 方法中，`speed===0` 分支改为跳过 pushShadows：

```typescript
if (this.speed === 0) {
  return;
}
```

- [ ] **Step 2: 添加 refreshShadows 公开方法**

```typescript
refreshShadows(): void {
  this.pushShadows();
}
```

- [ ] **Step 3: 在暂停/恢复/打开面板回调中调用 refreshShadows**

在所有会改变 UI 显隐的回调末尾追加 `this.refreshShadows()`。

- [ ] **Step 4: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P1.4 合并 countries 六次遍历为单次

**Files:**
- Modify: `src/core/simulation/simulation.ts`

- [ ] **Step 1: 重构 tick() 主循环**

把 tick() 方法中 6 个独立的 `state.countries.forEach(...)` 合并为一个：

```typescript
state.countries.forEach((c) => {
  this.resourceSystem.yieldTick(state, c.id, dtMs);
  this.buildingSystem.advanceTick(state, c.id, dtMs);
  this.factorySystem.produceTick(state, c.id, dtMs);
  const focusEvents = this.focusSystem.advanceTick(state, c.id, dtMs);
  for (const ev of focusEvents) events.push(ev);
  const researchEvents = this.researchSystem.advanceTick(state, c.id, dtMs);
  for (const ev of researchEvents) events.push(ev);
  // 政治点产出
  const stockpile = state.stockpiles.get(c.id);
  if (stockpile) {
    const baseRate = this.focusSystem.getPoliticalPowerPerDay(c.id);
    const delta = baseRate.mul(dtMs).div(FIXED_864).div(FIXED_100).div(FIXED_1000);
    stockpile.political = stockpile.political.add(delta);
    const cap = stockpile.caps.political;
    if (stockpile.political.greaterThan(cap)) stockpile.political = cap;
    state.stockpiles.set(c.id, stockpile);
  }
});
```

注意：yieldTick 内部会修改 state.stockpiles，advanceTick 可能修改 state.buildings/constructionQueues，需确认各系统之间没有同 tick 内依赖前一次 forEach 的副作用。检查：
- resourceSystem.yieldTick 只修改 stockpiles（不被后续系统直接依赖，后续系统读 stockpile 是读更新后的值，正确）
- buildingSystem.advanceTick 可能修改 buildings（不被 factorySystem 依赖，factorySystem 只读 factories/productionTasks）
- factorySystem.produceTick 修改 productionTasks（不被 focus/research 依赖）
- focus/research 互不依赖
- 政治点产出读 stockpile（刚被 yieldTick 更新过，正确）

- [ ] **Step 2: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过（确定性测试必须通过，证明合并遍历不改变计算结果）

---

## P1.5 reserveCap 仓储加成缓存

**Files:**
- Modify: `src/core/simulation/resource_system.ts`

- [ ] **Step 1: 添加 storageBonusCache 字段**

在 DefaultResourceSystem 类中添加：

```typescript
private storageBonusCache = new Map<string, Fixed>();
private storageCacheValid = false;
```

注意：storage 加成对 steel/oil/tungsten/rubber/aluminum 相同，都是每个 storage 建筑 +level*100，只需缓存一个 Fixed 值（各国相同，因加成来自该国家管控的 storage 建筑，需按国家缓存）。

- [ ] **Step 2: 重构 reserveCap 使用缓存**

```typescript
reserveCap(state: WorldState, countryId: string): Caps {
  const stockpile = state.stockpiles.get(countryId);
  const cached = this.storageBonusCache.get(countryId);
  const bonus = cached ?? this.computeStorageBonus(state, countryId);
  const baseSteel = stockpile ? stockpile.caps.steel : Fixed.ZERO;
  // ...
  return {
    steel: baseSteel.add(bonus),
    // ... 其他资源同理
    political: stockpile ? stockpile.caps.political : Fixed.ZERO,
  };
}

private computeStorageBonus(state: WorldState, countryId: string): Fixed {
  let total = Fixed.ZERO;
  state.buildings.forEach((building) => {
    if (building.type !== 'storage' || building.state !== 'active') return;
    const province = state.provinces.get(building.provinceId);
    if (!province || province.controllerId !== countryId) return;
    total = total.add(StorageBonusPerLevel.mul(Fixed.fromInt(building.level)));
  });
  this.storageBonusCache.set(countryId, total);
  return total;
}
```

预计算模块级常量 `const StorageBonusPerLevel = Fixed.fromInt(100);`。

- [ ] **Step 3: 添加 invalidateStorageCache 方法**

```typescript
invalidateStorageCache(countryId?: string): void {
  if (countryId) this.storageBonusCache.delete(countryId);
  else this.storageBonusCache.clear();
}
```

- [ ] **Step 4: 在 buildingSystem 完成 storage 建筑时触发失效**

在 building_system.advanceTick 中，building 入库后若 type==='storage'，需要通知 resourceSystem 失效。但这会引入 ResourceSystem→BuildingSystem 的反向依赖。简化方案：在 simulation.tick() 中，推进所有系统后检测是否有新建筑，如有则调用 resourceSystem.invalidateStorageCache。M1 阶段更简单：reserveCap 只在 storage 建筑完成时缓存失效，但因 buildingSystem 不直接持有 resourceSystem 引用，在 simulation 层处理。

更简单的 M1 方案：不做强失效，改为在 simulation 层比较推进前后的 building 数量变化决定是否失效。或者直接接受"缓存持续到下一次 enqueue/cancel/建筑完成"，在 Simulation 层暴露一个钩子。

最简方案（推荐）：在 ResourceSystem 接口添加 `onBuildingsChanged(countryId: string): void` 方法，DefaultResourceSystem 实现为 `this.storageBonusCache.delete(countryId)`。在 simulation.tick() 合并遍历中，buildingSystem.advanceTick 后检测是否有新 building 入库（比较前后 state.nextEntityId 或 building.size），如有则调用 resourceSystem.onBuildingsChanged(c.id)。

- [ ] **Step 5: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P1.6 snapshot Fixed 引用复用

**Files:**
- Modify: `src/core/simulation/state_manager.ts`

- [ ] **Step 1: 删除所有 `new Fixed(f.raw)` 模式**

Fixed 是不可变类（add/sub/mul/div 都返回新实例，原对象 raw 值永不改变），直接复用引用即可。

把 cloneCountry/cloneResourceNode/cloneStockpile/cloneBuilding/cloneFactory/cloneConstructionQueueItem/cloneProductionTask/cloneDivision/cloneFocusTreeState/cloneResearchState/cloneDispute 中所有 `new Fixed(xxx.raw)` 替换为直接引用 `xxx`。

例如：
```typescript
// 旧
disputeResolve: new Fixed(c.disputeResolve.raw),
// 新
disputeResolve: c.disputeResolve,
```

唯一的例外：`cloneStockpile` 中 caps 对象本身需要新建（避免修改快照的 caps 影响原 state），但 caps 内的 Fixed 值可以直接引用。

- [ ] **Step 2: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

- [ ] **Step 3: grep 确认无残留**

Run: `grep -n "new Fixed" src/core/simulation/state_manager.ts`
Expected: 无匹配（全部清理干净）

---

## P1.7 建筑成本常量表

**Files:**
- Modify: `src/core/simulation/building_system.ts`

- [ ] **Step 1: 预计算模块级常量表**

把文件底部的 computeSteelCost/computeTimeCost 两个 switch 函数替换为模块级常量查找表：

```typescript
const STEEL_COST: Record<BuildingType, Fixed> = {
  civilian_factory: Fixed.fromInt(100),
  military_factory: Fixed.fromInt(120),
  dockyard: Fixed.fromInt(150),
  infrastructure: Fixed.fromInt(50),
  mine: Fixed.fromInt(80),
  storage: Fixed.fromInt(60),
  supply_hub: Fixed.fromInt(100),
  fort: Fixed.fromInt(70),
};

const TIME_COST: Record<BuildingType, Fixed> = {
  civilian_factory: Fixed.fromInt(60),
  military_factory: Fixed.fromInt(70),
  dockyard: Fixed.fromInt(90),
  infrastructure: Fixed.fromInt(30),
  mine: Fixed.fromInt(40),
  storage: Fixed.fromInt(35),
  supply_hub: Fixed.fromInt(50),
  fort: Fixed.fromInt(45),
};
```

- [ ] **Step 2: 简化 computeSteelCost/computeTimeCost 为查表**

```typescript
function computeSteelCost(type: BuildingType): Fixed {
  return STEEL_COST[type];
}

function computeTimeCost(type: BuildingType): Fixed {
  return TIME_COST[type];
}
```

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P1.8 统一用 Fixed.ONE 替代 Fixed.fromInt(1)

**Files:**
- Modify: `src/core/simulation/focus_system.ts`
- Modify: `src/core/simulation/research_system.ts`
- Modify: `src/core/simulation/simulation.ts`（如有）

- [ ] **Step 1: focus_system.ts 修复**

删除 advanceTick 中关于"Fixed.ONE 是 number"的错误注释，把 `Fixed.fromInt(1)` 替换为 `Fixed.ONE`：
- 第 307 行 `if (focusTree.activeProgress.greaterOrEqual(Fixed.fromInt(1)))` → `Fixed.ONE`
- applyEffect 中 `Fixed.fromInt(1)` → `Fixed.ONE`

- [ ] **Step 2: research_system.ts 修复**

- 第 229 行 `if (lineState.progress.greaterOrEqual(Fixed.fromInt(1)))` → `Fixed.ONE`

- [ ] **Step 3: grep 确认全局无残留**

Run: `grep -rn "Fixed.fromInt(1)" src/core/ src/game/ src/render/`
Expected: 除 `Fixed.fromInt(100)`、`Fixed.fromInt(10)` 等多位数外，无 `Fixed.fromInt(1)` 单独出现

- [ ] **Step 4: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P1.9 Assistant 行为树单次 tick 复用决策

**Files:**
- Modify: `src/core/simulation/assistant.ts`
- Modify: `src/core/ai/assistant_behavior_tree.ts`
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 重构 DefaultAssistantSystem，暴露 tickAndApply 单次入口**

新增公开方法 `tickAndApply(state, countryId)`，内部做一次 tree.tick()，然后按决策类型依次应用（factory → supply → defense），三个 auto 方法改为从"本 tick 决策缓存"取结果。

最简实现方案：在 DefaultAssistantSystem 添加私有字段：
```typescript
private currentDecisions: AssistantDecision[] = [];
private lastTickId = -1;
```

tickAndApply 中：
```typescript
tickAndApply(state: WorldState, countryId: string): void {
  this.cachedState = state;
  if (!this.isEnabled(countryId)) return;
  if (state.tickId === this.lastTickId) return; // 同 tick 已执行过
  this.lastTickId = state.tickId;
  this.tree.tick(state, countryId);
  this.currentDecisions = this.tree.getDecisions();
  this.applyFactoryDecision(state, countryId);
  this.applySupplyDecision(state, countryId);
  this.applyDefenseDecision(state, countryId);
}
```

把原来 autoAssignFactories/autoScheduleSupply/autoDefendFront 内的 tree.tick() 调用和决策查找逻辑移到 applyXxx 私有方法中，从 currentDecisions 取对应类型决策。

- [ ] **Step 2: decideFactory 返回 topItem 索引/引用，消除 find**

修改 AssistantDecision 增加 `itemIndex?: number` 字段。decideFactory 在找到 topItem 后记录其在 queue.items 中的索引：
```typescript
// 找到 topItem 时
let topItem = queue.items[0];
let topIndex = 0;
for (let i = 1; i < queue.items.length; i++) {
  if (queue.items[i].priority < topItem.priority) {
    topItem = queue.items[i];
    topIndex = i;
  }
}
return { ..., taskId: topItem.id, itemIndex: topIndex, ... };
```

applyFactoryDecision 用 `queue.items[decision.itemIndex!]` 直接取项，不再 find。

- [ ] **Step 3: 消除 idleFactoryIds.slice() 拷贝**

decideFactory 返回 assignCount 而非拷贝后的数组：
```typescript
return { ..., factoryIds: idleFactoryIds.slice(0, assignCount), ... };
```
改为直接记录 idleFactoryIds 引用和 assignCount（不 slice），或者只在需要时 slice。M1 优化：assignCount 很小（≤maxFactoriesPerAssignment=4），slice 影响极小，可保持 slice 但确保 assignCount 限制下 slice 长度 ≤4。

- [ ] **Step 4: 消除 assignedFactoryIds.indexOf 检查**

在 applyFactoryDecision 中，决策阶段已确认这些工厂是 idle 状态且未被分配（因为 idle 状态的 factory.taskId 为 null），直接分配即可，删除 `if (item.assignedFactoryIds.indexOf(factoryId) < 0)` 检查。如果需要防御性，可改为简单判断 `factory.state === 'idle'`（已有）。

- [ ] **Step 5: 修改 game_runner 调用方式**

把 game_runner.ts 中 144-148 行：
```typescript
if (this.assistantEnabled) {
  this.assistant.autoAssignFactories(this.state, this.countryId);
  this.assistant.autoScheduleSupply(this.state, this.countryId);
  this.assistant.autoDefendFront(this.state, this.countryId);
}
```
改为：
```typescript
if (this.assistantEnabled) {
  (this.assistant as DefaultAssistantSystem).tickAndApply(this.state, this.countryId);
}
```
需在 game_runner.ts 顶部 import DefaultAssistantSystem。如果不希望引入具体类依赖，可在 AssistantSystem 接口增加 tickAndApply 方法。

- [ ] **Step 6: 更新 AssistantSystem 接口（interfaces.ts 或 assistant.ts）**

在 AssistantSystem 接口中添加：
```typescript
tickAndApply(state: WorldState, countryId: string): void;
```
DefaultAssistantSystem 实现之。autoAssignFactories/autoScheduleSupply/autoDefendFront 保留但改为不调用 tree.tick()（或标记为内部方法）。

- [ ] **Step 7: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P1.10 readFactoryPanel 按国家过滤工厂

**Files:**
- Modify: `src/render/core/shadow_reader.ts`

- [ ] **Step 1: 构建玩家省份 ID 集合**

在 readFactoryPanel 开始处，先获取玩家国家的 ownedProvinceIds 并构建 Set：
```typescript
export function readFactoryPanel(state: WorldState, countryId: string): FactoryPanelShadow {
  const factories: FactoryShadow[] = [];
  let idleCount = 0;
  let longestIdleTicks = 0;

  const playerCountry = state.countries.get(countryId);
  const playerProvinceIds = new Set<number>(playerCountry?.ownedProvinceIds ?? []);

  state.factories.forEach((f: Factory) => {
    // 只处理玩家主权省份上的工厂
    if (!playerProvinceIds.has(f.provinceId)) return;
    const shadow: FactoryShadow = { ... };
    factories.push(shadow);
    // ... 空闲统计
  });
  // ...
}
```

- [ ] **Step 2: 注意 owned vs controlled 区别**

工厂建在本国主权省份（ownedProvinceIds），争议省份上的工厂不属于玩家产能。确认 world_state.ts 中 Country.ownedProvinceIds 的定义（主权）和 controlledProvinceIds（管控）的区别。工厂归属用 ownedProvinceIds。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.1 Graphics 脏标记

**Files:**
- Modify: `src/render/ui/top_bar.ts`
- Modify: `src/render/ui/panels/factory_panel.ts`
- Modify: `src/render/ui/panels/focus_panel.ts`
- Modify: `src/render/ui/panels/research_panel.ts`
- Modify: `src/render/ui/panels/combat_panel.ts`
- Modify: `src/render/ui/panels/session_goal_card.ts`
- Modify: `src/render/ui/panels/daily_task_panel.ts`
- Modify: `src/render/ui/panels/assistant_panel.ts`

- [ ] **Step 1: top_bar.ts 资源条脏标记**
- [ ] **Step 2: factory_panel.ts 进度条脏标记**
- [ ] **Step 3: focus_panel.ts 脏标记**
- [ ] **Step 4: research_panel.ts 脏标记**
- [ ] **Step 5: combat_panel.ts 脏标记**
- [ ] **Step 6: session_goal_card.ts 脏标记**
- [ ] **Step 7: daily_task_panel.ts 脏标记**
- [ ] **Step 8: assistant_panel.ts 脏标记**

每个面板的 handle 接口添加 `lastRatio?: number; lastBarColor?: Color; lastProgress?: number;` 等字段，update 时比对，仅变化时调用 draw 函数。

- [ ] **Step 9: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.2 Label 字符串缓存

**Files:**
- Modify: 同 P2.1 的 8 个文件

- [ ] **Step 1: 为每个 handle 添加 lastString 字段**
- [ ] **Step 2: 在所有 label.string = 赋值前比对**
- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.3 SortedMap values 平行数组

**Files:**
- Modify: `src/core/determinism/sorted_map.ts`
- Test: `src/core/determinism/sorted_map.test.ts`

- [ ] **Step 1: 在 sorted_map.test.ts 添加 values 同步测试**
- [ ] **Step 2: 运行现有测试确认通过**

Run: `npx vitest run src/core/determinism/sorted_map.test.ts`

- [ ] **Step 3: 重写 SortedMap 内部用 values 平行数组**

```typescript
export class SortedMap<K extends string | number, V> {
  private store = new Map<K, V>();
  private keys: K[] = [];
  private values: V[] = [];
  private dirty = false;

  set(key: K, value: V): void {
    if (!this.store.has(key)) {
      this.keys.push(key);
      this.dirty = true;
    }
    this.store.set(key, value);
  }

  delete(key: K): boolean {
    if (!this.store.delete(key)) return false;
    this.dirty = true;
    return true;
  }

  clear(): void {
    this.store.clear();
    this.keys = [];
    this.values = [];
    this.dirty = false;
  }

  private ensureSorted(): void {
    if (!this.dirty) return;
    this.keys.sort(compareKey);
    this.values = this.keys.map((k) => this.store.get(k) as V);
    this.dirty = false;
  }

  forEach(cb: (v: V, k: K) => void): void {
    this.ensureSorted();
    for (let i = 0; i < this.keys.length; i++) {
      cb(this.values[i], this.keys[i]);
    }
  }

  entries(): [K, V][] {
    this.ensureSorted();
    const out: [K, V][] = [];
    for (let i = 0; i < this.keys.length; i++) {
      out.push([this.keys[i], this.values[i]]);
    }
    return out;
  }
}
```

- [ ] **Step 4: 运行全部测试**

Run: `npx vitest run`
Expected: 全过（新增测试也通过）

- [ ] **Step 5: grep 确认无 store.get 在 forEach 内**

Run: `grep -n "store.get" src/core/determinism/sorted_map.ts`
Expected: 仅出现在 ensureSorted 的 map 回调和 get() 方法中，不在 forEach 循环内

- [ ] **Step 6: 运行 tsc**

Run: `npx tsc --noEmit`
Expected: 零错误

---

## P2.4 合并重复工厂扫描

**Files:**
- Modify: `src/game/game_runner.ts`
- Modify: `src/render/core/shadow_reader.ts`（必要时导出 readFactoryPanel 供复用）

- [ ] **Step 1: pushShadows 先构造 factoryShadow 再复用**

```typescript
private pushShadows(): void {
  const mainShadow = readMainUiShadow(this.state, this.countryId);
  this.scene.update(mainShadow);
  const factoryShadow = mainShadow.factory;
  this.scene.mainUi?.updateAssistant(this.buildAssistantShadow(factoryShadow));
  // ...
}
```

- [ ] **Step 2: buildAssistantShadow 签名改为接收 FactoryPanelShadow**

```typescript
private buildAssistantShadow(factoryShadow: FactoryPanelShadow): AssistantPanelShadow {
  const idleCount = factoryShadow.idleCount;
  // 删除原来的 state.factories.forEach 循环
  // ...
}
```

需要在 game_runner.ts 顶部 import FactoryPanelShadow 类型。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.5 resourceNodes 反向索引

**Files:**
- Modify: `src/core/simulation/resource_system.ts`

- [ ] **Step 1: 添加 countryNodeIndex 字段**

```typescript
private countryNodeIndex = new Map<string, number[]>();
private indexValid = false;
```

- [ ] **Step 2: 添加 rebuildIndex 方法**

```typescript
private rebuildIndex(state: WorldState): void {
  this.countryNodeIndex.clear();
  state.resourceNodes.forEach((node) => {
    const province = state.provinces.get(node.provinceId);
    if (!province) return;
    const cid = province.controllerId;
    let list = this.countryNodeIndex.get(cid);
    if (!list) { list = []; this.countryNodeIndex.set(cid, list); }
    list.push(node.id);
  });
  this.indexValid = true;
}
```

- [ ] **Step 3: yieldTick 使用索引**

```typescript
yieldTick(state: WorldState, countryId: string, dtMs: Fixed): void {
  if (!this.indexValid) this.rebuildIndex(state);
  const nodeIds = this.countryNodeIndex.get(countryId);
  if (!nodeIds) { /* 记录 history 0 值 */ return; }
  for (const nodeId of nodeIds) {
    const node = state.resourceNodes.get(nodeId);
    if (!node) continue;
    if (node.mineBuildingLevel <= 0) continue;
    // ... 产出计算（同原逻辑，但不再需要 province 检查）
  }
}
```

注意：产出计算中不再需要 province.get+controllerId 判断，索引已保证。但仍需要 province.infrastructure 等影响产出的字段吗？看当前代码不依赖，只依赖 node.occupied。node.occupied 检查保留。

- [ ] **Step 4: 添加 invalidateIndex 方法**

M1 阶段因省份管控不变，可简化：在 reserveCap invalidate 或 enqueue/mine 建筑完成时触发 rebuildIndex。

- [ ] **Step 5: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过（这是核心逻辑改动，确定性测试必须通过）

---

## P2.6 省份管控数缓存

**Files:**
- Modify: `src/render/core/shadow_reader.ts`

- [ ] **Step 1: 添加模块级缓存**

```typescript
let controlledCache: Map<string, number> | null = null;

function getControlledCount(state: WorldState, countryId: string): number {
  if (!controlledCache) {
    controlledCache = new Map();
    state.provinces.forEach((p) => {
      const cur = controlledCache!.get(p.controllerId) ?? 0;
      controlledCache!.set(p.controllerId, cur + 1);
    });
  }
  return controlledCache.get(countryId) ?? 0;
}
```

M1 简化：缓存永不过期（因为 M1 没有省份易主逻辑）。预留 invalidateControlledCache 导出函数供 C 级联机 dispute 系统使用。

- [ ] **Step 2: readCombatPanelShadow 使用缓存**

把 `state.provinces.forEach` 统计 controlledProvinces 改为 `const controlledProvinces = getControlledCount(state, countryId);`。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.7 focus completedFocusIds 用 Set

**Files:**
- Modify: `src/core/state/world_state.ts`
- Modify: `src/core/simulation/focus_system.ts`
- Modify: `src/core/simulation/state_manager.ts`
- Modify: `src/core/state/hash.ts`
- Modify: `src/render/core/shadow_reader.ts`

- [ ] **Step 1: 在 FocusTreeState 接口添加 completedFocusSet**

在 world_state.ts 的 FocusTreeState 接口中添加：
```typescript
completedFocusSet: Set<string>;
```

- [ ] **Step 2: 更新所有创建 FocusTreeState 的地方**

在所有初始化/构造 FocusTreeState 的位置（state_manager 快照、initial state 工厂等），同步维护 completedFocusSet = new Set(completedFocusIds)。

- [ ] **Step 3: focus_system.refreshCandidates 用 set.has()**

把 `focusTree.completedFocusIds.indexOf(focus.id) >= 0` 和 `focusTree.completedFocusIds.indexOf(p) < 0` 替换为 `focusTree.completedFocusSet.has(focus.id)` / `!focusTree.completedFocusSet.has(p)`。

- [ ] **Step 4: advanceTick 完成时同步添加到 Set**

`focusTree.completedFocusIds.push(focus.id);` 之后追加 `focusTree.completedFocusSet.add(focus.id);`。

- [ ] **Step 5: snapshot 深拷贝 Set**

state_manager.ts 的 cloneFocusTreeState 中：
```typescript
completedFocusSet: new Set(f.completedFocusSet),
```

- [ ] **Step 6: hash 序列化不改**

hash.ts 序列化仍用 completedFocusIds 数组（已排序？需确认遍历顺序一致）。因为 Set 遍历顺序是插入顺序，而 completedFocusIds 是 push 顺序，两者一致。serializeSortedMap 中仍遍历 completedFocusIds（数组），确定性不受影响。

- [ ] **Step 7: shadow_reader 不改**

shadow_reader 中 `[...focusTree.completedFocusIds]` 展开数组即可，不需要动。

- [ ] **Step 8: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.8 research currentNodeIndex 缓存 + bonus 累加缓存

**Files:**
- Modify: `src/core/simulation/research_system.ts`

- [ ] **Step 1: ResearchLineState 增 currentNodeIndex 字段**

需要在 world_state.ts 的对应类型中添加 `currentNodeIndex: number`。或者 research_system 内部维护 Map 缓存，不修改 world_state。

推荐内部维护方案（不改 world_state 接口）：

```typescript
private nodeIndexCache = new Map<string, Map<string, number>>(); // countryId → lineId → nodeIndex
private bonusCache = new Map<string, Map<string, Fixed>>(); // countryId → bonusType → total
```

但因为 research.lines 是 state 上的数组，state 被 snapshot/restore 后引用会变，内部缓存会失效。更好的方案是直接在 ResearchLineState（world_state.ts 中）增加字段。

查看 world_state.ts 中 ResearchLineState 的定义位置，添加 currentNodeIndex 字段。

- [ ] **Step 2: assignSlot 初始化 currentNodeIndex=0**

- [ ] **Step 3: advanceTick 用 currentNodeIndex 替代 findIndex**

```typescript
const nodeIndex = lineState.currentNodeIndex ?? 0;
// 推进进度...
// 完成时：
if (nodeIndex + 1 < line.nodes.length) {
  lineState.currentNode = line.nodes[nodeIndex + 1].id;
  lineState.currentNodeIndex = nodeIndex + 1;
  lineState.progress = Fixed.ZERO;
  // 累加 bonus 到 bonusCache
  this.addNodeBonus(countryId, node.bonus);
} else {
  lineState.assignedSlot = -1;
  lineState.progress = Fixed.ZERO;
}
```

- [ ] **Step 4: getBonus 查缓存直接返回**

```typescript
getBonus(state: WorldState, countryId: string, bonusType: string): Fixed {
  const inner = this.bonusCache.get(countryId);
  if (!inner) this.rebuildBonusCache(state, countryId);
  return this.bonusCache.get(countryId)?.get(bonusType) ?? Fixed.ZERO;
}
```

- [ ] **Step 5: snapshot 需拷贝 currentNodeIndex**

state_manager.ts cloneResearchState 中添加 `currentNodeIndex: line.currentNodeIndex ?? 0`。

- [ ] **Step 6: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过（确定性红线）

---

## P2.9 消除 prevMaxBuildingId 全表扫描

**Files:**
- Modify: `src/core/simulation/simulation.ts`

- [ ] **Step 1: 用 nextEntityId 替代全表扫描**

在 P1.4 合并遍历之前（dtMs 计算后），记录：
```typescript
const prevNextEntityId = state.nextEntityId;
```

推进所有系统后，收集建筑完成事件：
```typescript
state.buildings.forEach((b) => {
  if (b.id >= prevNextEntityId) {
    events.push({ kind: 'buildingCompleted', buildingId: b.id, provinceId: b.provinceId });
  }
});
```

注意：nextEntityId 在 buildingSystem.enqueue 和 advanceTick（建筑入库）时都会自增。enqueue 是在 applyAction 阶段（输入应用），advanceTick 是在推进阶段。推进前记录 prevNextEntityId = state.nextEntityId，推进后 b.id >= prevNextEntityId 即为本帧新建筑（含 enqueue 创建的 constructionItem？不是，enqueue 增加的是 constructionQueueItem，不是 Building。Building 只在 advanceTick 完成时创建。所以这个方案正确）。

- [ ] **Step 2: 删除推进前的 prevMaxBuildingId 全表扫描**

删除原来 `state.buildings.forEach((b) => { if (b.id > prevMaxBuildingId) prevMaxBuildingId = b.id; });` 这一段。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.10 队列操作不再全局遍历

**Files:**
- Modify: `src/core/simulation/building_system.ts`
- Modify: `src/core/simulation/simulation.ts`

- [ ] **Step 1: cancel 方法增加 countryId 参数**

修改 BuildingSystem 接口的 cancel 签名（interfaces.ts）和 DefaultBuildingSystem.cancel 实现：

```typescript
cancel(state: WorldState, itemId: string, countryId?: string): void {
  if (countryId) {
    const queue = state.constructionQueues.get(countryId);
    if (!queue) return;
    const idx = queue.items.findIndex((item) => item.id === itemId);
    if (idx >= 0) {
      queue.items.splice(idx, 1);
      state.constructionQueues.set(countryId, queue);
    }
    return;
  }
  // 原有全局遍历逻辑作为后备（AI 国家操作可能不知道 countryId）
  state.constructionQueues.forEach((queue) => { ... });
}
```

- [ ] **Step 2: assignFactories 同理增加 countryId 参数**

- [ ] **Step 3: Simulation.applyAction 传入 playerCountryId**

在 applyAction 的 cancelBuilding 和 reorderConstruction 分支中，传入 this.playerCountryId。

- [ ] **Step 4: reorderConstruction 不再全局遍历**

simulation.ts 中 reorderConstruction 分支改为直接取 playerCountryId 的队列操作。

- [ ] **Step 5: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.11 advanceTick 原地删除完成项

**Files:**
- Modify: `src/core/simulation/building_system.ts`

- [ ] **Step 1: 用倒序 splice 替代 filter**

```typescript
advanceTick(state: WorldState, countryId: string, dtMs: Fixed): void {
  const queue = state.constructionQueues.get(countryId);
  if (!queue) return;

  const completedIdx: number[] = [];
  for (let i = 0; i < queue.items.length; i++) {
    const item = queue.items[i];
    if (item.progress.greaterOrEqual(Fixed.ONE)) { completedIdx.push(i); continue; }
    const factoryCount = item.assignedFactoryIds.length;
    if (factoryCount === 0) continue;
    const increment = Fixed.fromInt(factoryCount).mul(dtMs).div(item.timeCost.mul(FIXED_1000));
    item.progress = item.progress.add(increment);
    if (item.progress.greaterOrEqual(Fixed.ONE)) {
      item.progress = Fixed.ONE;
      const buildingId = state.nextEntityId++;
      state.buildings.set(buildingId, { ... });
      completedIdx.push(i);
    }
  }

  // 倒序删除
  for (let j = completedIdx.length - 1; j >= 0; j--) {
    queue.items.splice(completedIdx[j], 1);
  }
  state.constructionQueues.set(countryId, queue);
}
```

- [ ] **Step 2: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.12 Dispute participants 用 Set 加速存在性检查

**Files:**
- Modify: `src/core/state/world_state.ts`
- Modify: `src/core/ai/assistant_behavior_tree.ts`
- Modify: `src/core/simulation/state_manager.ts`
- Modify: `src/core/state/hash.ts`

- [ ] **Step 1: 在 Dispute 接口添加 participantSet**

在 world_state.ts 的 Dispute 接口中添加：
```typescript
participantSet: Set<string>;
```

- [ ] **Step 2: 更新所有创建 Dispute 的地方**

在所有初始化/构造 Dispute 的位置（state_manager 快照、初始 state 工厂等），同步维护 participantSet = new Set(participants)。

- [ ] **Step 3: assistant_behavior_tree.decideDefense 用 set.has()**

把：
```typescript
state.disputes.forEach((dispute) => {
  if (dispute.participants.indexOf(countryId) >= 0) hasDispute = true;
});
```
改为：
```typescript
state.disputes.forEach((dispute) => {
  if (dispute.participantSet.has(countryId)) hasDispute = true;
});
```

- [ ] **Step 4: snapshot 深拷贝 Set**

state_manager.ts 的 cloneDispute 中：
```typescript
participantSet: new Set(d.participantSet),
```

- [ ] **Step 5: hash 序列化不改**

hash.ts 序列化仍用 participants 数组（确定性顺序），不序列化 Set。

- [ ] **Step 6: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P2.13 simulation.tick 空闲工厂事件复用 scanIdle 结果

**Files:**
- Modify: `src/core/simulation/factory_system.ts`
- Modify: `src/core/simulation/simulation.ts`
- Modify: `src/core/simulation/interfaces.ts`

- [ ] **Step 1: 修改 scanIdle 返回值增加 firstIdleFactoryId**

查看 FactorySystem 接口和 DefaultFactorySystem.scanIdle 的当前返回类型，增加 `firstIdleFactoryId: number` 字段。

在 scanIdle 遍历 factories 时，记录遇到的第一个 idle 工厂 id（属于玩家国家管控省份的）。

- [ ] **Step 2: simulation.tick 使用返回的 firstIdleFactoryId**

把 193-214 行：
```typescript
if (this.playerCountryId !== '') {
  const idleAlert = this.factorySystem.scanIdle(state, this.playerCountryId);
  if (idleAlert.level >= 1 && idleAlert.idleFactoryCount > 0) {
    let firstIdleFactoryId = 0;
    let found = false;
    state.factories.forEach((f) => {
      if (found) return;
      const province = state.provinces.get(f.provinceId);
      if (!province || province.controllerId !== this.playerCountryId) return;
      if (f.state === 'idle' && f.idleSinceTick >= 0) {
        firstIdleFactoryId = f.id;
        found = true;
      }
    });
    events.push({ ... });
  }
}
```
改为：
```typescript
if (this.playerCountryId !== '') {
  const idleAlert = this.factorySystem.scanIdle(state, this.playerCountryId);
  if (idleAlert.level >= 1 && idleAlert.idleFactoryCount > 0) {
    events.push({
      kind: 'factoryIdle',
      factoryId: idleAlert.firstIdleFactoryId,
      durationTicks: idleAlert.longestIdleTicks,
    });
  }
}
```

- [ ] **Step 3: 更新 FactorySystem 接口**

在 interfaces.ts 中更新 scanIdle 返回类型，增加 firstIdleFactoryId 字段。

- [ ] **Step 4: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P3.1 hashWorld Encoder 重写为 Uint8Array

**Files:**
- Modify: `src/core/state/hash.ts`
- Test: `src/core/state/hash.test.ts`

- [ ] **Step 1: 在 hash.test.ts 添加重写前后哈希一致性测试**

先记录当前 hashWorld(makeMinimalState()) 的返回值作为基准。

- [ ] **Step 2: 重写 Encoder 为 Uint8Array**

```typescript
export class Encoder {
  private buf: Uint8Array;
  private offset = 0;

  constructor(initialSize = 4096) {
    this.buf = new Uint8Array(initialSize);
  }

  private ensure(extra: number): void {
    if (this.offset + extra <= this.buf.length) return;
    let newLen = this.buf.length;
    while (newLen < this.offset + extra) newLen *= 2;
    const newBuf = new Uint8Array(newLen);
    newBuf.set(this.buf);
    this.buf = newBuf;
  }

  i32(n: number): void {
    this.ensure(4);
    const v = n | 0;
    this.buf[this.offset++] = v & 0xff;
    this.buf[this.offset++] = (v >>> 8) & 0xff;
    this.buf[this.offset++] = (v >>> 16) & 0xff;
    this.buf[this.offset++] = (v >>> 24) & 0xff;
  }

  u32(n: number): void { this.i32(n | 0); }

  u16(n: number): void {
    this.ensure(2);
    const v = n & 0xffff;
    this.buf[this.offset++] = v & 0xff;
    this.buf[this.offset++] = (v >>> 8) & 0xff;
  }

  u8(n: number): void {
    this.ensure(1);
    this.buf[this.offset++] = n & 0xff;
  }

  string(s: string): void {
    const utf8 = unescape(encodeURIComponent(s));
    this.u16(utf8.length);
    this.ensure(utf8.length);
    for (let i = 0; i < utf8.length; i++) {
      this.buf[this.offset++] = utf8.charCodeAt(i) & 0xff;
    }
  }

  bool(b: boolean): void { this.u8(b ? 0x01 : 0x00); }

  nullable<T>(v: T | null | undefined, writeVal: (e: Encoder, v: T) => void): void {
    if (v === null || v === undefined) { this.u8(0xff); }
    else { this.u8(0x00); writeVal(this, v); }
  }

  fixed(f: Fixed): void { this.i32(f.raw); }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.offset);
  }
}
```

**注意字节序**：原实现 i32 写入顺序是 `v&0xff, (v>>>8)&0xff, (v>>>16)&0xff, (v>>>24)&0xff`（小端），重写必须保持完全一致。**不要**改为大端。

**注意 string 编码**：M1 阶段先用 `unescape(encodeURIComponent(s))` 保持与原实现字节完全一致，不冒险用 TextEncoder（TextEncoder 标准 UTF-8 应该一致，但为避免确定性风险，先用旧编码方式，字节级一致是第一优先级）。待 C 级联机前做 TextEncoder 切换时再做字节一致性验证。

- [ ] **Step 3: 运行哈希确定性测试**

Run: `npx vitest run src/core/state/hash.test.ts`
Expected: 哈希值与重写前完全一致

- [ ] **Step 4: 运行全部测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P3.2 shadow 对象池

**Files:**
- Modify: `src/render/core/shadow_reader.ts`

- [ ] **Step 1: 为每个 read 函数添加可复用 shadow 实例**

模块级持有 pooledMainUiShadow 等实例，每帧更新字段值而非 new 新对象。

注意：items 数组等集合类型需要复用数组对象（原地更新内容而非新数组），否则 GC 压力只是从"对象"转移到"数组"。

- [ ] **Step 2: 确认 render 层不跨帧持有 shadow 引用**

检查所有 panel.update 方法：shadow 参数只在方法内同步消费，不保存到 panel 实例字段上。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P3.3 daily/session view 脏标记缓存

**Files:**
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 添加 view 缓存字段**
- [ ] **Step 2: 在 tick 推进后标记脏**
- [ ] **Step 3: build 函数检查脏标记**
- [ ] **Step 4: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P3.4 stockpile.history 环形缓冲区

**Files:**
- Modify: `src/core/simulation/resource_system.ts`
- Modify: `src/core/state/world_state.ts`
- Modify: `src/core/state/hash.ts`
- Modify: `src/core/simulation/state_manager.ts`

- [ ] **Step 1: ResourceStockpile.history 改为环形缓冲结构**

在 world_state.ts 中，把 `history: { tick: number; delta: Fixed }[]` 改为包含环形指针的结构：

```typescript
history: {
  buf: Array<{ tick: number; delta: Fixed }>;
  head: number;
  count: number;
};
```

M1 简化方案（不改 world_state 结构）：HISTORY_LIMIT=70 很小，shift 的 O(n) 代价约 70 次赋值，影响极小，可跳过。如果要改，需同步修改 hash 序列化顺序和 snapshot 深拷贝逻辑。

**优先级评估**：因 HISTORY_LIMIT=70 且每 tick 只 shift 一次，总开销 < 70 次整数赋值/tick，远小于其他热点。**本任务降级为 P4 可选**。

---

## P3.5 factory activeFactoryCount 增量维护

**Files:**
- Modify: `src/core/simulation/factory_system.ts`
- Modify: `src/core/state/world_state.ts`

- [ ] **Step 1: ProductionTask 增 activeFactoryCount 字段**
- [ ] **Step 2: assignTask/unassign 时增量更新**
- [ ] **Step 3: produceTick 直接使用**
- [ ] **Step 4: 运行回归测试**

**优先级评估**：M1 阶段 assignedFactoryIds 通常 < 10，遍历开销极小。**降级为 P4 可选**。

---

## P3.6 cloneSortedMap 批量构造优化

**Files:**
- Modify: `src/core/determinism/sorted_map.ts`
- Modify: `src/core/simulation/state_manager.ts`

- [ ] **Step 1: 为 SortedMap 添加批量构造能力**

添加静态方法或构造函数支持从已排序的 entries 直接构造，不走 set 方法：

方案 A（推荐）：添加构造函数参数：
```typescript
constructor(entries?: [K, V][]) {
  if (entries) {
    // 假设 entries 已按 key 升序排列
    for (const [k, v] of entries) {
      this.keys.push(k);
      this.store.set(k, v);
    }
    // P2.3 完成后还要填充 this.values
    this.dirty = false;
  }
}
```

方案 B：添加 `fromSortedEntries` 静态方法。

- [ ] **Step 2: 重构 cloneSortedMap 使用批量构造**

在 P2.3（values 平行数组）完成后，cloneSortedMap 改为：
```typescript
function cloneSortedMap<K extends string | number, V>(
  src: SortedMap<K, V>,
  cloneVal: (v: V) => V,
): SortedMap<K, V> {
  const entries: [K, V][] = [];
  src.forEach((v, k) => { entries.push([k, cloneVal(v)]); });
  return new SortedMap(entries);
}
```

注意：forEach 已保证 key 升序，所以 entries 是排好序的，新 SortedMap 不需要再 sort（dirty=false）。

如果暂时不做 P2.3，可先不做 P3.6（等 P2.3 落地后一起做）。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P3.7 pendingActions 数组复用

**Files:**
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 提升 pendingActions 为类字段**

在 GameRunner 类中添加：
```typescript
private readonly pendingActions: PlayerAction[] = [];
```

- [ ] **Step 2: stepFrame 中复用数组**

把 stepFrame 中的 `const pendingActions: PlayerAction[] = [];` 改为使用 this.pendingActions，在 while 循环开始前清空：
```typescript
this.pendingActions.length = 0;
while (this.accumulator >= TICK_MS && processed < MAX_CATCHUP_TICKS) {
  const result = this.simulation.tick(this.currentFrameId++, this.pendingActions);
  this.pendingActions.length = 0;
  // ...
}
```

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P4.1 beijingDateKey 秒级缓存

**Files:**
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 添加秒级缓存**
- [ ] **Step 2: 替换 beijingDateKey(Date.now()) 调用**
- [ ] **Step 3: 运行回归测试**

---

## P4.2 applyAction/building itemId 反向索引

**Files:**
- Modify: `src/core/simulation/building_system.ts`

- [ ] **Step 1: 添加 itemIndex Map**
- [ ] **Step 2: enqueue 时建立索引**
- [ ] **Step 3: cancel / 建筑完成时清理索引**
- [ ] **Step 4: cancel 用索引 O(1) 查找**
- [ ] **Step 5: 运行回归测试**

---

## P4.3 getPlayerCountryId 缓存

**Files:**
- Modify: `src/render/core/shadow_reader.ts`

- [ ] **Step 1: 添加模块级缓存变量**
- [ ] **Step 2: getPlayerCountryId 优先返回缓存**
- [ ] **Step 3: 运行回归测试**

---

## P4.4 oneClickBalance includes 改 Set

**Files:**
- Modify: `src/core/simulation/factory_system.ts`

- [ ] **Step 1: 把 assignedFactoryIds 改为同时维护 Set**

或在 oneClickBalance 中用 Set 临时去重。

- [ ] **Step 2: 运行回归测试**

---

## P4.5 Encoder.string 短字符串缓存

**Files:**
- Modify: `src/core/state/hash.ts`

- [ ] **Step 1: 预编码常用枚举字符串**

模块级添加预编码缓存：
```typescript
const CACHED_STRINGS = new Map<string, Uint8Array>();
function encodeString(s: string): Uint8Array {
  let cached = CACHED_STRINGS.get(s);
  if (cached) return cached;
  const utf8 = unescape(encodeURIComponent(s));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i) & 0xff;
  CACHED_STRINGS.set(s, bytes);
  return bytes;
}
```

在 Encoder.string 中使用 encodeString，先写 length 再写 bytes。但注意 P3.1 Encoder 重写为 Uint8Array 后，直接 this.buf.set(bytes, this.offset) 更高效。

M1 简化：哈希只在每 16 帧执行一次，字符串编码耗时占比低，此任务优先级低。

- [ ] **Step 2: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P4.6 eventToAction 修正

**Files:**
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 修改 SessionGoalTracker.updateProgress 接受事件类型**

查看 session_goal_tracker.ts 的 updateProgress 方法签名。如果它只需要 event.kind，直接传 ev.kind 或 ev 对象。

- [ ] **Step 2: 删除假 eventToAction 方法**

把 game_runner.ts 中 328-333 行的 eventToAction 删除，改为：
```typescript
for (const ev of result.events) {
  this.sessionTracker.updateProgress(ev as any);
}
```
或根据实际接口签名调整。

- [ ] **Step 3: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## P4.7 formatReward/formatSessionReward 字符串模板缓存

**Files:**
- Modify: `src/game/game_runner.ts`

- [ ] **Step 1: 缓存格式化结果**

M1 阶段每日任务/会话目标数量少（≤3+3），formatReward 每帧最多调用 6 次，每次 join 2-3 个字符串，开销极小。可暂不做。如需优化，可在 DailyTask/SessionGoal 对象上缓存 `rewardSummary` 字段，仅在奖励变化时重新计算。

- [ ] **Step 2: 运行回归测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全过

---

## 完成后总结

- [ ] **Final: 运行完整回归**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 零错误，vitest 全过

- [ ] **Final: grep 验证所有旧模式清除**

运行以下命令确认优化到位：
```
grep -rn "Fixed.fromInt([0-9])" src/core/ | grep -v "fromInt(1000)\|fromInt(100)\|fromInt(60000)\|fromInt(90000)\|fromInt(864)\|fromInt(10)\|fromInt(2)\|const FIXED"
grep -n "new Fixed.*\.raw" src/core/simulation/state_manager.ts
grep -n "this.store.get" src/core/determinism/sorted_map.ts
grep -n "buf.push" src/core/state/hash.ts
grep -c "state.countries.forEach" src/core/simulation/simulation.ts
grep -c "this.tree.tick" src/core/simulation/assistant.ts
```
Expected: 无 Fixed.fromInt(1)/fromInt(0) 等单数字常量；state_manager 无 new Fixed(x.raw)；sorted_map forEach 内无 store.get；hash Encoder 无 buf.push；simulation.ts 只有 1 个 state.countries.forEach（在 tick 中）；assistant.ts 中 tree.tick 只出现 1 次（在 tickAndApply 中）。

- [ ] **Final: 更新 tasks.md 标记所有完成项**
