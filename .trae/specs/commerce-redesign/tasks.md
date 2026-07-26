# Tasks（commerce-redesign）

> 商业化重设计：全面不卖数值、局内不卖任何东西、局外通过外观/内容广告让玩家看广告。
> 依赖：optimize-for-launch B.2 已实现代码需先删除再重做。

---

## T0：文档更新（局外数值广告部分）

- [x] **T0.1**：重写 PROJECT.md 第 8.1 节——按场景三分类（单机局内/联机局内/局外）明确广告边界
  - 单机局内保留：工厂加速建造、刷新焦点卡、双倍工业产出
  - 局外新增：外观/皮肤解锁、内容解锁
  - 局外保留：结算页插屏、主界面 Banner（纯曝光）
  - 删除：每日补给箱、离线收益双倍
- [x] **T0.2**：更新 PROJECT.md 第 8.3 节闭环——联机奖励导回单机后变现路径改为「局外外观/内容广告」
- [x] **T0.3**：更新 PROJECT.md 第 10 章 M5 里程碑——商业化产出改为「局外外观/内容商店 + 单机局内激励视频」

---

## T1：删除违规局外数值广告代码

- [x] **T1.1**：删除 `src/platform/ads/daily_supply_box.ts`（每日补给箱）
- [x] **T1.2**：删除 `src/platform/ads/offline_double.ts`（离线收益双倍）
- [x] **T1.3**：更新 `src/platform/ads/ads_types.ts`——从 AD_SLOTS 移除 DAILY_SUPPLY_BOX / OFFLINE_DOUBLE，新增 COSMETICS_UNLOCK / CONTENT_UNLOCK 两个激励视频位
- [x] **T1.4**：更新 `src/platform/ads/index.ts`——移除 DailySupplyBox/OfflineDoubleBonus/SupplyBoxReward/OfflineEarnings 导出
- [x] **T1.5**：更新 `src/platform/ads/ads_manager.ts`——移除对已删除模块的引用（若无引用则不动），保留 AdsManager 单例与 setEnabled 联机开关

---

## T1b：移除局内卖数值/卖便利广告（文档，用户二次收紧要求）

> 用户反馈「不要卖数值，局内的东西尽量不要卖」——需将 T0.1 保留的「单机局内广告位」全部删除，局内改为完全无广告。

- [x] **T1b.1**：更新 PROJECT.md 8.1 核心原则——改为「**全面不卖数值、局内不卖任何东西、局外通过外观/内容广告变现**」（原为「单机局内可卖数值…」）
- [x] **T1b.2**：删除 PROJECT.md 8.1「单机局内广告位」整表（工厂加速建造 / 刷新焦点卡 / 双倍工业产出 / 解锁新剧本·国家 四行全部删除）
- [x] **T1b.3**：在 PROJECT.md 8.1 注明「局内（单机+联机）无任何广告」，原「联机局内无广告」表述扩展为「局内无任何广告」
- [x] **T1b.4**：PROJECT.md 3.4.4「建造加速」中「激励视频加速（单机）：看广告 → 当前建造立即完成」一行删除（建造仅保留民厂产能加速）
- [x] **T1b.5**：确认 `src/` 代码无任何局内卖数值广告实现（ads_types.ts 仅含 COSMETICS_UNLOCK/CONTENT_UNLOCK，无需改代码）

---

## T2：实现局外外观/皮肤系统

- [x] **T2.1**：创建 `configs/cosmetics.json`——外观配置（国家主题色/地图皮肤/UI 主题/部队图标，每类至少 2 个可解锁项）
- [x] **T2.2**：创建 `src/platform/ads/cosmetics.ts`——CosmeticsStore 类
  - `listCosmetics(): Cosmetic[]` 列出所有外观
  - `isUnlocked(cosmeticId): boolean` 查询是否已解锁
  - `unlock(cosmeticId): Promise<boolean>` 看广告解锁（调用 AdsManager.showRewardedVideo）
  - `getEquipped(slot): string | null` 查询当前装备
  - `equip(cosmeticId): void` 装备已解锁外观
  - 解锁状态持久化（tt.setStorage key: 'cosmetics_unlocked'）
  - 装备状态持久化（tt.setStorage key: 'cosmetics_equipped'）

---

## T3：实现局外内容解锁

- [x] **T3.1**：创建 `configs/unlockable_content.json`——可解锁内容配置（新剧本/新国家/新焦点树分支，至少 3 项）
- [x] **T3.2**：创建 `src/platform/ads/content_unlock.ts`——ContentUnlockStore 类
  - `listContent(): UnlockableContent[]` 列出所有可解锁内容
  - `isUnlocked(contentId): boolean` 查询是否已解锁
  - `unlock(contentId): Promise<boolean>` 看广告解锁
  - 解锁状态持久化（tt.setStorage key: 'content_unlocked'）
  - 提供查询接口供新建存档时校验国家/剧本可用性

---

## T4：实现局外商店统一入口

- [x] **T4.1**：创建 `src/platform/ads/shop.ts`——Shop 类（局外商店统一入口）
  - 聚合 CosmeticsStore 与 ContentUnlockStore
  - `isAvailable(): boolean` 商店是否可用（联机模式返回 false）
  - `getCosmeticsPage()` / `getContentPage()` 分页数据
  - 商店不展示任何数值商品

---

## T5：验证

- [x] **T5.1**：TypeScript 编译零错误（`npx tsc --noEmit`）
- [x] **T5.2**：确认已删除模块无残留引用（grep DailySupplyBox/OfflineDoubleBonus/SupplyBoxReward/OfflineEarnings）
- [x] **T5.3**：确认局外商店无任何数值商品（仅外观+内容）
- [x] **T5.4**：确认联机模式商店入口隐藏（isAvailable 返回 false）
- [x] **T5.5**：确认局内无任何广告入口（grep PROJECT.md 无「工厂加速建造/刷新焦点卡/双倍工业产出」单机局内广告位）
- [x] **T5.6**：确认全局不卖数值（局内无广告，局外仅外观/内容/纯曝光）

---

# Task Dependencies

- T0（文档）与 T1（删除代码）已完成
- **T1b（移除局内卖数值广告文档）独立，可立即执行**（纯文档改动，无代码依赖）
- T2/T3（外观/内容解锁）依赖 T1 完成（AD_SLOTS 已更新）；与 T1b 无依赖，可并行
- T4（商店入口）依赖 T2/T3 完成
- T5（验证）依赖 T1b + T4 完成

## 可并行任务

- T1b（文档）与 T2/T3（代码）可并行
- T2/T3（外观/内容）可并行
