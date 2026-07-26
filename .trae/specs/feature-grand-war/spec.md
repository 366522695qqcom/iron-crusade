# Spec: 战争总面板 + 投降倾向 + 补给 + 海军 + 空军 + 登陆作战（feature-grand-war M1~M6）

> 变更类型：功能扩展（大型功能，分6个里程碑交付）
> 前置依赖：feature-combat-skeleton（师团/前线/争端骨架）、feature-factory-economy（军工生产）
> 目标：复刻HOI4级别的海陆空三军协同作战体验，包含战争总面板（双方投降倾向+损失统计+战争日志）、补给系统、海军完整舰队、空军完整联队、登陆作战。本版本聚焦**玩家vs敌国**的对抗，不做多国阵营/召唤盟友（后续迭代可加）。分6个里程碑独立交付，每个里程碑结束时都是可玩的增量。

---

## Why

当前系统存在以下缺口：

1. **战争信息不透明**：现有combat_panel只显示前线/决心，没有HOI4那种"战争总览"面板，看不到双方投降进度、累计损失、战争日志
2. **投降机制简陋**：现有disputeResolve是0-1决心值，<0.1就投降，缺少"投降倾向百分比"累计，没有丢VP/丢首都/被歼师团等多因素驱动
3. **无补给系统**：Division.supply字段恒为1.0，永远满补给，师团跨大陆/跨海作战无惩罚，没有"补给线"概念
4. **无海军**：research有naval线但无舰船实体、无舰队、无海域、无制海权、无登陆
5. **无空军**：没有任何空军相关实体/系统，无法制空、近距支援、炸舰
6. **无登陆**：沿海省与内陆省无区别，无法跨海两栖作战
7. **海陆空无协同**：舰炮对岸支援、空优CAS、海空掩护登陆都不存在

用户核心诉求（按原话）：
- "在游戏里面添加某个国家的投降倾向，百分比百分百的时候就投降"
- "这个投降倾向加在一个总面板上，仿造一下钢铁雄心4"
- 面板显示**己方和敌方的装备/舰船/飞机/运输船损失**（不显示阵亡人数，保持S.2脱敏）
- "派战舰派过去，为我的运输船保驾护航获得制海权，再派空军协同保障，然后登陆"
- "补给从首都配送到全国各地，最近如果没有补给就用运输船运送，海军和空军可以保障运输船运输，只有港口才能接收补给"
- 本版本**不做盟友/召唤盟友系统**，聚焦玩家vs单一敌国的对抗体验

---

## Milestones Overview

| 里程碑 | 名称 | 核心交付 | 依赖 | 估新文件 |
|---|---|---|---|---|
| **M1** | 战争总面板+投降倾向+陆军命令条+战斗泡泡 | WarOverviewPanel + surrenderProgress系统 + 单位选中 + UnitCommandBar（仿HOI4）+ CombatBubble + 战争日志 | 无 | 4 |
| **M2** | 补给系统 | SupplyNetwork + 陆路BFS传播 + 港口接收 + 断补惩罚 + dockyard建筑 | M1 | 6 |
| **M3** | 海军完整系统 | 4类舰船+舰队实体+船坞生产+海域+训练派遣+海战+制海权+对岸炮击+海运护航 | M2 | 8 |
| **M4** | 空军完整系统 | 4类飞机+联队实体+军厂造机+机场+空域+训练+空战+制空权+CAS/对海打击 | M2（M3后联动对海） | 7 |
| **M5** | 登陆作战（三军协同） | InvasionPlan+准备/条件检查/运输船/登陆骰子/击退/成功+登陆后补给压力 | M3+M4 | 4 |
| **M6** | 和谈+AI+收尾 | peaceConference+附庸+AI海空军行为+战争日志完善+平衡 | M5 | 4 |

每个M结束都必须通过：TypeScript类型检查、全量单元测试、playthrough测试扩展、双实例确定性hash一致。

---

## M1：战争总面板 + 投降倾向

### 1.1 数据模型扩展

**WorldState 新增字段**：
```typescript
/** 国家累计损失（面板显示，不影响逻辑） */
warLosses: SortedMap<string, CountryWarLosses>;
/** 战争日志环形缓存，最近50条 */
warLog: WarLogEntry[];
```

```typescript
interface CountryWarLosses {
  countryId: string;
  divisionsLost: number;
  shipsLost: Record<string, number>;   // type -> count（M3用）
  aircraftLost: Record<string, number>; // type -> count（M4用）
  convoysLost: number;                 // 运输船（M3用）
  provincesLost: number;
  majorCitiesLost: number;             // 丢失VP省份数
  capitalLost: boolean;
}

interface WarLogEntry {
  tickId: number;
  kind: 'province_captured' | 'division_destroyed' | 'ship_sunk' | 'aircraft_lost' | 'convoy_sunk' | 'surrender' | 'naval_battle' | 'air_battle' | 'invasion';
  countryId: string;
  text: string;  // 中文描述（渲染用，如"我方占领「XX省」"）
  /** 关联省/舰队/联队id，方便面板做tooltip */
  relatedIds?: { provinceId?: number; fleetId?: number; wingId?: number; };
}
```

**Dispute 扩展**：
```typescript
interface Dispute {
  // ...现有字段保留
  /** 双方投降倾向 0-1（0%~100%），达到surrenderThreshold时投降 */
  surrenderProgress: Record<string, Fixed>;
  /** 双方投降阈值（主要国0.8，次要国0.6） */
  surrenderThreshold: Record<string, Fixed>;
}
```

**S.2 脱敏说明**：现有 `disputeResolve` 字段保留但**不再**用于投降判定，仅作为"抵抗意志"面板展示值；真正的投降判定改用 `surrenderProgress >= surrenderThreshold`。

### 1.2 SurrenderSystem（新文件：`core/simulation/surrender_system.ts`）

**接口定义**（加入 `core/simulation/interfaces.ts`）：
```typescript
interface SurrenderSystem {
  /** 争端开始时初始化双方投降倾向为0 */
  initDisputeSurrender(state: WorldState, dispute: Dispute): void;
  /** 每tick推进：根据损失/丢地/首都状态增长surrenderProgress */
  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[];
  /** 手动加贡献（师团被歼、舰船损失等事件调用） */
  addContribution(state: WorldState, disputeId: string, countryId: string, delta: Fixed, reason: string): void;
  /** 记一条战争日志（面板显示） */
  appendWarLog(state: WorldState, entry: WarLogEntry): void;
  /** 查询某国当前投降倾向（0-1） */
  getSurrenderProgress(state: WorldState, disputeId: string, countryId: string): Fixed;
}
```

**投降倾向增长规则**（每tick累计）：

| 因素 | 贡献值 | 说明 |
|---|---|---|
| VP丢失基数 | 0.0001 × (丢失VP/总VP)/tick | 持续项 |
| 首都沦陷 | +0.002/tick（每tick+0.2%） | 首都被占时高速涨 |
| 主要城市丢失 | +0.0003/个/tick | 每个VP省额外加 |
| 师团被歼 | +0.02/个（一次性） | 调用addContribution |
| 舰队被歼 | +0.03/capital、+0.01/screen、+0.05/carrier（一次性，M3用） | M3再实现 |
| 飞机损失 | +0.001/10架（一次性，M4用） | M4再实现 |
| 断补debuff | 过半省份断补时+0.0005/tick（M2用） | M2再实现 |

**投降触发**：
- `surrenderProgress[cid] >= surrenderThreshold[cid]` 时发 `surrendered` 事件
- 对方（另一方）立即获胜，发 `disputeResolved` 事件
- 战败方所有军队disband，所有省份控制权移交胜利方
- 战争结束（进入peaceConference，M6实现）

**新 GameEvent**：
```typescript
| { kind: 'surrendered'; countryId: string; disputeId: string; }
```

战争日志WarLogEntry在surrender_system中统一维护（appendWarLog），各系统在产生关键事件时调用。

### 1.3 WarOverviewPanel（新文件：`render/ui/panels/war_overview_panel.ts`）

仿HOI4战争进度对话框，从顶部栏战争徽章点击弹出（模态面板，关闭后回到游戏）。本版本聚焦**玩家 vs 敌方**的双边对抗展示。

**面板布局（460×580）**：
```
┌───────────────────────────────────────────────────────────┐
│  区域争端                         [×]                      │
├────────────────────────────┬──────────────────────────────┤
│  [我国国旗+国名]            │  [敌方国旗+国名]              │
│  ──────────────────────    │  ──────────────────────       │
│  投降 ████████░░ 72%       │  投降 ███░░░░░ 28%            │
│  (红色进度条)              │  (红色进度条)                 │
│                            │                              │
│  兵力统计:                 │  兵力统计:                    │
│  师团: 15                  │  师团: 12                     │
│  舰队: 0  联队: 0          │  舰队: 0  联队: 0             │
│                            │                              │
│  损失统计:                 │  损失统计:                    │
│  师团损失: 3               │  师团损失: 5                  │
│  舰船损失: 0               │  舰船损失: 0                  │
│  飞机损失: 0               │  飞机损失: 0                  │
│  运输船损失: 12            │  运输船损失: 8                │
│  丢失省份: 3 (含VP:0)      │  丢失省份: 5 (含VP:1)         │
│  首都: 未失                │  首都: 未失                   │
│                            │                              │
│  控制VP: 25/60 (42%)       │  控制VP: 20/60 (33%)          │
│  ████████████░░░░░░░░      │  ████████░░░░░░░░░░           │
├───────────────────────────────────────────────────────────┤
│  战争日志（最近10条）                                       │
│  ▸ T7256 我方占领「敌边境省」                                │
│  ▸ T7320 敌方师团被歼灭                                     │
│  ▸ T7500 敌首都被围，投降倾向+15%                           │
│  ▸ T7800 敌方投降，我方胜利！                               │
└───────────────────────────────────────────────────────────┘
```

**字段数据源**：
- 双方国名/国旗：dispute.participants（initiator vs target）
- 投降条：SurrenderSystem.getSurrenderProgress，颜色黄→橙→红渐变；满100%时灰显+显示"已投降"
- 兵力统计：按ownerId聚合state.divisions/fleets/wings计数
- 损失：CountryWarLosses各字段
- VP控制：dispute.controlledVPs
- 战争日志：state.warLog 最近10条，按tickId倒序；己方绿色文字，敌方红色文字

**按钮**：
- 本面板无操作按钮（操作都在地图/命令条里）；M6加和谈按钮

**现有面板关系**：
- combat_panel（作战指挥）保留，不删；但陆军微操改由"陆军命令条"（选中师团后底部弹出）承担
- diplomacy_panel 保留"贸易/争端"按钮，新增"战争总览"按钮（仅在参战时可见）
- top_bar 新增战争徽章（参战时显示，点之打开WarOverviewPanel）

### 1.4 受影响文件清单（M1）

- **New files**:
  - `src/core/simulation/surrender_system.ts`（DefaultSurrenderSystem，含warLog维护）
  - `src/render/ui/panels/war_overview_panel.ts`（WarOverviewPanel）
  - `src/render/ui/unit_command_bar.ts`（UnitCommandBar 陆军命令条，选中师团后底部横排按钮）
  - `src/render/map/combat_bubble.ts`（CombatBubble 战斗泡泡，交火省边境显示）
- **Affected files**:
  - `src/core/state/world_state.ts`（新增CountryWarLosses/WarLogEntry类型；WorldState新增warLosses/warLog；Dispute新增surrenderProgress/surrenderThreshold；Division新增status等状态字段用于bubble）
  - `src/core/simulation/interfaces.ts`（新增SurrenderSystem接口）
  - `src/core/simulation/types.ts`（GameEvent新增surrendered；新增WarLogEntry类型）
  - `src/core/simulation/simulation.ts`（注入SurrenderSystem；主循环调用surrenderSystem.advanceTick；dispute创建时调用initDisputeSurrender）
  - `src/core/simulation/combat_system.ts`（provinceControlled/师团被歼时调用surrenderSystem.addContribution+appendWarLog；disputeResolved后战败方军队disband+省份移交；战斗状态标记供bubble使用）
  - `src/core/simulation/division_system.ts`（师团被歼时调用addContribution+appendWarLog）
  - `src/core/simulation/state_manager.ts`（clone warLosses/warLog等新字段）
  - `src/core/state/hash.ts`（序列化新字段）
  - `src/render/core/shadow_reader.ts`（新增readWarOverviewShadow + readSelectedUnitShadow + readCombatsShadow）
  - `src/render/ui/main_ui.ts`（挂载WarOverviewPanel+UnitCommandBar；顶部徽章入口）
  - `src/render/ui/top_bar.ts`（战争徽章按钮）
  - `src/render/ui/panels/diplomacy_panel.ts`（新增"战争总览"入口）
  - `src/render/map/map_view.ts`（挂载CombatBubble层；师团点击选中）
  - `src/render/map/map_interaction.ts`（新增selectUnit模式，支持点击师团选中）

### 1.5 M1验收标准

- [ ] 宣战后WarOverviewPanel可打开，双方国名+投降条+兵力+损失+VP+战争日志显示正确
- [ ] 丢VP/丢首都/歼师团会让投降倾向按规则上涨（单元测试断言数值）
- [ ] 投降倾向达阈值时发surrendered事件，战败方军队disband，省份移交，disputeResolved
- [ ] 战争日志正确记录关键事件（省占领/师团被歼/投降等），按tick倒序，颜色区分己方/敌方
- [ ] top_bar战争徽章在参战时可见，点击打开/关闭面板
- [ ] diplomacy_panel有"战争总览"入口
- [ ] 点击师团可选中（Shift/Ctrl多选/框选），选中后底部显示陆军命令条，未选中/按Esc时隐藏
- [ ] 命令条左侧显示师团信息：图标+名称+兵力条+组织度条+补给状态+当前状态（多选显示数量+平均值）
- [ ] 命令条按钮M1可用：移动、进攻、前线、防御线、撤退、停止、强攻、拆分、合并
- [ ] 命令条按钮M1灰显占位（带锁图标）：保卫港口、两栖登陆、空降、补给优先
- [ ] 按钮悬停有tooltip+快捷键提示，点击后高亮并进入对应模式，右键/Esc取消模式
- [ ] 快捷键可用：Q进攻/W前线/E防御线/R撤退/H停止；右键默认移动
- [ ] 拆分/合并：一个师团可拆为两个50%不满编师团，两个不满编师团可合并为一个
- [ ] 交火省边境显示战斗泡泡，颜色反映战局占优方
- [ ] 点击泡泡弹出战斗详情面板（师团数/攻防/组织度/兵力）
- [ ] TypeScript tsc --noEmit无错
- [ ] 新增单元测试≥15个（surrender_system增长/触发 + war_overview_panel渲染 + combat_bubble显示），所有测试通过
- [ ] playthrough测试扩展：开局→开战→点师团命令条指挥进攻→点泡泡看战况→占VP→打到敌国100%投降
- [ ] 双实例300帧hash一致

---

## M2：补给系统（首都辐射+海运+港口接收）

> 注：M2的海运路线先不要求海军护航（护航M3实现），仅按"首都港口→地方港口"基础运输，运输船在无护航时也能运作，但有被敌方未来海空军拦截的接口预留。

### 2.1 数据模型

**WorldState 新增字段**：
```typescript
supplyNetwork: SupplyNetwork;
```

```typescript
interface SupplyNetwork {
  /** 省份补给状态 */
  provinceSupply: SortedMap<number, ProvinceSupply>;
  /** 海运路线 */
  seaSupplyRoutes: SeaSupplyRoute[];
  /** 最近一次补给更新tick */
  lastRecalcTick: number;
}

interface ProvinceSupply {
  provinceId: number;
  level: Fixed;          // 0-1 当前补给水平
  demand: Fixed;         // 该省驻扎师团需求
  received: Fixed;       // 实际到达
  viaPort: boolean;      // 是否通过港口接收海运
  /** 最近300tick被轰炸标记（M4用） */
  bombedUntilTick: number;
}

interface SeaSupplyRoute {
  id: string;
  ownerId: string;
  fromPortId: number;         // 出发港口省
  toPortId: number;           // 目的港口省
  pathSeaZoneIds: number[];   // 途径海域（M3填）
  convoysAssigned: number;
  efficiency: Fixed;          // 0-1
  escortFleetIds: number[];   // 护航舰队（M3填）
}
```

**Province 扩展字段**：
```typescript
interface Province {
  // ...现有
  portLevel: number;     // 港口等级（dockyard建筑等级 ≥1时启用；0=无港口）
}
```

**Division扩展**：
```typescript
interface Division {
  // ...现有supply字段保留
  supplyStatus: 'ok' | 'low' | 'critical' | 'none';  // 派生值
}
```

**BuildingType 新增**：`dockyard`（船坞/港口，既作为M3生产舰船的建筑，也是M2港口接收入口）、`supply_hub`（补给中心/铁路枢纽）
**FactoryType 新增**：`dockyard`（船坞工厂类型，M3用来造舰船；M2阶段先作为港口等级标记）

### 2.2 SupplySystem（新文件：`core/simulation/supply_system.ts`）

```typescript
interface SupplySystem {
  /** 每N tick重算一次BFS（每60tick=每6秒游戏时间重算，性能优化） */
  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[];
  /** 强制立刻重算（省份易主、新占港口等事件后调用） */
  recalc(state: WorldState): void;
  /** 获取师团当前有效补给debuff（返回进攻乘子 0-1） */
  getDivisionSupplyModifier(state: WorldState, divisionId: number): Fixed;
  /** 为跨海到toPort创建/更新海运路线（内部判断是否需要） */
  ensureSeaRoute(state: WorldState, countryId: string, toPortId: number): SeaSupplyRoute | null;
}
```

### 2.3 补给流动规则

**陆地补给传播（BFS）**：
- 源点：首都省份注入供给量 = 3 + 民用工厂数 × 0.5（工业产能决定供给总量）
- 传播：从首都BFS遍历己方控制省份
- 传递率 = 0.5 + infra × 0.05（infra=0时50%，infra=10时100%）
- supplyHub省份传递率强制=1.0（中继节点）
- 师团消耗：每师团每tick消耗0.01单位补给
- 省份接收补给 = 传进来的补给 - 本省师团消耗；剩余继续传递

**海运补给**：
- 触发条件：目标省portLevel≥1（有dockyard）且陆路补给（经BFS到达的）不足demand的50%
- 路线生成：首都港口（最近的己方dockyard省）→目标港口，pathSeaZoneIds先留空（M3填）
- 需要运输船：convoysAssigned = portLevel × 5（不足时效率按比例下降）
- 基础效率 = 1.0；M2阶段无拦截，固定为1.0（M3加入海空拦截后会降低）
- 被轰炸时（bombedUntilTick>tickId）效率×0.5

**断补惩罚**（师团维度，在combat_system和division_system中应用）：
- supply≥0.7：ok，无惩罚
- 0.3≤supply<0.7（low）：organization恢复-50%，进攻骰子-20%
- 0.1≤supply<0.3（critical）：organization每日-0.05，进攻骰子-50%，无法发起新攻势
- supply<0.1（none）：organization每日-0.15，strength每日-0.05，自动retreating

### 2.4 受影响文件清单（M2）

- **New files**:
  - `src/core/simulation/supply_system.ts`（DefaultSupplySystem）
- **Affected files**:
  - `src/core/state/world_state.ts`（新增SupplyNetwork/ProvinceSupply/SeaSupplyRoute；Province加portLevel；BuildingType/FactoryType加dockyard/supply_hub）
  - `src/core/simulation/interfaces.ts`（SupplySystem接口）
  - `src/core/simulation/simulation.ts`（注入SupplySystem；主循环每tick调用）
  - `src/core/simulation/combat_system.ts`（进攻骰子乘以getDivisionSupplyModifier；无法发起新攻势检查）
  - `src/core/simulation/division_system.ts`（断补时org/str衰减）
  - `src/core/simulation/building_system.ts`（dockyard/supply_hub建造逻辑；dockyard建成时设置省portLevel；调用supplySystem.recalc）
  - `src/core/simulation/surrender_system.ts`（过半省份断补时涨投降倾向，接入addContribution接口）
  - `src/core/simulation/state_manager.ts`/`hash.ts`（新字段克隆/哈希）
  - `src/render/ui/panels/...`（省地图上显示补给状态颜色：绿/黄/红/灰）
  - `src/core/types.ts`（BuildingType/FactoryType加入新成员）

### 2.5 M2验收标准

- [ ] 首都附近省份满补给，远离首都的省份按距离/infra衰减
- [ ] 敌方占领一个省后，该省之后的己方省份补给被切断
- [ ] 沿海dockyard省份可接收海运补给，陆路被切断时仍有补给
- [ ] 师团在断补省份时org/str按规则衰减，进攻骰子有惩罚
- [ ] supplyHub省份能阻止衰减（中继）
- [ ] dockyard/supply_hub建筑可建造，建成后生效
- [ ] provinceControlled事件触发补给重算
- [ ] TypeScript无错，新增单元测试≥12个，全量测试通过
- [ ] playthrough扩展：远距离跨岛作战师团会面临断补压力
- [ ] 双实例hash一致

---

## M3：海军完整系统

### 3.1 舰船装备（4类）

| 类型ID | 名称 | 用途 | 生产工厂 | 解锁科技 |
|---|---|---|---|---|
| `convoy` | 运输船 | 海运补给/登陆运力 | dockyard | 开局 |
| `screen` | 屏卫舰 | 护航/反潜/巡逻/屏卫主力 | dockyard | nav_1,nav_2 |
| `capital` | 主力舰 | 舰队决战/对岸炮击 | dockyard | nav_3,nav_4,nav_5(battleship) |
| `carrier` | 航母 | 舰载机平台，超视距打击 | dockyard | nav_6(carrier) |

屏卫包含：驱逐舰+轻巡（统一为screen，screen数量作为屏卫线计算依据）
主力包含：重巡+战巡+战列舰（统一为capital，主力对决核心）
航母单独一类，可搭载naval_fighter联队（M4舰载机）

EquipmentPool 扩展这4种装备类型。
ProductionTaskType 新增：`ship_convoy`/`ship_screen`/`ship_capital`/`ship_carrier`，由dockyard类型工厂生产。

### 3.2 新地形/新区域

**SeaZone 海域**（新实体）：
```typescript
interface SeaZone {
  id: number;
  name: string;
  adjacentProvinceIds: number[];    // 接壤沿海省
  adjacentSeaZoneIds: number[];     // 相邻海域
  presentFleetsByCountry: Record<string, number[]>; // 执行任务的舰队
  seaControl: Record<string, Fixed>; // 制海权0-1
}
```

**Province扩展**：`isCoastal` 已存在；新增 `adjacentSeaZoneIds: number[]`（相邻海域）

WorldState新增：
```typescript
seaZones: SortedMap<number, SeaZone>;
fleets: SortedMap<number, Fleet>;
```

开局地图数据需要为现有省配置seaZones（playthrough测试场景可用简化的2海域：近岸海+远海）。

### 3.3 Fleet 舰队实体

```typescript
type FleetStatus = 'training' | 'idle' | 'on_mission' | 'combat' | 'retreating';

interface Fleet {
  id: number;
  ownerId: string;
  name: string;
  ships: Record<string, number>;          // type -> count
  organization: Fixed;
  strength: Fixed;
  trainingProgress: Fixed;
  status: FleetStatus;
  homePortId: number;                     // 母港省（有dockyard的沿海省）
  currentSeaZoneId: number | null;        // null=在港
  mission: FleetMission | null;
}

type FleetMission =
  | { kind: 'patrol'; seaZoneId: number; }
  | { kind: 'strike_force'; seaZoneId: number; }
  | { kind: 'convoy_escort'; routeId: string; }  // 护航海运路线
  | { kind: 'hold'; seaZoneId: number; }          // 控制海域（登陆护航需要）
  | { kind: 'shore_bombardment'; provinceId: number; }; // 对岸炮击
```

### 3.4 NavalSystem（新文件：`core/simulation/naval_system.ts`）

```typescript
interface NavalSystem {
  /** 招募舰队（在dockyard省），消耗screen+capital+carrier装备，组织度0.3开始训练 */
  recruitFleet(state: WorldState, countryId: string, portProvinceId: number, composition: Record<string, number>, name: string): number | null;
  /** 指派任务 */
  assignMission(state: WorldState, fleetId: number, mission: FleetMission): boolean;
  /** 召回母港 */
  recallToPort(state: WorldState, fleetId: number): void;
  /** 每tick：训练推进、任务调度、海战判定、制海权计算、对岸炮击buff应用 */
  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[];
  /** 查询某海域的制海权（0-1） */
  getSeaControl(state: WorldState, seaZoneId: number, countryId: string): Fixed;
  /** 查询某省是否有对岸炮击支援（返回combatModifier） */
  getShoreBombardmentModifier(state: WorldState, provinceId: number, attackerId: string): Fixed;
}
```

**舰队招募成本**（M_CONFIG）：
- 1艘screen = 5 screen装备
- 1艘capital = 3 capital装备
- 1艘carrier = 2 carrier装备
- 招募基础政治点=50
- 训练时间=1200tick（120秒游戏时间，师团的2倍，体现舰队训练更久）

**海战判定**（骰子制，复用combat骰子风格）：
- 双方在同一海域都有on_mission舰队（patrol/strike/hold）即可能交战
- 屏卫效率 = min(screens我方, (capitals+carriers)*4) / ((capitals+carriers)*4)
  - 屏卫不足时，主力舰受到额外30%~70%伤害
- 主力输出：capitals × capital_soft_attack × strength × org + carriers × (舰载机战力，M4实现)
- 屏卫输出：screens × screen_attack，主要打对方屏卫
- 骰子：PRNG生成0.7~1.3系数
- 胜利方控制海域；失败方有舰队retreating返港
- 每支参战舰队损失一定比例ships（按战败程度）
- 发 `navalBattleEngaged` 事件+舰船计入CountryWarLosses.shipsLost

**制海权计算**：
- `seaControl[cid] = 该方舰队战力 / 所有方舰队战力之和`
- 无舰队时均为0；一方>50%获得该海域制海权
- 制海权≥60%才能满足M5登陆条件和M2海运护航

**对岸炮击（shore_bombardment）**：
- 舰队mission=shore_bombardment且provinceId相邻于当前海域
- 给该省的进攻方师团+20%进攻骰子（combat_system接入）
- 仅对沿海省生效

**海运护航联动M2**：
- seaSupplyRoute.escortFleetIds 有hold/convoy_escort任务舰队时：
  - 敌方潜艇/海轰袭击效率-50%（M4海轰会袭击运输船）
  - 运输船损失-70%
- 无护航但制海权≥60%：运输船损失率低
- 制海权<30%：运输船大量被击沉，海运效率暴跌

### 3.5 新 PlayerAction

```typescript
| { kind: 'recruitFleet'; portProvinceId: number; composition: Record<string, number>; name: string; }
| { kind: 'assignFleetMission'; fleetId: number; mission: FleetMission; }
| { kind: 'recallFleet'; fleetId: number; }
```

### 3.6 新 GameEvent

```typescript
| { kind: 'fleetRecruited'; fleetId: number; portProvinceId: number; }
| { kind: 'navalBattleEngaged'; seaZoneId: number; winnerCountryId: string | null; }
| { kind: 'shipSunk'; fleetId: number; shipType: string; count: number; }
| { kind: 'convoySunk'; countryId: string; count: number; seaZoneId: number; }
| { kind: 'gainedSeaControl'; seaZoneId: number; countryId: string; }
```

### 3.7 受影响文件（M3）

- **New files**:
  - `src/core/simulation/naval_system.ts`
  - `configs/sea_zones.json`（开局海域配置，playthrough场景先内置）
- **Affected files**:
  - `src/core/state/world_state.ts`（新增SeaZone/Fleet；WorldState加seaZones/fleets；Province加adjacentSeaZoneIds/portLevel）
  - `src/core/simulation/interfaces.ts`（NavalSystem接口）
  - `src/core/simulation/types.ts`（新action/event）
  - `src/core/simulation/factory_system.ts`（支持dockyard类型工厂生产ship_*任务）
  - `src/core/simulation/simulation.ts`（注入NavalSystem，主循环advanceTick）
  - `src/core/simulation/combat_system.ts`（接入getShoreBombardmentModifier到进攻骰子）
  - `src/core/simulation/supply_system.ts`（海运护航逻辑接入getSeaControl；运输船被击沉逻辑）
  - `src/core/simulation/surrender_system.ts`（舰船被歼时加投降贡献）
  - `src/core/simulation/state_manager.ts`/`hash.ts`（新字段）
  - `src/render/map/`（舰队渲染、海域着色、制海权透明度）
  - `src/render/core/shadow_reader.ts`（舰队/制海权shadow）
  - WarOverviewPanel（舰数列显示）

### 3.8 M3验收标准

- [ ] dockyard可建造，建成后可招募舰队
- [ ] 舰队训练→idle→派任务→on_mission状态转换正确
- [ ] 同一海域敌舰队相遇时发生海战，骰子结算，战败方损失舰船+retreating
- [ ] 制海权计算正确（按战力比例）
- [ ] shore_bombardment舰队对沿海省陆战给+20%buff
- [ ] 海运路线被护航时运输船损失显著低于无护航
- [ ] 舰船被击沉计入warLosses并触发投降贡献
- [ ] 运输船被击沉事件触发，影响海运效率
- [ ] 航母存在但无舰载机时战力打折（M4前为固定值）
- [ ] 新增单元测试≥20个，全量测试通过
- [ ] playthrough测试：造船→派舰队拿制海→炮击支援陆战
- [ ] hash一致

---

## M4：空军完整系统

对称M3，结构对齐。

### 4.1 飞机装备（4类）

| 类型ID | 名称 | 用途 | 生产工厂 | 解锁科技 |
|---|---|---|---|---|
| `fighter` | 战斗机 | 争夺制空权/拦截 | military_factory | air_1 |
| `cas` | 近距支援机 | 给陆军+30%进攻buff | military_factory | air_2 |
| `tactical_bomber` | 战术轰炸机 | 炸建筑/港口/对海打击 | military_factory | air_3 |
| `naval_fighter` | 舰载战斗机 | 航母搭载，海上制空/打舰 | military_factory | air_4 |

ProductionTaskType 新增：`air_fighter`/`air_cas`/`air_tactical_bomber`/`air_naval_fighter`，由military_factory（现有军厂）生产。

### 4.2 AirZone 空域

按省份聚合（类似HOI4的战略区域），每个空域覆盖若干省+若干海域。

```typescript
interface AirZone {
  id: number;
  name: string;
  provinceIds: number[];
  seaZoneIds: number[];
  presentWingsByCountry: Record<string, number[]>;
  airSuperiority: Record<string, Fixed>;
}
```

WorldState新增：`airZones: SortedMap<number, AirZone>; wings: SortedMap<number, AirWing>;`

**BuildingType新增**：`air_base`（机场），Province新增：`airBaseLevel: number;`（决定可驻扎联队数，每级1个联队，最高10级）

### 4.3 AirWing 空军联队

```typescript
type WingStatus = 'training' | 'idle' | 'on_mission' | 'combat' | 'retreating' | 'carrier_based';

interface AirWing {
  id: number;
  ownerId: string;
  name: string;
  aircraft: Record<string, number>;    // type -> count（100架=1联队满编）
  organization: Fixed;
  strength: Fixed;
  trainingProgress: Fixed;
  status: WingStatus;
  homeBaseId: number;                  // airBase省；carrier_based时是carrier的fleetId（特殊处理）
  assignedAirZoneId: number | null;
  mission: AirMission | null;
}

type AirMission =
  | { kind: 'air_superiority'; airZoneId: number; }
  | { kind: 'cas'; airZoneId: number; }
  | { kind: 'ground_attack'; provinceId: number; }
  | { kind: 'port_strike'; provinceId: number; }
  | { kind: 'naval_strike'; seaZoneId: number; }
  | { kind: 'naval_fighter_patrol'; seaZoneId: number; }; // 舰载机专属
```

### 4.4 AirSystem（新文件：`core/simulation/air_system.ts`）

```typescript
interface AirSystem {
  recruitWing(state: WorldState, countryId: string, baseProvinceId: number, aircraft: Record<string, number>, name: string): number | null;
  assignMission(state: WorldState, wingId: number, mission: AirMission): boolean;
  recallToBase(state: WorldState, wingId: number): void;
  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[];
  getAirSuperiority(state: WorldState, airZoneId: number, countryId: string): Fixed;
  getCASModifier(state: WorldState, provinceId: number, attackerId: string): Fixed;
  getNavalStrikeModifier(state: WorldState, seaZoneId: number, countryId: string): Fixed;
}
```

**空军作战逻辑**：
- **空战**：同一空域双方fighter交战，骰子结算，损失飞机；胜者取制空权
- **制空权**：按fighter战力比例，≥50%方获制空权；有制空权的一方才能正常执行cas/naval_strike
- **CAS（近距支援）**：有制空权时，cas联队给该空域内己方进攻师团+30%进攻骰子
- **ground_attack**：tactical_bomber攻击地面师团，使其org-0.05~0.15/tick
- **port_strike**：战术轰炸机轰炸敌dockyard省，使其portLevel临时-1、SupplyNetwork.bombedUntilTick=now+300
- **naval_strike**：tactical_bomber/naval_fighter攻击海域内敌方舰队，击沉舰船（需要至少30%空优）
- **舰载机**：carrier-based联队从航母舰队所在海域起飞执行naval_fighter_patrol，等同air_superiority+naval_strike在海上
- **机场半径**：每级airBase对应任务半径1个相邻airZone

### 4.5 ResearchSystem扩展

新增air科研线（6节点），naval_doctrine（4节点），air_doctrine（4节点），supply线（3节点）。具体节点配置见research_lines.json扩展。

### 4.6 新 PlayerAction/Event

```typescript
// PlayerAction
| { kind: 'recruitWing'; baseProvinceId: number; aircraft: Record<string, number>; name: string; }
| { kind: 'assignWingMission'; wingId: number; mission: AirMission; }
| { kind: 'recallWing'; wingId: number; }

// GameEvent
| { kind: 'wingRecruited'; wingId: number; baseProvinceId: number; }
| { kind: 'airBattleEngaged'; airZoneId: number; winnerCountryId: string | null; }
| { kind: 'aircraftLost'; wingId: number; aircraftType: string; count: number; }
| { kind: 'portStruck'; provinceId: number; }
| { kind: 'gainedAirSuperiority'; airZoneId: number; countryId: string; }
```

### 4.7 受影响文件（M4）

- **New files**: `src/core/simulation/air_system.ts`, `configs/air_zones.json`
- **Affected files**: world_state/types/interfaces/factory_system(生产)/combat_system(CAS buff)/naval_system(海轰打舰+舰载机)/supply_system(港口被炸影响补给)/surrender_system(飞机损失加投降)/state_manager/hash/map渲染/shadow_reader/WarOverviewPanel/research_lines.json

### 4.8 M4验收标准

- [ ] air_base可建造，建成后可招募联队
- [ ] 联队训练→部署→执行mission状态转换
- [ ] 同一空域空战结算，制空权按战力比例
- [ ] CAS给陆战+30%进攻buff（需要空优）
- [ ] 战术轰炸机能炸港口、影响敌补给
- [ ] naval_strike能炸沉海上舰队（需要空优）
- [ ] 航母上的naval_fighter联队能在舰队所在海域执行patrol
- [ ] 飞机损失计入warLosses+投降贡献
- [ ] 新增单元测试≥18个，全量测试通过
- [ ] playthrough：造机→争制空→CAS陆战→炸港口→海轰
- [ ] hash一致

---

## M5：登陆作战（海陆空协同核心玩法）

### 5.1 InvasionPlan 实体

```typescript
type InvasionStatus = 'preparing' | 'ready' | 'launched' | 'success' | 'repelled';

interface InvasionPlan {
  id: string;
  ownerId: string;
  fromProvinceId: number;
  toProvinceId: number;
  divisionIds: number[];
  requiredConvoys: number;              // 师团数×10
  preparationProgress: Fixed;           // 0-1，700tick
  status: InvasionStatus;
  escortFleetIds: number[];
  supportWingIds: number[];
  /** 登陆发起tick */
  launchedTick: number;
}
```

WorldState新增：`invasions: SortedMap<string, InvasionPlan>;`

### 5.2 InvasionSystem（新文件：`core/simulation/invasion_system.ts`）

```typescript
interface InvasionSystem {
  /** 创建登陆计划（选择出发省、目标省、师团、护航舰队、支援联队） */
  prepareInvasion(state: WorldState, ownerId: string, plan: Omit<InvasionPlan, 'id'|'preparationProgress'|'status'|'launchedTick'|'requiredConvoys'>): string | null;
  /** 发起登陆（条件全满足时才能调用） */
  launchInvasion(state: WorldState, planId: string): boolean;
  /** 取消登陆计划 */
  cancelInvasion(state: WorldState, planId: string): void;
  /** 查询登陆条件满足度（面板上显示） */
  checkConditions(state: WorldState, planId: string): InvasionConditions;
  /** 每tick：准备进度推进、登陆战判定、补给压力 */
  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[];
}

interface InvasionConditions {
  fromPortOk: boolean;
  toCoastalOk: boolean;
  pathSeaControl: number;     // 路径制海权最低值
  targetAirSuperiority: number; // 目标空域制空权
  convoysAvailable: boolean;
  escortFleetOk: boolean;
  preparationReady: boolean;
  allSatisfied: boolean;
}
```

### 5.3 登陆条件（launchInvasion前必须满足）

| 条件 | 要求 | 不满足的后果 |
|---|---|---|
| 出发省 | 己方控制+isCoastal+portLevel≥1 | 不可发起 |
| 目标省 | 敌方控制+isCoastal | 不可发起 |
| 路径制海权 | 出发海域+目标海域 己方seaControl≥60% | 不可发起 |
| 目标空域制空权 | 目标省所在airZone airSuperiority≥40% | 可发起但防御方+30% |
| 运输船 | equipmentPool中convoy≥师团数×10 | 不可发起 |
| 护航舰队 | ≥1支hold/escort舰队在路径海域 | 可发起但运输船损失+50%（M3） |
| 支援联队（可选） | 有cas/air_superiority联队在目标空域 | 提升登陆成功率 |
| 准备时间 | preparationProgress≥1（700tick） | 不可发起 |

### 5.4 登陆执行流程

1. **准备阶段**（preparing）：扣除运输船，师团仍在出发省但无法移动；700tick
2. **发起**（launched）：师团status='landing'（新增DivisionStatus），进入登陆战
3. **登陆战骰子**：
   - 攻击值 = Σ(division.softAttack × strength × org × supplyModifier × (1+cas_buff+naval_bombard_buff))
   - 防御值 = BASE_DEFENSE + toProvince.fortLevel × FORT_DEFENSE + 敌驻防师团 × 10
   - 防御值 × (1 - airSuperiorityDebuff) × (1 - navalBombardDebuff)
   - 骰子0.7~1.3
4. **结果**：
   - **成功（success）**：师团移至toProvince，controllerId=attacker，发provinceControlled事件；师团org=0.3（登陆后紊乱），需要200tick恢复
   - **被击退（repelled）**：师团返回fromProvince，strength-30%，损失50%运输船，发invasionRepelled
   - **运输船被打光**（极端情况）：师团全灭，发divisionDestroyed
5. **登陆后补给压力**：刚占领滩头省无portLevel（除非目标港完整占领），补给=0；需等占领港口或修复后才能接收海运补给。期间师团supply每日-0.2，必须快速夺港。

### 5.5 DivisionStatus 新增：`'landing'`

combat_system/division_system需处理landing状态：landing师团不主动进攻其他省，必须等org恢复到0.5以上才变ready。

### 5.6 新 PlayerAction/Event

```typescript
| { kind: 'prepareInvasion'; fromProvinceId: number; toProvinceId: number; divisionIds: number[]; escortFleetIds: number[]; supportWingIds: number[]; }
| { kind: 'launchInvasion'; planId: string; }
| { kind: 'cancelInvasion'; planId: string; }

| { kind: 'invasionLaunched'; planId: string; }
| { kind: 'invasionRepelled'; planId: string; divisionsLost: number; }
| { kind: 'invasionSuccess'; planId: string; provinceId: number; }
```

### 5.7 陆军命令条（Unit Command Bar，仿HOI4师团团指挥栏）

**登陆入口不再放在WarOverviewPanel**，改为放在"陆军命令条（Unit Command Bar）"：选中师团/多个师团后，在现有bottom_bar上方弹出横排指挥栏，完全参考HOI4原版师团微操栏布局。

**布局**（1280×110，位于bottom_bar正上方，edgeWidget对齐底部）：
```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [师团图标] 第一步兵师    ████████░░ 兵力78%   ██████░░░░ 组织度58%   ▣补给✓    ⚔进攻中  │
│ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐                                  │
│ │移││进││前││防││撤││停││强││港││两││空││登││补││拆││合││                              │
│ │动││攻││线││线││退││止││攻││卫││栖││降││陆││给││分││并││                              │
│ └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘                              │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**左侧单位信息区**（固定显示，参考HOI4左侧单位卡）：
- 师团类型图标（步兵/装甲/山地等）
- 师团名称（如"第一步兵师"），多选时显示"选中N个师团"
- 兵力条（strength 绿色，0-100%）
- 组织度条（organization 黄色，0-100%）
- 补给状态图标（✓满补/△低补/✗断补，M2生效）
- 当前状态图标（⚔进攻中/🛡防御中/🏃撤退中/⚓准备登陆等）

**中间命令按钮区**（图标按钮，40×40方形，仿HOI4图标样式）：

| # | 图标 | 按钮名 | 解锁 | 功能（点击后进入对应模式） |
|---|---|---|---|---|
| 1 | ➊➋箭头 | **移动** | M1起 | 点击地图上任意己方/空省→师团移动过去（基础命令） |
| 2 | ⚔ | **进攻** | M1起 | 点击敌方省→issueOffensive对该省发起进攻（画红色进攻箭头） |
| 3 | ━━ | **前线** | M1起 | 拖动在敌我交界线画前线→drawFront，师团自动部署到前线 |
| 4 | ▰▱ | **防御线** | M1起 | 拖动在己方省画防线→师团沿该线布防，不主动推进 |
| 5 | ←← | **撤退** | M1起 | 点击己方后方省→师团向该方向撤退，脱离战斗 |
| 6 | ■ | **停止** | M1起 | 取消当前所有命令，师团原地待命 |
| 7 | ⚔⚡ | **强攻** | M1起 | 强制进攻（即使组织度低也进攻，损失更大但可能突破） |
| 8 | ⚓ | **保卫港口** | M2起 | 师团自动移动到最近己方dockyard省驻防，防敌登陆 |
| 9 | 🏖 | **两栖登陆** | M5起 | 选中沿海省师团后可用，点击敌方沿海目标省→创建InvasionPlan |
| 10 | ✈ | **空降作战** | 延后 | 伞兵师团专属（本版本不实现，按钮灰显占位） |
| 11 | 🏭 | **补给优先** | M2起 | 切换该师团补给优先级（高/中/低），影响补给分配 |
| 12 | ✂ | **拆分** | M1起 | 把一个师团拆成两个各50%兵力的师团（需要补兵才能满编） |
| 13 | ⇄ | **合并** | M1起 | 多选两个不满编师团合并为一个（补满兵力） |

**按钮交互细节**（仿HOI4）：
- 鼠标悬停在按钮上显示tooltip（中文说明+快捷键提示，如"进攻 (Q)"）
- 点击后按钮高亮，鼠标变成对应绘制模式（画前线/画防御线拖动，其他点击）
- 右键或按Esc取消当前绘制模式
- 未解锁按钮（两栖/空降/保卫港口/补给优先）显示灰色锁图标，tooltip显示"需要XX科技/建筑解锁"
- 多选时（Shift/Ctrl框选），命令发给所有选中师团
- 选中多个师团时，左侧显示"选中N个师团"，兵力/组织度显示平均值

**快捷键**（参考HOI4，但不冲突现有按键）：
| 按键 | 命令 |
|---|---|
| 右键点地图 | 移动（默认最常用） |
| Q | 进攻 |
| W | 前线 |
| E | 防御线 |
| R | 撤退 |
| H | 停止 |
| L | 两栖登陆（M5） |
| Delete/Backspace | 解散选中师团（返回20%装备） |

**两栖登陆流程（参考HOI4海军入侵）**：
1. 选中己方沿海省的1+师团（必须在有港口的省）
2. 点击🏖"两栖登陆"按钮（未解锁或不在沿海省则灰显）
3. 鼠标变成选目标模式（可点敌方沿海省；点非沿海省显示红叉）
4. 点击目标省后，在地图上显示从出发省到目标省的路径（箭头穿过海域）
5. 弹出"登陆计划"小面板（在命令条上方，280×260）：
   ```
   ┌─────────────────────────────┐
   │ 登陆计划：XX省 → XX省        │
   │                             │
   │ 出发港口  ✓ 有港口          │
   │ 目标省    ✓ 沿海敌方省      │
   │ 运输船    8/10  ✗（缺2艘）  │
   │ 制海权    45%   ✗（需≥60%） │
   │ 制空权    30%   △（建议≥40%）│
   │ 护航舰队  未选  ✗           │
   │ 支援联队  未选  -           │
   │ 准备时间  0% (需10天)       │
   │                             │
   │ [选护航舰队] [选支援联队]    │
   │                             │
   │        [确认创建]           │
   └─────────────────────────────┘
   ```
6. 点"选护航舰队"→鼠标变成选舰队模式→点地图上己方海域中的舰队
7. 点"选支援联队"→鼠标变成选联队模式→点己方机场联队
8. 条件满足后"确认创建"按钮亮起，点击创建InvasionPlan，师团进入preparing状态
9. 师团在命令条左侧显示⚓准备中状态，700tick（10天）准备期
10. 准备完成后按钮变为🏖"发起登陆"（红色高亮闪烁），点击执行登陆
11. 登陆进行中师团状态变为🏖登陆中，战斗泡泡显示登陆战特殊图标

**海军/空军单位选中命令条（M3/M4配套）**：
- 选中舰队时底部也弹出类似命令条（舰队图标+舰名+舰船数量/组织度），按钮为：移动/巡逻/打击/护航/对岸炮击/召回港口
- 选中空军联队时弹出联队命令条：移动基地/制空/CAS/对海打击/港口袭击/召回机场
- 陆/海/空命令条共用同一个`UnitCommandBar`组件，传入unitType='division'|'fleet'|'wing'切换按钮组


### 5.8 战斗泡泡（Combat Bubble）

在地图上正在交战的省边境位置弹出圆形小泡泡图标（仿HOI4战斗标识）：
- **位置**：交战省份之间的边境点
- **外观**：
  - 小圆形图标（半径16px），有小剑交叉/爆炸图案
  - 颜色：进攻方占优→偏向进攻方颜色（玩家蓝/AI红），防御方占优→偏防御方颜色，胶着→黄
  - 闪烁动画（2秒一次脉冲）
- **交互**：
  - 点击泡泡弹出"战斗详情"小面板（180×240），显示：
    - 双方师团数量+图标
    - 双方总软攻/硬攻/组织度/兵力（strength）
    - 双方补给状态（绿/黄/红图标）
    - 支援buff图标：CAS支援✓、舰炮支援✓、制空权✓/✗、制海权✓/✗
    - 预估胜率（百分比进度条）
  - 面板底部按钮：`[派兵增援]`（选师团加入战斗）、`[下令撤退]`
- **显示条件**：
  - 有师团在该省处于attacking/defending状态时显示
  - 战斗结束（provinceControlled/disputedResolve）后泡泡淡出消失

战斗泡泡M1就可以做基础版（显示师团+兵力+组织度），M3/M4补充海空支援图标，M5补充登陆战的特殊显示。

### 5.9 M5验收标准

- [ ] 点击师团能选中（多选支持Shift），选中后底部出现陆军命令条
- [ ] 命令条"进攻/防御/追击/撤退"按钮工作正确
- [ ] 选中沿海省师团时"登陆计划"按钮可用，点击后选目标省→弹窗配护航/支援→创建计划
- [ ] 准备期700tick后状态变ready，"发起登陆"按钮高亮
- [ ] 条件全满足时可发起登陆
- [ ] 条件不满足时发起被拒绝（单元测试断言）
- [ ] 登陆战骰子结算，成功占领/被击退/全灭三种结果
- [ ] 刚占领滩头省师团supply=0，需夺港才能恢复补给
- [ ] 无空优/无护航发起登陆损失显著更高
- [ ] 有CAS+舰炮buff时登陆成功率显著提升（陆空海联动验证）
- [ ] 战斗泡泡在交火省显示，颜色反映战局
- [ ] 点击泡泡显示双方攻防/补给/buff数据，增援/撤退按钮可用
- [ ] 新增单元测试≥12个，全量测试通过
- [ ] playthrough完整测试：建造船坞→造运输船+舰队+飞机→拿制海→拿制空→选中师团点"登陆计划"→选目标→配护航支援→准备→发起登陆→占领→推进
- [ ] hash一致

---

## M6：和谈 + AI扩展 + 收尾

### 6.1 和谈系统 PeaceConference

- 战胜方（玩家或AI，本方胜利时玩家主导）可在对方投降后发起和谈
- 和平谈判点数 = 敌方投降倾向×100 + 战争贡献度（占VP、歼敌数量）
- 花费点数可以：索要全部省份（胜利方自动接管）、傀儡政权、解除武装、赔款（简化为政治点赔偿）
- 本版本简化为"占领所有战败方控制省份"+"附庸化"两选项
- 新事件：`peaceTreatySigned`
- 和谈按钮出现在WarOverviewPanel底部（M1灰显，M6启用）

### 6.2 AI扩展

- **assistant_behavior_tree扩展**：AI敌国会建造dockyard/air_base、招募舰队/联队、派舰队巡逻海域、派联队争制空、在有登陆威胁时调动舰队防守
- AI敌国在被断补/丢首都/高投降倾向时会更激进地反扑（不是简单送兵）

### 6.3 平衡性与打磨

- 舰船/飞机造价、建造时间、战斗伤害数值调优
- WarOverviewPanel完善：损失分项显示（舰种/机种明细tooltip）、战争日志分类图标
- 战斗/登陆/海战/空战日志完整
- 海军移动动画、空军任务图标、补给状态地图着色
- 新手指引（onboarding）新增海空军教程和登陆教程

### 6.4 M6验收标准

- [ ] 战胜后可发起和谈，战败方省份正确转移，附庸化状态生效
- [ ] AI会建造/派遣海空军，不会被瞬间秒杀，会在关键时刻防守反击
- [ ] 新手指引覆盖海空军和登陆
- [ ] 全量测试通过，playthrough测试完整走通一局"发展经济→造海空军→登陆作战→协同推进→占领首都→敌国投降→和谈胜利"
- [ ] hash一致
- [ ] 无明显数值不平衡（开局能打过、发展后有挑战）

---

## 玩法优化（随各M一起实现，不单独排期）

以下优化点分散到对应M里实现，提升手感但不增加系统复杂度：

### O1. 一键平衡扩展（M1起）
- 现有 `oneClickBalanceActions` 扩展：除了派民厂施工/贸易，还自动：
  - M1：战争期间自动把闲置政点用于生产加速
  - M2：自动分配运输船到缺补给的海运路线
  - M3：新训练完的舰队无任务时自动派到首都附近海域巡逻
  - M4：新训练完的联队自动派到前线空域争夺制空权
  - M5：登陆后自动派运输船给滩头补补给

### O2. 战争提示系统（M1起）
- WarOverviewPanel底部显示"下一步建议"提示条：
  - 开局："建造军工厂以生产更多装备"
  - 敌投降倾向<20%："继续占领敌方VP省份加速投降"
  - 敌投降倾向>60%："敌军心涣散，发起总攻！"
  - M2某省断补："⚠ XX师团补给不足，建议派运输船或打通补给线"
  - M3无舰队："⚠ 你没有舰队，无法跨海登陆"
  - M4无空优："⚠ 目标空域无制空权，登陆将面临巨大阻力"
- 提示条基于当前状态自动生成，点击可跳转到对应操作面板

### O3. 战斗/登陆成功率预测（M3/M5）
- 鼠标悬停在"发起登陆"按钮时，显示预估成功率百分比（基于当前buff/debuff计算）
- 鼠标悬停在敌方省份时，显示进攻成功率预估（考虑补给、空优、舰炮）
- 让玩家决策有依据，不是盲打

### O4. 地图叠加层切换（M2起）
- 右上角小地图旁新增叠加层切换按钮：
  - 补给地图（M2）：绿色=满补给，黄色=低补给，红色=断补
  - 制海权地图（M3）：蓝色=我方制海，红色=敌方制海，灰色=无控制
  - 制空权地图（M4）：蓝色=我方空优，红色=敌方空优
  - 可同时关闭，回到普通地图视图

### O5. 单位快捷操作（M3/M4）
- 右键舰队→快速选择任务（巡逻/打击/护航/炮击）
- 右键联队→快速选择任务（制空/CAS/对海打击/港口袭击）
- 右键海域/空域→直接派最近的舰队/联队前往
- 右键沿海省→直接让相邻海域舰队对岸炮击

### O6. 关键事件Toast通知（M1起）
- 重大事件发生时屏幕顶部弹出toast：
  - "敌国投降！我方胜利！"（绿色，带胜利图标）
  - "⚠ XX师团被歼灭！"（红色）
  - "⚠ XX省补给中断"（黄色）
  - "舰队在XX海域击败敌舰！"（蓝色）
- 点击toast可以定位到对应位置（省/舰队/面板）

### O7. 开局场景调整（M3/M4配合）
- 快速对战（quick_battle）开局场景：玩家首都附近省自带1个dockyard+1个air_base
- 开局赠送少量transport×5+fighter×20，让玩家不必从零开始攒海空军
- 敌方岛屿/沿海省份配置有明确登陆目标（隔海相望），方便体验登陆玩法

---

## 全局约束（所有M共同遵守）

1. **确定性锁步**：所有新增系统使用国家专属PRNG（seedMap['naval_'+cid]等），禁止Math.random；双实例300帧hash必须一致
2. **S.2脱敏**：不出现"占领/宣战/战争/阵亡"等敏感词，统一使用"管控/发起争端/区域争端/装备损失"
3. **性能**：补给BFS每60tick才重算；海战/空战判定每10tick一次（非每tick）；舰队/联队规模限制：每国最多30舰队+50联队
4. **测试**：每个M必须有独立单元测试；playthrough.test.ts 每个M结束时扩展一段流程
5. **局内无广告**：所有新面板不含广告/数值购买入口
6. **代码风格**：遵循现有文件风格（Fixed/SortedMap/接口-实现分离/advanceTick模式），不加注释

---

## M1交付即开工会

本 spec 批准后，将立即对M1（战争总面板+投降倾向）调用 writing-plans 生成 tasks.md 和 checklist.md，然后进入实施。M2~M6 在M1合入并验证后逐个启动。
