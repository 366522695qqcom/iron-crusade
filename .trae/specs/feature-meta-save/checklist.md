# Checklist（feature-meta-save）

## 编译与测试
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部原有 + 新增测试通过
- [ ] reward_applier.test.ts 覆盖 clamp/累加/多资源
- [ ] state_manager patches 测试覆盖 set/delete 操作

## B4 奖励发放
- [ ] RewardApplier.applyReward 正确累加 political 和资源
- [ ] 超过 cap 的数值被 clamp（不溢出）
- [ ] SessionGoalTracker.claimReward 接收 state 参数并实际发奖
- [ ] DailyTaskSystem.complete 用同一工具发奖（避免重复实现）
- [ ] 已领取的目标/任务二次 claim 返回 null 不重复发奖
- [ ] game_runner onClaim 回调传入 this.state

## B5 trade 计数
- [ ] trade PlayerAction 带 amount 字段
- [ ] session_goal_tracker case 'trade' 按实际 amount 累加 current
- [ ] gather_resource 目标进度条显示真实比例
- [ ] 非 trade 动作不影响 gather_resource 进度

## B6 QuickBattle 归档
- [ ] archiveGame 调用 persistArchive 写入 tt 存储
- [ ] 非 tt 环境 try/catch 不抛错，降级内存
- [ ] loadArchives 启动时读取归档列表
- [ ] 归档元信息不含完整 WorldState（仅 result/duration/timestamp/rewards）
- [ ] 旧存档兼容（字段缺失不报错）

## B7 Classic 存档
- [ ] 每 60 tick 自动存档（非每 tick）
- [ ] 关键事件（焦点完成/争端发起/管控省份）即时存档
- [ ] 环形缓冲最近 10 个存档
- [ ] 加载取最新（按 timestamp 排序）
- [ ] 存档损坏不崩溃（try/catch 回退到次新）

## B9 Patches
- [ ] StatePatch 类型定义清晰（op/path/value）
- [ ] set 支持 countries/stockpiles/factories/buildings/constructionQueues 路径
- [ ] delete 支持从 SortedMap 移除条目
- [ ] 路径不存在时不崩溃（容错）
- [ ] 多 patches 按数组顺序应用（顺序敏感）
- [ ] StateManager 接口包含 applyPatches 方法签名

## 通用
- [ ] 所有新增 TODO 注释被消除或转为未来里程碑说明
- [ ] platform 存储调用全部 try/catch 包裹
- [ ] 不破坏确定性（patches 应用后的 state 确定；奖励发放用 Fixed 运算）
