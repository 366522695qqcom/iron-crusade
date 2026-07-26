# Checklist（perf-sim-micro）

## 编译与测试
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部 39+ 用例通过
- [ ] hash 确定性测试通过
- [ ] simulation 200 帧联机一致性测试通过
- [ ] SortedMap 新增测试通过

## A3 资源索引
- [ ] countryNodeIndex 在首次 yieldTick 时 lazy 构建
- [ ] 索引按 controllerId 分组，正确包含所有管控节点
- [ ] invalidateNodeIndex API 存在
- [ ] 产出数值与全表扫描版本逐字节一致（由 hash 测试保证）

## A4 科研索引
- [ ] ResearchLineState 接口有 currentNodeIndex: number
- [ ] assignSlot 重置 currentNodeIndex=0
- [ ] advanceTick 用 currentNodeIndex 直接定位节点，无 findIndex
- [ ] 节点完成时 currentNodeIndex 正确递增
- [ ] bonusCache 按 countryId→bonusType 缓存，getBonus 命中
- [ ] cloneResearchState 拷贝 currentNodeIndex

## A6 SortedMap 批量构造
- [ ] SortedMap 构造函数接受可选 entries 参数
- [ ] entries 路径 dirty=false，keys/values/store 全部初始化
- [ ] cloneSortedMap 使用 new SortedMap(entries)
- [ ] clone 后的 SortedMap forEach 顺序与原一致

## P4.2 建造 item 索引
- [ ] enqueue 后 itemIndex 包含新 item
- [ ] cancel（countryId 路径）用索引 O(1) 定位
- [ ] splice 后索引正确维护（后续项索引 -1）
- [ ] advanceTick 删除完成项后索引同步

## P4.3/P4.4/P4.5 小修
- [ ] getPlayerCountryId 有 lastCountryId/lastPlayerId 缓存
- [ ] oneClickBalance 使用 Set 去重而非 includes
- [ ] Encoder.string 使用 ENCODED_STRING_CACHE 命中高频短串

## 行为零变化
- [ ] 200 帧快速对战后所有面板数值与优化前一致
- [ ] 建造/取消/工厂分配/焦点/科研交互结果不变
