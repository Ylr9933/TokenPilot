# OpenClaw 插件层

## 这一层负责什么

`packages/openclaw-plugin` 是当前真实线上运行入口。

它的职责不是“发明算法”，而是把 OpenClaw 的宿主能力接到 TokenPilot 内部模块上。

主要职责：

- 读取与归一化插件配置
- 启动本地 proxy
- 注册 OpenClaw provider
- 注册 recovery tool
- 在 before_call / after_call 边界调用内部模块

## 最重要的文件

### 1. `src/context-stack/integration/config.ts`

作用：

- 定义插件配置结构
- 读取环境变量
- 合并默认值
- 生成 `decision` 模块所需配置

为什么它重要：

- 你以后调试大多数开关，第一站都会是这个文件
- `reduction`、`eviction`、`taskStateEstimator`、`memory` 都从这里进入系统

### 2. `src/context-stack/integration/runtime-register.ts`

作用：

- 注册 runtime
- 注册 `memory_fault_recover`
- 处理 session topology 和 turn binding
- 启动 embedded proxy

为什么它重要：

- 它决定了 TokenPilot 如何真正“挂”到 OpenClaw 上

### 3. `src/context-stack/integration/proxy-runtime.ts`

作用：

- 接收 `/v1/responses` 请求
- 改写 payload
- 做 reduction
- 转发到上游模型
- 记录 trace

为什么它重要：

- 这是请求主干
- 如果真实场景跑出来不对，通常都要回来看这里

## request-preprocessing 子目录

### `before-call-reduction.ts`

在请求发给上游模型之前，对输入做瘦身。

它依赖 `runtime-core` 的 reduction pipeline，但自身负责：

- 从 OpenClaw payload 提取 segment
- 建立 binding
- 决定哪些 pass 在本轮可用
- 把结果重新写回 payload

### `stable-prefix.ts`

做 stable prefix 重写，目的是让 prompt 的前缀更稳定，利于上游 cache reuse。

### `tool-results-persist.ts`

对大的工具结果做持久化，并在需要时改成 stub / recovery hint。

## page-out 子目录

### `transcript-sync.ts`

这是插件层和 history 层之间的桥。

它负责把 OpenClaw transcript 里的 message、tool call、tool result 提炼成更结构化的 turn 记录，再写入 history。

## page-in 子目录

### `recovery-tool.ts`

定义 `memory_fault_recover` 的行为。

### `recovery-protocol.ts`

定义恢复协议如何插入上下文、如何标记已恢复内容。

## 对 Python 开发者的建议

读插件层时，不要把它当“业务逻辑中心”，而要把它当成：

- 路由层
- 中间件层
- 适配层

真正的“算什么、存什么、怎么决定”的逻辑，大多不在这里，而在 `runtime-core`、`history`、`decision`。
