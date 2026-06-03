# `policy.ts` 代码导读

对应文件：

- `packages/layers/decision/src/policy.ts`

## 这个文件是干什么的

这是当前整个项目里最关键的文件之一。

它相当于 TokenPilot 的策略主脑，负责把很多输入汇总成决策：

- reduction 决策
- eviction 决策
- task-state 决策
- cache / locality 相关判断

如果你只想理解“系统为什么会这样做”，最终都绕不开这个文件。

## 用 Python 的思维理解

你可以把它看成：

- 一个很大的 service object
- 一个 policy engine
- 一个 orchestrator

它的输入来自：

- 当前 turn 上下文
- history 层状态
- 配置

它的输出放到：

- `ctx.metadata.policy`

后续插件层或其它模块再读取这些决策并执行。

## 关键结构

### 1. `PolicyModuleConfig`

这是 `decision` 层自己的配置结构。

它和插件配置不同：

- 插件配置更大、更宿主相关
- 这里的配置更偏策略本身

例如这里关心：

- reduction 是否启用
- eviction policy
- taskStateEstimator 参数
- cache health 参数

### 2. `normalizeConfig(cfg)`

这个函数会把 `PolicyModuleConfig` 归一化成内部真正使用的配置。

作用类似插件层的 `normalizeConfig`，但面向的是策略层。

## 很关键的内部函数

### `appendTaskStateTrace(...)`

这个函数负责往 trace 文件写 task-state 相关调试信息。

重要性很高，因为 estimator 跑偏时，你第一手证据很多就在这里。

### `appendTaskStateEstimatorOutput(...)`

这是最近新增的重要调试入口。

它会把 estimator 的输出记录下来，包括：

- raw output
- normalizedTaskUpdates
- 最终真正应用的 task updates

这对排查 estimator 行为非常有帮助。

### `buildPatchFromTaskUpdates(...)`

这是一个关键桥接函数。

作用：

- 把 estimator 返回的语义级 task update
- 转换成真正的 registry patch

这相当于：

- 上游模型给的是“建议”
- 这个函数负责把建议翻译成系统能落盘的状态变更

### `maybeRunTaskStateEstimator(...)`

这是近期最值得重点读的函数。

它负责：

- 读取当前 registry
- 找出 pending turns
- 构造 estimator window
- 构造 delta
- 判断是否重复窗口
- 调用 estimator
- 处理输出
- 写回 registry

可以把它理解成 task-state 这一条支线的总 orchestrator。

## 这个文件里近期最重要的逻辑变化

### 1. `evidenceMode`

新增模式：

- `three_state`
- `two_state`

影响范围很大：

- estimator 能看到哪些已完成任务证据
- 是否允许使用 `completedTaskSummaries`
- lifecycle update 如何折叠

### 2. `completedSummaryMaxRawTurns`

控制 completed summary 与 raw turn 的边界。

作用是：

- 最近多少轮保留 raw turns
- 更早的完成态任务是否只通过 summary 进入 estimator 视野

### 3. duplicate estimator window 跳过

通过 marker 文件避免对同一 registry version、同一 delta window 重复跑 estimator。

这是性能和稳定性层面的保护。

## `createPolicyModule(cfg)`

这是对外暴露的总入口。

它返回一个 `RuntimeModule`，也就是一个带钩子的策略模块。

这个模块会在不同阶段参与：

- `beforeBuild`
- `beforeCall`
- `afterCall`

当前最重要的是：

- 它如何把决策写入 `ctx.metadata.policy`
- 它何时触发 task-state estimator

## 读这个文件时的建议顺序

这个文件很大，不要从头硬啃。

建议顺序：

1. 先看 `PolicyModuleConfig`
2. 再看 `normalizeConfig`
3. 再找 `createPolicyModule`
4. 再重点读 `maybeRunTaskStateEstimator`
5. 最后再看 `buildPatchFromTaskUpdates`

## 这个文件为什么是整个系统的“大脑”

因为它同时决定：

- 做不做 reduction
- 做哪些 reduction
- 任务状态怎么变
- eviction 何时发生

插件层更多是在“执行”，这个文件才是在“判断”。

## 一句话总结

如果 `proxy-runtime.ts` 是在线请求主轴，
那 `policy.ts` 就是决定这条主轴该怎么行动的策略核心。
