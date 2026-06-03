# `config.ts` 代码导读

对应文件：
 
- `packages/openclaw-plugin/src/context-stack/integration/config.ts`

## 这个文件是干什么的

这个文件是 TokenPilot 插件的总配置入口。

它主要做三件事：

1. 定义插件配置长什么样
2. 把原始配置和环境变量归一化
3. 把插件配置翻译成 `decision` 层能理解的配置

如果你以后问：

- 某个开关在哪里生效
- 某个环境变量在哪里读
- 为什么 `two_state` 会连带影响 eviction 或 memory

第一站几乎都应该看这个文件。

## 用 Python 的思路理解

你可以把这个文件当成：

- `settings.py`
- `pydantic settings model`
- `normalize_config(raw_config, env)` 的组合体

## 关键结构

### 1. `PluginRuntimeConfig`

这是插件原始配置结构定义。

它把配置分成几块：

- `hooks`
- `contextEngine`
- `modules`
- `eviction`
- `taskStateEstimator`
- `memory`
- `reduction`

这相当于在定义：

```python
class PluginRuntimeConfig(TypedDict):
    ...
```

### 2. `normalizeConfig(raw)`

这是本文件最重要的函数。

作用：

- 读用户传入配置
- 读环境变量
- 补默认值
- 做类型和范围修正
- 返回系统真正运行时使用的配置

你可以把它理解成：

```python
def normalize_config(raw: dict) -> dict:
    ...
```

## 这个函数里最值得注意的点

### 1. 环境变量优先级

函数里先把很多环境变量读出来，例如：

- `TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED`
- `TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL`
- `TOKENPILOT_TASK_STATE_ESTIMATOR_EVIDENCE_MODE`

然后再和配置文件里的值合并。

这说明实际运行时，行为不一定只由 `openclaw.plugin.json` 决定，环境变量也可能覆盖它。

### 2. `normalizedEvidenceMode`

这是这段时间最关键的新增逻辑之一。

它把 `evidenceMode` 最终归一成两种：

- `three_state`
- `two_state`

然后这个模式不只影响 estimator 本身，还会连带影响：

- `eviction.replacementMode`
- `evictionPromotionHotTailSize`
- procedural memory 是否继续使用

也就是说，这里不是“单点开关”，而是一个上游配置分流点。

### 3. 配置不是简单透传

这个文件不只是“把值搬过去”，它还会做联动决策。

例如：

- `two_state` 下强制 `replacementMode = "drop"`
- `two_state` 下强制 `evictionPromotionHotTailSize = 0`

这说明这里已经带有一点“策略约束”的意味。

## `NULL_RUNTIME`

这个常量很容易被忽略，但很重要。

它表示：

- 在某些插件侧的 `before_call` 优化阶段
- `decision` 模块虽然会被调用
- 但此时不允许真的去 `callModel`

所以这里提供了一个假的 runtime，实现上直接抛错。

这相当于在告诉你：

- `policy.beforeBuild()` 可以在插件侧跑
- 但它只能做分析和元数据生成
- 不能在这个阶段触发真正的模型调用

## `buildPolicyModuleConfigFromPluginConfig(cfg)`

这是第二个重要函数。

它负责把插件配置翻译成 `PolicyModuleConfig`。

你可以把它理解成一个 adapter：

```python
def plugin_cfg_to_policy_cfg(plugin_cfg) -> policy_cfg:
    ...
```

它很重要，因为：

- 插件层的配置面很大
- 但 `decision` 层只关心其中一部分
- 这里就是两层之间的配置边界

## 读这个文件时的建议

如果你是第一次看，不要一行一行读。

建议顺序：

1. 先看 `PluginRuntimeConfig`
2. 再看 `normalizeConfig`
3. 再看 `buildPolicyModuleConfigFromPluginConfig`
4. 最后再看几个小工具函数，比如 `asRecord`、`safeId`

## 一句话总结

这个文件是插件层的“配置总闸门”。

它决定了：

- 系统有哪些能力打开
- 哪些环境变量会覆盖配置
- 插件配置如何传给 `decision` 层
- 某些模式切换会带来哪些连锁约束
