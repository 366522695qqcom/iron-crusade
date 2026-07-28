# 渲染层影子读取性能优化 Spec（perf-shadow-aggregation）

> 依赖：feature-douyin-login + feature-grand-war (M5) 已落地，确定性测试全绿（99个测试通过）。
> 影响代码：`src/render/core/shadow_reader.ts`、`src/game/game_runner.ts`

## 1. 背景与问题

在 M5 入侵系统 + 抖音登录 完成后，对 `shadow_reader.ts` 和 `game_runner.pushShadows()` 进行代码审计，发现**每帧(10Hz)存在严重的重复遍历问题**，这是当前最易优化且收益最大的性能热点：

### 当前遍历统计（单帧）

| 遍历对象 | 次数 | 位置 |
|---------|------|------|
| `state.divisions.forEach` | **5次** | shadow_reader.ts:644,666,757,923,941 |
| `state.provinces.forEach` | **2次** | shadow_reader.ts:637,752 |
| `state.disputes.forEach` | **3次** | shadow_reader.ts:649,714,733 |
| `state.factories.forEach` | **2次** | shadow_reader.ts:528 + game_runner.ts:671 |
| **嵌套遍历 fronts→divisions** | O(n²) | shadow_reader.ts:657-670 |
| **新建数组(GC压力)** | 6+ 次数组/对象 | readMapDivisionViews/readCombatBubbles 每次new数组 |

**问题本质**：每帧 10Hz 调用 pushShadows()，分别调用 `readMainUiShadow`、`readCombatPanelShadow`、`readWarOverviewShadow`、`readUnitCommandShadow`、`readMapDivisionViews`、`readCombatBubbles`，每个函数独立遍历 divisions/provinces/disputes，**总共 13+ 次全表扫描**。

随着实体规模增长（师团从1→20+，未来M3/M4加入海空军），重复遍历开销线性放大。

## 2. 优化目标

| 指标 | 当前 | 目标 |
|------|------|------|
| divisions 遍历/帧 | 5次 | **1次** |
| provinces 遍历/帧 | 2次 | **1次** |
| disputes 遍历/帧 | 3次 | **1次** |
| factories 遍历/帧 | 2次 | **1次** |
| 嵌套O(n²)遍历 | 存在 | **消除（建立临时索引）** |
| 每帧数组/对象分配 | 6+ 新建 | **0（对象池复用）** |
| 游戏逻辑确定性 | 不变 | **完全一致（99测试全过）** |

**硬约束**：
- 不修改 core/ 层任何仿真逻辑（保持确定性）
- 不修改任何shadow数据结构的字段语义（UI层零感知）
- 所有现有测试必须继续通过

## 3. 优化方案

### 核心思路：单次遍历聚合（Single-Pass Aggregation）

新增 `readFrameShadows()` 函数，**一次遍历**填充所有 shadow 对象，同时建立临时索引消除O(n²)。

### 3.1 新增 pooled 数组池

在 `shadow_reader.ts` 模块级新增可复用数组：

```typescript
// MapDivisionView 池（预分配，支持最多200个师团）
const pooledMapDivisions: MapDivisionView[] = [];
for (let i = 0; i < 200; i++) {
  pooledMapDivisions.push({
    divisionId: 0, ownerId: '', provinceId: 0,
    status: 'ready', isSelected: false, strength: 0, organization: 0,
  });
}

// CombatBubbleView 池
const pooledCombatBubbles: CombatBubbleView[] = [];
```

### 3.2 省份→师团临时索引

在单次遍历中构建 `provinceDivIndex: Map<number, number[]>`（provinceId → divisionId[]），用于：
- readCombatPanelShadow 中前线师团统计（消除 fronts 内的 divisions.forEach）
- 未来省份兵力统计复用

索引在 `readFrameShadows()` 开始时清空并在 divisions 遍历中填充，生命周期仅一帧。

### 3.3 单次遍历聚合实现

新增 `readFrameShadows()` 函数结构：

```
readFrameShadows(state, countryId, shadows) {
  1. 清空所有 pooled 数组 length=0
  2. 清空临时索引 provinceDivIndex
  3. 一次性收集：
     - playerCountry 信息（从state.countries.get，无需遍历）
     - disputes 遍历一次：收集敌方ID、投降进度、战争日志
  4. provinces 遍历一次：统计VP、controlledProvinces计数
  5. divisions 遍历一次：
     - 统计己方/敌方师团存活数
     - 填充 pooledMapDivisions（复用对象池）
     - 构建战斗泡泡（fighting状态师团统计）
     - 填充 provinceDivIndex 索引
     - 统计selected师团信息用于unitCommand
  6. factories 遍历一次：统计idleCount、playerCivIds等（同时给factory panel和building panel用）
  7. 使用临时索引计算 fronts 师团数（消除嵌套遍历）
  8. 填充所有 out shadows 字段
}
```

### 3.4 game_runner.pushShadows() 改造

- 删除 game_runner.ts 中对 factories 的重复遍历（L671-678），复用 shadow_reader 中已统计的 playerCivIds
- 所有 `readMapDivisionViews`/`readCombatBubbles` 改为传入 pooled 数组参数
- 删除 `getPlayerCountryId` 的重复调用（已有 `this.countryId`）

### 3.5 pooled 数组扩容策略

对象池初始容量按当前实体规模预留（师团200，泡泡50）；若实际实体超过容量，动态 push 新对象到池中（一次性分配，后续帧复用）。

## 4. 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/render/core/shadow_reader.ts` | 新增 `readFrameShadows()`；新增 pooled MapDivisionView/CombatBubbleView 数组池；readMapDivisionViews/readCombatBubbles 增加 out 参数支持复用；导出所有 pooled 对象 |
| `src/game/game_runner.ts` | pushShadows() 改为调用 `readFrameShadows()`；删除重复 factories 遍历；使用 pooled 数组替代每次 new |

## 5. 验收标准

1. `npx tsc --noEmit` 退出码 0
2. `npx vitest run` 99个测试全部通过
3. shadow_reader.ts 中：
   - `state.divisions.forEach` 全局仅出现 **1次**（在readFrameShadows中）
   - `state.provinces.forEach` 全局仅出现 **1次**
   - `state.disputes.forEach` 全局仅出现 **1次**
   - `state.factories.forEach` 全局仅出现 **1次**
   - 无 fronts 内层嵌套 divisions.forEach
4. game_runner.ts 中无 `this.state.factories.forEach` 调用
5. readMapDivisionViews/readCombatBubbles 不再在函数内部新建数组（使用out参数）
6. 功能等价：playthrough 测试（建造→生产→招兵→战斗→投降）日志输出完全一致
