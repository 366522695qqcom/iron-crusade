# Checklist（commerce-redesign）

> 验证检查点。每个检查点对应 spec.md 的需求与 tasks.md 的任务。

---

## T0：文档更新

- [x] PROJECT.md 8.1 已按场景三分类重写（单机局内/联机局内/局外）
- [x] PROJECT.md 8.1 已移除「每日补给箱」「离线收益双倍」两行
- [x] PROJECT.md 8.1 已新增「外观/皮肤解锁」「内容解锁」两行
- [x] PROJECT.md 8.3 闭环已更新（联机奖励导回后走局外外观/内容广告）
- [x] PROJECT.md 10 章 M5 里程碑已更新（局外商店 + 单机局内激励视频）
- [x] PROJECT.md 10 章 M2 里程碑已更新（移除每日补给箱/离线双倍，改为局外商店骨架）

---

## T1：删除违规代码

- [x] `src/platform/ads/daily_supply_box.ts` 已删除
- [x] `src/platform/ads/offline_double.ts` 已删除
- [x] `ads_types.ts` 的 AD_SLOTS 已移除 DAILY_SUPPLY_BOX / OFFLINE_DOUBLE
- [x] `ads_types.ts` 的 AD_SLOTS 已新增 COSMETICS_UNLOCK / CONTENT_UNLOCK
- [x] `index.ts` 已移除 DailySupplyBox/OfflineDoubleBonus/SupplyBoxReward/OfflineEarnings 导出
- [x] `ads_manager.ts` 已移除对已删除模块的引用（确认无引用）
- [x] 全局 grep 无 DailySupplyBox/OfflineDoubleBonus/SupplyBoxReward/OfflineEarnings 残留

---

## T1b：移除局内卖数值/卖便利广告（文档，用户二次收紧要求）

- [x] PROJECT.md 8.1 核心原则已改为「全面不卖数值、局内不卖任何东西、局外通过外观/内容广告变现」
- [x] PROJECT.md 8.1「单机局内广告位」整表已删除（工厂加速建造/刷新焦点卡/双倍工业产出/解锁新剧本·国家）
- [x] PROJECT.md 8.1 已注明「局内（单机+联机）无任何广告」
- [x] PROJECT.md 3.4.4「建造加速」中激励视频加速一行已删除（仅保留民厂产能加速）
- [x] 确认 `src/` 代码无任何局内卖数值广告实现（ads_types.ts 仅含 COSMETICS_UNLOCK/CONTENT_UNLOCK）
- [x] grep PROJECT.md 无「工厂加速建造/刷新焦点卡/双倍工业产出」单机局内广告位残留

---

## T2：局外外观/皮肤系统

- [x] `configs/cosmetics.json` 已创建（含国家主题色/地图皮肤/UI 主题/部队图标，每类 ≥2 项）
- [x] `src/platform/ads/cosmetics.ts` 已创建 CosmeticsStore 类
- [x] CosmeticsStore.listCosmetics 可列出所有外观
- [x] CosmeticsStore.unlock 看广告解锁（调用 AdsManager.showRewardedVideo）
- [x] CosmeticsStore.isUnlocked/getEquipped/equip 可查询与装备
- [x] 解锁与装备状态持久化（tt.setStorage）
- [x] 外观严格不影响任何数值（grep 确认无资源/政治点/战斗力字段）

---

## T3：局外内容解锁

- [x] `configs/unlockable_content.json` 已创建（含新剧本/新国家/新焦点树分支，≥3 项）
- [x] `src/platform/ads/content_unlock.ts` 已创建 ContentUnlockStore 类
- [x] ContentUnlockStore.listContent 可列出所有可解锁内容
- [x] ContentUnlockStore.unlock 看广告解锁
- [x] ContentUnlockStore.isUnlocked 可查询
- [x] 解锁状态持久化（tt.setStorage）
- [x] 内容解锁为「可用性」解锁，非数值优势

---

## T4：局外商店统一入口

- [x] `src/platform/ads/shop.ts` 已创建 Shop 类
- [x] Shop 聚合 CosmeticsStore 与 ContentUnlockStore
- [x] Shop.isAvailable 联机模式返回 false
- [x] Shop.getCosmeticsPage / getContentPage 提供分页数据
- [x] Shop 不展示任何数值商品

---

## T5：验证

- [x] `npx tsc --noEmit` 零错误
- [x] 全局 grep 无已删除类型残留引用
- [x] 局外商店无任何数值商品
- [x] 联机模式商店入口隐藏（isAvailable 返回 false）
- [x] 局内无任何广告入口（grep PROJECT.md 无「工厂加速建造/刷新焦点卡/双倍工业产出」单机局内广告位）
- [x] 全局不卖数值（局内无广告，局外仅外观/内容/纯曝光）

---

## 跨模块一致性

- [x] optimize-for-launch B.2 任务标记为 REMOVED（在 optimize-for-launch/tasks.md 中注明）
- [x] 局内无广告规则（PROJECT.md 8.1/8.2，单机+联机一致）未被破坏
- [x] B.3 联机奖励回流（+500 政治点）保留不动（属联机奖励非广告）
- [x] 平台隔离约定（typeof tt 检测、非 tt fallback）延续
- [x] 确定性约定（core/ 不受影响，platform/ 层无 Math.random）
