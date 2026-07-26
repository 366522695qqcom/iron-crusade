# Tasks（feature-combat-skeleton）

> B8 师团招募 + 前线 + 争端推进 + 省份管控 + 战斗结算骨架
> 回归红线：每步后 `npx tsc --noEmit`（零错）+ `npx vitest run`（全过）。确定性测试必须保持/扩展。

---

## T0：类型与常量准备

- [ ] **T0.1**：world_state.ts 扩展 Division 接口：
  - 添加 `trainingProgress: Fixed`（训练进度 0-1）
  - 添加 `status: 'training' | 'ready' | 'fighting' | 'retreating'`
  - 添加 `inOffensive: boolean`（是否在进攻中）
- [ ] **T0.2**：world_state.ts 添加 Front 类型：
  ```typescript
  export interface Front {
    attackerId: string;
    defenderId: string;
    fromProvince: number;
    toProvince: number;
  }
  ```
- [ ] **T0.3**：world_state.ts WorldState 添加 `fronts: SortedMap<string, Front[]>`（attackerId → Front[]）
- [ ] **T0.4**：types.ts PlayerAction 添加：
  - `{ kind: 'recruitDivision'; provinceId: number }`
- [ ] **T0.5**：division_system.ts 模块级常量：
  - RECRUIT_POLITICAL_COST = Fixed.fromInt(100)
  - RECRUIT_INFANTRY_COST = 200
  - TRAINING_MS = Fixed.fromInt(30 * 86400000 / 10) // 30天游戏时间，dtMs=100ms*speed
  - M1 简化：训练固定 600 tick（60s @speed=1）
- [ ] **T0.6**：combat_system.ts 模块级常量：
  - BASE_DEFENSE = Fixed.fromInt(20)
  - FORT_DEFENSE_PER_LEVEL = Fixed.fromInt(5)
  - DISPUTE_RESOLVE_INIT = Fixed.fromFloat(0.5)
  - DISPUTE_RESOLVE_LOSS_PER_VP = Fixed.fromFloat(0.1)
  - DISPUTE_RESOLVE_SURRENDER = Fixed.fromFloat(0.1)
  - ORG_LOSS_PER_DEFEAT = Fixed.fromFloat(0.2)
  - STRENGTH_LOSS_PER_DEFEAT = Fixed.fromFloat(0.15)
- [ ] **T0.7**：运行 `npx tsc --noEmit` 确认无类型错误

---

## T1：DivisionSystem 师团招募与训练

- [ ] **T1.1**：新建 `src/core/simulation/division_system.ts`
  - DefaultDivisionSystem 实现 DivisionSystem 接口（先在 interfaces.ts 定义）
  - `recruit(state, countryId, provinceId): boolean`：
    - 查 stockpile：political ≥ 100、infantry_equipment ≥ 200，否则返回 false
    - 查 province：必须是 ownedProvince 且 controllerId === countryId
    - 扣政治点 100、扣 infantry_equipment 200
    - 创建 Division：id = state.nextEntityId++、ownerId=countryId、template 默认 4 步兵卡、organization=0.6、hardness=0.1、softAttack=10、hardAttack=2、currentProvinceId=provinceId、targetProvinceId=null、supply=1.0、strength=Fixed.fromFloat(0.3)、trainingProgress=Fixed.ZERO、status='training'、inOffensive=false
    - state.divisions.set(id, division)
    - 返回 true
  - `advanceTick(state, countryId, dtMs): GameEvent[]`：
    - 遍历该国 divisions
    - training 状态：trainingProgress += dtMs.div(TRAINING_MS)（TRAINING_MS=60000ms，即 600 tick@dtMs=100）；≥1 时 status='ready'、strength=1.0
    - 事件：训练完成发 `{ kind: 'divisionRecruited'; divisionId; provinceId }`（加入 GameEvent 类型）
    - retreating 状态：无进攻，每 tick supply 恢复（略，M1 不做）
- [ ] **T1.2**：state_manager.ts cloneDivision 拷贝新增字段
- [ ] **T1.3**：hash.ts 序列化 Division 包含新字段、序列化 fronts（如 T0.3 添加）
- [ ] **T1.4**：simulation.ts applyAction 处理 recruitDivision：
  - case 'recruitDivision'：调用 divisionSystem.recruit
- [ ] **T1.5**：simulation.tick 主循环 countries.forEach 中调用 divisionSystem.advanceTick 收集事件
- [ ] **T1.6**：interfaces.ts 添加 DivisionSystem 接口，Simulation 构造注入
- [ ] **T1.7**：运行现有测试全部通过

---

## T2：CombatSystem 争端与战斗推进

- [ ] **T2.1**：interfaces.ts 定义 CombatSystem 接口：
  - `initiateDispute(state, attackerId, targetId): string | null`（返回 disputeId，失败 null）
  - `drawFront(state, attackerId, fromProvince, toProvince): void`
  - `issueOffensive(state, countryId, divisionIds, targetProvince): void`
  - `advanceTick(state, dtMs): GameEvent[]`
- [ ] **T2.2**：新建 `src/core/simulation/combat_system.ts` DefaultCombatSystem
  - 持有 PRNG 引用（或用 seedMap 懒取）
- [ ] **T2.3**：实现 initiateDispute：
  - 校验 attacker/target 国家存在且已相邻（任一 fromProvince 与 target 省份接壤？M1 简化：不校验邻接）
  - 创建 Dispute：id='d_'+attackerId+'_'+targetId+'_'+state.tickId、participants=[attackerId,targetId]、participantSet=new Set(participants)、disputeResolve={[attackerId]:0.5,[targetId]:0.5}、disputeGoals=[]、controlledVPs={[attackerId]:0,[targetId]:0}
  - state.disputes.set(id, dispute)
  - 返回 disputeId
- [ ] **T2.4**：实现 drawFront：
  - fromProvince/toProvince 必须是两国各占一省（M1 简化：不校验）
  - 取 attackerId 的 fronts list，不存在则 new Array
  - 防止重复 front（同 from→to 已存在则 return）
  - push { attackerId: 推断、defenderId: 推断、fromProvince、toProvince }——需要传入 defenderId 或从 province.controllerId 推断
  - M1 简化：drawFront action 添加 defenderId 字段？不，保持 action 签名不变，defenderId 从 toProvince.controllerId 推断
- [ ] **T2.5**：实现 issueOffensive：
  - 对每个 divisionId：get division, 若 ownerId !== countryId 跳过；若 status !== 'ready' 跳过
  - division.inOffensive = true
  - division.status = 'fighting'
  - division.targetProvinceId = targetProvince
- [ ] **T2.6**：实现 advanceTick(state, dtMs)：
  - 遍历所有 active disputes（有任一 participant 存在 fighting division）
  - 对每个 fighting division：
    - 若 targetProvinceId 为 null → 跳过
    - targetProvince = state.provinces.get(targetProvinceId)
    - 若 targetProvince.controllerId === division.ownerId → 已控制，停止 offensive（inOffensive=false, status='ready', targetProvinceId=null），continue
    - attackerStats = division.softAttack.mul(division.strength).mul(division.organization)（简化：单师团计算）
    - defenderId = targetProvince.controllerId
    - fortDef = targetProvince.fortLevel ? BASE_DEFENSE.add(FORT_DEFENSE_PER_LEVEL.mul(Fixed.fromInt(targetProvince.fortLevel))) : BASE_DEFENSE
    - 骰子：用 PRNG seedMap['combat_'+disputeId] 或 seedMap['combat_'+division.id] next() → Fixed 0.8-1.2
    - attackerRolled = attackerStats.mul(diceRoll)
    - if attackerRolled.greaterThan(fortDef)：
      - 攻击成功：province.controllerId = division.ownerId，provinceControlled 事件
      - 若 province.isVP：controlledVPs[attackerId]++；同时 disputeResolve[defenderId] -= DISPUTE_RESOLVE_LOSS_PER_VP
      - division.currentProvinceId = targetProvinceId
      - division.organization = division.organization.sub(Fixed.fromFloat(0.1)).max(Fixed.fromFloat(0.2))
    - else：
      - 攻击失败：division.strength = division.strength.sub(STRENGTH_LOSS_PER_DEFEAT).max(Fixed.ZERO)
      - division.organization = division.organization.sub(ORG_LOSS_PER_DEFEAT).max(Fixed.ZERO)
      - 若 division.strength.lessOrEqual(Fixed.ZERO)：division 被歼灭（state.divisions.delete）
  - 争端决心检查：
    - 对每个 dispute：检查双方 disputeResolve[pid] < SURRENDER
    - 任一方 < SURRENDER：winner = 另一方，发 disputeResolved 事件，清理 fronts 和 inOffensive 标记
- [ ] **T2.7**：simulation.applyAction 处理 initiateDispute/drawFront/issueOffensive（从 default 分支移到 combatSystem 调用）
- [ ] **T2.8**：simulation.tick 主循环后调用 combatSystem.advanceTick 收集事件（战斗不依赖每国遍历，独立 advance）
- [ ] **T2.9**：运行现有测试全部通过

---

## T3：助理防御

- [ ] **T3.1**：assistant_behavior_tree.decideDefense 返回具体防御决策（divisionIds + targetProvince）
- [ ] **T3.2**：assistant.autoDefendFront 在 detect 到争端时：
  - 取该国 status='ready' 且 inOffensive=false 的师团
  - 派到被进攻的 toProvince（front.toProvince where defenderId === countryId）
  - 调用 combatSystem.issueOffensive（方向相反，从防御省到攻击方 fromProvince）
- [ ] **T3.3**：运行回归

---

## T4：Shadow 补全

- [ ] **T4.1**：shadow_reader.ts 删除 divisions TODO，按 ownerId 统计师团数量（按省份分组可选）
- [ ] **T4.2**：readCombatPanelShadow 返回 active disputes 数量、controlledVPs、前线数量
- [ ] **T4.3**：运行回归

---

## T5：测试

- [ ] **T5.1**：division_system.test.ts（新建）：
  - test 招募扣政治点和装备
  - test 资源不足招募失败
  - test 训练完成后 status='ready'
- [ ] **T5.2**：combat_system.test.ts（新建）：
  - test initiateDispute 创建 Dispute
  - test 进攻成功省份易主
  - test 争端决心下降后结算
  - test 骰子确定性（同 seed 同结果）
- [ ] **T5.3**：simulation.test.ts 扩展 500 帧：
  - 创建两国、初始化争端、派遣师团
  - 两实例 500 帧 hash 一致
- [ ] **T5.4**：运行全部测试通过

---

## T6：最终验证

- [ ] **T6.1**：`npx tsc --noEmit` 零错
- [ ] **T6.2**：`npx vitest run` 全过（含新增测试）
- [ ] **T6.3**：combat_panel 显示真实争端/师团数据
- [ ] **T6.4**：快速对战 500 tick 战斗流程无崩溃
- [ ] **T6.5**：助理自动防御实际派遣师团

---

# Dependencies

- T0（类型常量）先行
- T1（师团招募）独立可先做
- T2（CombatSystem）依赖 T0，可与 T1 并行，但需要 Division 类型存在
- T3（助理防御）依赖 T2
- T4（Shadow）依赖 T1/T2 完成
- T5（测试）跟随各模块
- T6 最终验证

注意：feature-factory-economy 的装备入池是 T1 招募扣装备的前提——实施本 spec 前需要 feature-factory-economy B3 已完成（equipmentPools 有实际数据）。若装备入池尚未完成，T1 招募可临时不扣装备（只用政治点），待 B3 完成后补上扣装备。
