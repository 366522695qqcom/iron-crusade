# Checklist（feature-combat-skeleton）

## 编译与测试
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部原有 + 新增测试通过
- [ ] division_system.test.ts 覆盖招募/资源不足/训练完成
- [ ] combat_system.test.ts 覆盖 initiate/offensive/province control/dispute resolve
- [ ] simulation 500 帧确定性测试通过（两实例 hash 一致）

## 师团系统（T1）
- [ ] Division 接口扩展 trainingProgress/status/inOffensive 字段
- [ ] recruitDivision 扣政治点 100 + 步兵装备 200
- [ ] 资源不足招募失败（返回 false，不扣不建）
- [ ] 训练 600 tick 后 status='ready'、strength=1.0
- [ ] 训练完成发 divisionRecruited 事件
- [ ] cloneDivision 正确拷贝新字段
- [ ] hash 序列化覆盖新字段

## 战斗系统（T2）
- [ ] initiateDispute 创建 Dispute（双方 participantSet、disputeResolve 初始 0.5）
- [ ] drawFront 记录前线到 state.fronts
- [ ] issueOffensive 将师团标记为 fighting/inOffensive=true
- [ ] advanceTick 每 tick 推进战斗（骰子 PRNG 确定性）
- [ ] 攻击失败时师团 strength/org 下降；strength=0 被歼灭
- [ ] 攻击成功时省份 controllerId 切换、发 provinceControlled 事件
- [ ] VP 省管控增加 controlledVPs、降低败方 disputeResolve
- [ ] disputeResolve < 0.1 时发 disputeResolved 事件、清理战斗标记
- [ ] 所有随机使用 PRNG（seedMap），无 Math.random
- [ ] 战斗不破坏确定性（500 帧联机一致性测试）

## applyAction 处理
- [ ] recruitDivision action 调用 DivisionSystem
- [ ] initiateDispute action 调用 CombatSystem
- [ ] drawFront action 调用 CombatSystem
- [ ] issueOffensive action 调用 CombatSystem
- [ ] Simulation 主循环注入 DivisionSystem/CombatSystem tick

## 助理防御（T3）
- [ ] decideDefense 返回具体师团分配
- [ ] autoDefendFront 检测到争端时派遣空闲师团到受威胁省份
- [ ] 不与玩家手动操作冲突（不抢占玩家已分配师团）

## Shadow 补全（T4）
- [ ] divisions 统计不再是 TODO
- [ ] combat_panel 显示真实争端数/前线数/师团数
- [ ] provinces 列表显示正确 controllerId（管控后更新）

## 通用
- [ ] 所有新增 TODO 注释被消除或转为未来里程碑说明
- [ ] interfaces.ts 新增 DivisionSystem/CombatSystem 接口
- [ ] state_manager clone/hash 覆盖所有新增字段（fronts、division 新字段）
- [ ] feature-factory-economy 装备入池未完成时，T1 招募可以不扣装备（加注释说明依赖），但预留接口
- [ ] UI 面板不因新增数据结构而崩溃（shadow 字段缺省值处理）
