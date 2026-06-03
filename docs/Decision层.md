# Decision 层

## 这一层负责什么

`packages/layers/decision` 是 TokenPilot 的策略层。

它负责回答几个关键问题：

- 这一轮要不要做 reduction
- 哪些内容值得做 reduction
- 当前 session 的任务状态是什么
- 哪些任务可以被标记成 evictable

## 最重要的文件

### 1. `src/policy.ts`

这是当前最核心的文件之一。

它负责：

- 分析 locality
- 分析 reduction 候选
- 分析 eviction 候选
- 调用 task-state estimator
- 读取 history 层状态
- 写回 registry

如果你只深入读一个决策文件，就先读它。

### 2. `src/task-state-estimator.ts`

这是“用模型判断任务状态”的那一层。

它负责：

- 构造 prompt
- 把 registry 和 delta 组装成模型输入
- 调用 responses 或 chat completions
- 解析返回的 taskUpdates

近期新增的重点概念：

- `evidenceMode`
  - `three_state`
  - `two_state`
- `completedSummaryMaxRawTurns`

它们会影响 estimator 看到的历史证据范围。

## reduction 分析器

在 `src/reduction/` 下。

主要职责：

- 分析重复读取
- 分析工具输出是否过大
- 分析格式噪声
- 分析图片、路径、行号等局部问题

这些分析器通常不直接改写文本，而是给 `policy.ts` 提供决策依据。

## eviction 分析器

在 `src/eviction/` 下。

它会结合 task registry 来判断：

- 哪些 block 冷了
- 哪些 task 处于可换出状态
- 当前 eviction policy 应该产生什么指令

## 对 Python 开发者的理解方式

你可以把 decision 层理解成：

- service layer
- orchestration layer
- policy engine

而 `task-state-estimator.ts` 更像一个：

- prompt builder
- LLM classifier client

## 推荐阅读顺序

1. `src/index.ts`
2. `src/policy.ts`
3. `src/task-state-estimator.ts`
4. `src/reduction/*`
5. `src/eviction/*`
