# Checklist（feature-factory-economy）

## 编译与测试
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部原有 39 个测试通过
- [ ] 新增 factory_system.test.ts ≥5 个用例通过
- [ ] simulation.test.ts 200 帧联机一致性通过（含新 trade/production 流程）
- [ ] hash 测试通过（ProductionTask 新增 countryId 字段已纳入序列化）

## B1 autoTrade
- [ ] autoTrade 不是空函数，按规则分配民厂
- [ ] 资源 ≥50% cap 时不启动新贸易
- [ ] 最多分配 TRADE_MAX_FACTORIES=2 座民厂
- [ ] 贸易民厂 taskId='trade_<countryId>'，state='working'
- [ ] 60s 周期完成后资源 +50 单位（受 cap 截断）
- [ ] 发 tradeCompleted 事件
- [ ] 资源满 cap 后贸易暂停/不溢出

## B2 applyTemplate 产装
- [ ] applyTemplate 创建/更新 production task（type='production'）
- [ ] task.countryId 正确设置
- [ ] 军厂分配到 task 后 state='working'
- [ ] produceTick 正确推进 production task 进度
- [ ] 周期完成后装备池对应装备 +output
- [ ] productionCompleted 事件发出
- [ ] 连续生产 efficiency 提升

## B3 装备入池
- [ ] equipmentPools 默认含 infantry_equipment/artillery/light_tank 三类
- [ ] 装备生产完成后 stocks[i].count 增加
- [ ] cloneEquipmentPool 深拷贝 stocks 数组
- [ ] hash 序列化覆盖新增 countryId 字段和装备池

## 兼容性
- [ ] 原有建造队列（type='construction'）进度不受影响
- [ ] 助理 autoScheduleSupply 调用 autoTrade
- [ ] 民厂不被贸易抢占（已分配建造的民厂不被贸易重分配）
- [ ] ProductionTaskType 联合类型包含 'trade'，default 分支完备
- [ ] GameEvent 联合类型包含新 kind，switch 有 default 分支

## Smoke
- [ ] 快速对战 500 tick 无报错
- [ ] 资源/装备数值在合理范围内（不 NaN/Infinity/负数）
- [ ] 助理面板"调度补给"统计反映实际贸易次数
