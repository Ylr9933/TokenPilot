# History 层

## 这一层负责什么

`packages/layers/history` 负责 TokenPilot 的长期状态。

它不是简单地存 transcript 原文，而是存更适合算法消费的结构化状态。

主要对象有两个：

- raw semantic turn
- session task registry

## 核心概念

### 1. raw semantic turn

不是“单条 message”，而是按用户轮次切出来的一组结构化记录。

它通常包含：

- messages
- tool calls
- tool results

关键文件：

- `src/raw-semantic.ts`

这个文件负责：

- 生成 `turnAbsId`
- 按 turnSeq 落盘
- 加载一段 turn window

你可以把它理解成：

- transcript 的中间表
- 提供给 decision 层做窗口分析的基础数据

### 2. session task registry

关键文件：

- `src/registry.ts`

它负责维护：

- 当前 session 里有哪些任务
- 哪些任务是 active
- 哪些任务是 completed
- 哪些任务是 evictable
- 哪些 turn 属于哪些 task

这相当于一个落盘的状态机。

## 为什么这层重要

如果没有 history 层，decision 层就只能看“当前一轮输入”，无法可靠判断：

- 这个任务是不是已经完成了
- 现在是不是切到新任务了
- 哪些旧任务可以换出

## 其它重要文件

### `src/delta.ts`

负责从 raw semantic snapshot 构造 estimator 使用的 delta view。

### `src/canonical-rewrite.ts`

负责 canonical history 的重写。

### `src/canonical-eviction.ts`

负责真正的 task-aware eviction 执行。

## 对 Python 开发者的理解方式

这层很像：

- 一组基于 JSON 文件的状态仓库
- 一层围绕 session 的 domain model

不是数据库，但它承担的职责和一个轻量状态存储层很像。
