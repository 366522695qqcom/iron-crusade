# Spec: 师团/前线/争端战斗骨架（feature-combat-skeleton）

> 变更类型：功能补全（填补战斗系统 M1 骨架）
> 前置依赖：feature-factory-economy（装备入池为师团招募提供装备）、core-simulation
> 目标：实现 B8 的师团移动、前线绘制、争端发起、省份管控骨架，让 combat_panel 有真实数据、争端系统可操作可结算

## Why

当前战斗层完全是骨架：
1. `Divisions` 永远为空（没有招募/训练/部署流程）
2. `Disputes` 除了 participantSet 索引外无推进逻辑，initiateDispute action 在 default 分支 noop
3. `drawFront`/`issueOffensive` action 无实现，玩家无法画线或下令进攻
4. shadow_reader 的 divisions 统计是 TODO（[shadow_reader.ts:285](file:///workspace/src/render/core/shadow_reader.ts#L285)）
5. combat_panel 一直显示空数据

本 spec 实现战斗系统 M1 最小骨架：招募师团→部署→画线→进攻→省份管控→争端决心下降→胜利/失败结算。不做复杂战术 AI、补给线、海空战斗，仅实现"画线 + 骰子 + 决心消耗"的简化战斗循环，足以验证整个工业→装备→师团→争端→结算的玩法闭环。

## What Changes

### 核心战斗模型（M1 简化）

**师团招募**：
- 新增 DivisionSystem（接口 + 实现 `core/simulation/division_system.ts`）
- 招募成本：100 政治点 + 200 步兵装备（infantry_equipment）+ 30 天训练时间（game time，按 speed 加速）
- 招募动作：新增 PlayerAction `{ kind: 'recruitDivision'; provinceId: number }`
- 招募时扣除装备和政治点，在选中省份创建新师团（state.divisions.set），训练进度 0→1 期间 strength=0.3（新兵），完成后 strength=1.0
- 初始属性（从 template 计算）：organization=0.6、hardness=0.1、softAttack=10、hardAttack=2、supply=1.0

**前线绘制（drawFront）**：
- drawFront action 定义两国之间的前线：记录 fromProvince → toProvince 的攻击方向
- M1 简化：前线只是"两国接壤省份之间的攻防关系"，不显式建 Front 实体
- drawFront 记录到 state（新增 field：`fronts: SortedMap<string, { attackerId: string; defenderId: string; fromProvince: number; toProvince: number }[]>`，key=attackerId）
- 绘制后可以 issueOffensive 让师团沿前线推进

**进攻（issueOffensive）**：
- issueOffensive action 让指定 divisionIds 向 targetProvince 进攻
- M1 简化战斗结算（骰子）：
  - 攻击方总 softAttack = Σ(division.softAttack × division.strength × division.organization)
  - 防御方总 softAttack = 省份守军基础值（省份 fort 等级 × 5 + 20）
  - 骰子：用 PRNG `seedMap['combat_' + disputeId]` 生成 0.8-1.2 随机系数（确定性）
  - 若攻击值 > 防御值：防守方组织度下降，若组织度归零则 provinceControlled
  - 若攻击值 < 防御值：攻击方师团 strength 下降 0.1-0.3
- 战斗每 tick 推进一次（不是瞬时），师团停留在 targetProvince 边境直到胜利或撤退

**省份管控**：
- 进攻胜利后 province.controllerId = attackerId
- 发 provinceControlled 事件
- 该省份资源节点产出归属切换
- 管控 VP 省份（province.isVP=true）时给 dispute.controlledVPs[attackerId]++

**区域争端（Dispute）推进**：
- initiateDispute action 创建新 Dispute（id = 'd_' + countryId + '_' + targetId + '_' + tickId）
- 争端双方：initiator + target（防御方自动加入）
- 争端决心（disputeResolve）：初始双方 0.5，管控 VP/战败省份时下降
- 任一方 disputeResolve < 0.1 时争端结束：disputeResolved 事件，winnerCountryId = 决心更高方
- 争端结束后停火，所有师团 stopOffensive

### Shadow 更新

- shadow_reader 补全 divisions 统计（按 ownerId 分组，按省份聚合）
- readCombatPanelShadow 返回真实争端/前线/师团数据
- 为 perf-sim-micro 的省份管控数缓存 P2.6 提供真实变动触发

### 助理 AI 防御

- assistant.autoDefendFront 在有争端时自动分配师团到 dispute 前线省份
- decideDefense 已经检查 participantSet.has(countryId)，现在需要实际 assign divisions

## Impact

- **New files**：
  - `src/core/simulation/division_system.ts`（DefaultDivisionSystem）
  - `src/core/simulation/combat_system.ts`（DefaultCombatSystem，处理进攻/管控/结算）
- **Affected files**：
  - `src/core/simulation/interfaces.ts`（新增 DivisionSystem/CombatSystem 接口）
  - `src/core/simulation/simulation.ts`（注入新系统；applyAction 处理 recruitDivision/drawFront/issueOffensive/initiateDispute；主循环调用 combatSystem.advanceTick）
  - `src/core/simulation/types.ts`（PlayerAction 增加 'recruitDivision'）
  - `src/core/state/world_state.ts`（WorldState 增加 fronts 字段；Division 添加 trainingProgress 等字段）
  - `src/core/simulation/state_manager.ts`（clone fronts 等新字段）
  - `src/core/state/hash.ts`（序列化 fronts 等新字段）
  - `src/core/simulation/assistant.ts`（autoDefendFront 实际分配师团）
  - `src/core/ai/assistant_behavior_tree.ts`（decideDefense 决策给出具体师团分配）
  - `src/render/core/shadow_reader.ts`（补全 divisions 统计 TODO）
- **Interface changes**：
  - PlayerAction 新增 `recruitDivision` kind
  - Division 接口新增 `trainingProgress`/`inOffensive` 字段
  - WorldState 新增 `fronts: SortedMap<string, Front[]>`
  - GameEvent 新增 `divisionRecruited` kind（可选）
- **Determinism**：所有随机使用 PRNG（seedMap['combat_'+disputeId]），无 Math.random
- **Tests**：
  - combat_system.test.ts：进攻结算/省份管控/争端决心计算
  - division_system.test.ts：招募扣资源/训练完成
  - simulation.test.ts：扩展到 500 帧验证战斗确定性（两实例 hash 一致）

---

## Requirements

### Requirement: 师团招募消耗资源

- **WHEN** 玩家 recruitDivision 且政治点≥100、步兵装备≥200
- **THEN** 创建新 Division 于目标省份（status='training'）
- **AND** 扣 100 政治点 + 200 infantry_equipment
- **AND** 资源不足时 noop（招募失败）

### Requirement: 训练完成师团可投入战斗

- **WHEN** 师团训练进度 ≥1.0（30 天游戏时间）
- **THEN** division.status='ready'、strength=1.0、organization=0.6
- **AND** 师团可被 issueOffensive 选中

### Requirement: 发起争端

- **WHEN** 玩家 initiateDispute 对邻国
- **THEN** 创建 Dispute 记录，双方 participantSet 包含两国
- **AND** disputeResolve 双方初始 0.5
- **AND** 发 disputeInitiated 事件（可选）

### Requirement: 战斗推进

- **WHEN** division 发起 offensive 且存在 active dispute
- **THEN** 每 tick 计算攻防值对比
- **AND** 使用 PRNG 骰子（确定性）
- **AND** 胜方推进，败方组织度/strength 下降
- **AND** 组织度归零一方后撤/被歼灭

### Requirement: 省份管控

- **WHEN** 进攻方胜利且目标省份无防御师团
- **THEN** province.controllerId = attackerId
- **AND** 发 provinceControlled 事件
- **AND** 若该省份是 VP，dispute.controlledVPs[attackerId]++

### Requirement: 争端结算

- **WHEN** 任一方 disputeResolve < 0.1
- **THEN** 发 disputeResolved 事件，winner=决心更高方
- **AND** 争端结束，所有师团停止 offensive

### Requirement: 确定性

- **WHEN** 两实例同 seed 同输入序列运行 500 tick（含战斗）
- **THEN** 每帧 hash 完全一致
- **AND** simulation 联机一致性测试通过（扩展到 500 帧）

### Requirement: 助理防御

- **WHEN** 助理启用且玩家被进攻
- **THEN** 空闲师团自动分配到受威胁省份
- **AND** 前线不被完全放空

### Requirement: Shadow 完整

- **WHEN** readCombatPanelShadow 被调用
- **THEN** divisions 按省份正确统计（非 TODO 占位）
- **AND** disputes/fronts 数据能反映当前争端状态
