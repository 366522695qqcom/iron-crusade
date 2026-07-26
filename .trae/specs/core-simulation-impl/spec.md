# 核心模拟系统实现# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 →# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（F# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `Building# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  -# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `auto# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/s# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 to# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/s# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MOD# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T.2.2（固定 tick + CI 哈希校验）本 spec 完成哈希部分；CI 校验脚本留待# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T.2.2（固定 tick + CI 哈希校验）本 spec 完成哈希部分；CI 校验脚本留待后续
  - `optimize-for-launch`：A 级各系统（助理/快速对# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T.2.2（固定 tick + CI 哈希校验）本 spec 完成哈希部分；CI 校验脚本留待后续
  - `optimize-for-launch`：A 级各系统（助理/快速对局/会话目标）现在有了可调用的 Simulation 实现
- **Affected code**：
  - 新增：`src/core/state/hash# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T.2.2（固定 tick + CI 哈希校验）本 spec 完成哈希部分；CI 校验脚本留待后续
  - `optimize-for-launch`：A 级各系统（助理/快速对局/会话目标）现在有了可调用的 Simulation 实现
- **Affected code**：
  - 新增：`src/core/state/hash.ts`、`src/core/simulation/{resource,building,factory,state_manager,simulation}_system# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T.2.2（固定 tick + CI 哈希校验）本 spec 完成哈希部分；CI 校验脚本留待后续
  - `optimize-for-launch`：A 级各系统（助理/快速对局/会话目标）现在有了可调用的 Simulation 实现
- **Affected code**：
  - 新增：`src/core/state/hash.ts`、`src/core/simulation/{resource,building,factory,state_manager,simulation}_system.ts`（或 `.ts`）
  - 改造：`src/core/simulation/index.ts`（导出）、`.eslintr# 核心模拟系统实现 Spec（core-simulation-impl）

> 变更类型：新增核心模拟实现（M1 单机核心基础）
> 影响代码：`src/core/state/hash.ts`（新增）、`src/core/simulation/` 下新增 5 个实现文件
> 依据：技术设计文档第 4 章 + 附录 C.3 + PROJECT.md 3.2/3.3/3.4

## Why

当前 `src/core/` 已有完整的数据模型（`world_state.ts`）与接口契约（`simulation/interfaces.ts`、`simulation/index.ts`），但**没有任何实现**：
- `Simulation.tick()` 无实现 → 游戏无法推演
- `ResourceSystem` / `BuildingSystem` / `FactorySystem` / `StateManager` 仅有接口 → 资源/工厂/建筑三大核心循环跑不起来
- `hash.ts`（FNV-1a + 确定性序列化）未实现 → 联机哈希校验无法工作（T.2.2 未完成）

这是 M1 单机核心的根基。本 spec 实现「资源→工厂→建筑」核心循环 + 状态哈希，让游戏能跑起来。战斗/补给/焦点树/科研/外交系统留待后续 spec（依赖本 spec 的 Simulation 框架）。

## What Changes

### ADDED（新增核心模拟实现）

- **ADDED** `src/core/state/hash.ts`——FNV-1a 32 位哈希 + 确定性字节序列化（附录 C.3）
  - `hashWorld(state: WorldState): string`——序列化 WorldState 为字节，FNV-1a 求哈希
  - 序列化严格按 `world_state.ts` **实际字段名与声明顺序**（注意：S.1/S.2 脱敏后字段为 `developmentPath`/`disputeResolve`/`disputes`，非附录 C.3.3 文档里的旧名 `ideology`/`warSupport`/`wars`）
  - 内联 `imul32` 辅助函数模拟 `Math.imul`（避免 core/ ESLint 禁用 Math，附录 C.1.5）
- **ADDED** `src/core/simulation/resource_system.ts`——`DefaultResourceSystem` 实现 `ResourceSystem`
  - `yieldTick`：遍历该国管控省份的资源节点，有开采建筑则产出；管控区（occupied）产出减半；未消耗资源累加保留（不清零）；超储备上限丢弃
  - `consume`：消耗资源，不足返回 false
  - `reserveCap`：查询储备上限（由仓储建筑等级决定）
- **ADDED** `src/core/simulation/building_system.ts`——`DefaultBuildingSystem` 实现 `BuildingSystem`
  - `validate`：校验省份归属/地形（船坞需沿海、矿场需资源节点）/槽位/钢铁
  - `enqueue`：入建造队列，扣钢铁
  - `cancel`：取消（已消耗钢铁不返还）
  - `assignFactories`：分配民厂产能
  - `advanceTick`：推进建造进度（民厂数加速、资源不足减速、完成入库发 buildingCompleted 事件）
- **ADDED** `src/core/simulation/factory_system.ts`——`DefaultFactorySystem` 实现 `FactorySystem`
  - `assignTask` / `unassign`：分配/取消任务
  - `scanIdle`：扫描空闲工厂，按阈值返回 L0-L4 提醒（IDLE_L1/L2/L3/L4）
  - `produceTick`：推进生产进度，产出流入装备池
  - `oneClickBalance` / `autoTrade` / `applyTemplate`：快捷操作
- **ADDED** `src/core/simulation/state_manager.ts`——`DefaultStateManager` 实现 `StateManager`
  - `snapshot`：深拷贝 WorldState
  - `restore`：从快照恢复
  - `hash`：委托 `hashWorld`
  - `diff` / `applyDiff`：MVP 阶段简化为全量快照（patches 留空，diff 返回 toTick 全量；applyDiff 直接 restore），后续联机优化再做真差分
- **ADDED** `src/core/simulation/simulation.ts`——`DefaultSimulation` 实现 `Simulation`
  - `tick(frameId, inputs)`：①应用 PlayerAction ②按 speed 推进各子系统（speed=0 暂停不推进）③收集 GameEvent ④每 16 帧计算 hash（非 16 帧返回上次 hash）⑤返回 TickResult
  - `snapshot` / `restore` / `hash`：委托 StateManager

### MODIFIED（更新导出与配置）

- **MODIFIED** `src/core/simulation/index.ts`——导出 `DefaultSimulation` 及各子系统实现类
- **MODIFIED** `.eslintrc.json`——将 `src/core/state/hash.ts` 加入 Math 白名单 override（同 `fixed.ts`，因 FNV-1a 需 imul；若用内联 imul32 则无需改）

## Impact

- **Affected specs**：
  - `optimize-for-launch`：T.2.2（固定 tick + CI 哈希校验）本 spec 完成哈希部分；CI 校验脚本留待后续
  - `optimize-for-launch`：A 级各系统（助理/快速对局/会话目标）现在有了可调用的 Simulation 实现
- **Affected code**：
  - 新增：`src/core/state/hash.ts`、`src/core/simulation/{resource,building,factory,state_manager,simulation}_system.ts`（或 `.ts`）
  - 改造：`src/core/simulation/index.ts`（导出）、`.eslintrc.json`（可选白名单）
- **BREAKING**：无（纯新增实现，