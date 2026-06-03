# `proxy-runtime.ts` 代码导读

对应文件：

- `packages/openclaw-plugin/src/context-stack/integration/proxy-runtime.ts`

## 这个文件是干什么的

这个文件是 TokenPilot 在线请求主干之一。

如果说 `runtime-register.ts` 负责“把系统挂上去”，那这个文件负责：

- 真正接收请求
- 改写请求
- 调用 reduction
- 转发给上游模型
- 记录运行轨迹

它基本上就是 embedded proxy 的核心。

## 最重要的函数

### `startEmbeddedResponsesProxy(...)`

这是本文件的核心函数。

作用：

- 启动一个本地 HTTP 服务
- 暴露 `/v1/responses`
- 接收 OpenClaw 发来的请求
- 在转发给上游前后执行 TokenPilot 逻辑

你可以把它理解成：

```python
def start_proxy(cfg, logger, resolve_session_id, helpers):
    app = FastAPI()
    ...
```

## 这个函数的主流程

### 1. 先确定 upstream

它会先决定请求最后发到哪里：

- 如果配置里显式给了 `proxyBaseUrl` 和 `proxyApiKey`，优先用配置
- 否则尝试自动探测 upstream provider

所以它同时支持：

- 手动指定上游
- 自动探测上游

### 2. 创建 `policyModule`

这里会调用：

- `createPolicyModule(...)`
- `buildPolicyModuleConfigFromPluginConfig(cfg)`

这一步很关键，因为后面的 before-call policy 执行，需要这个模块实例。

### 3. 启动 HTTP server

内部 `createServer(...)` 才是真正每次请求都会经过的处理器。

这个处理器里又能拆成几个阶段。

## 每次请求的执行阶段

### 阶段 1：解析 payload 和 model

先做最基础的事情：

- 读取 body
- 解析 JSON
- 归一化 model id
- 决定 session id

这里的 `resolvedSessionId` 很重要，因为后面的 trace、history、registry 都挂在它上面。

### 阶段 2：注入 recovery protocol 指令

如果不是 `proxyPureForward`，而且 reduction 开着，就会调用：

- `injectMemoryFaultProtocolInstructions(payload)`

意思是：

- 告诉模型如何理解 recovery hint
- 告诉模型什么时候可以调用 `memory_fault_recover`

### 阶段 3：stable prefix rewrite

关键逻辑：

- 找 developer 和 user
- 对 developer prompt 做 stable prefix 重写
- 根据 `dynamicContextTarget` 决定动态上下文塞到 developer 还是 user
- 更新 `prompt_cache_key`

这是 TokenPilot 想稳定上游 cache 命中的重要一步。

### 阶段 4：procedural memory 注入

调用：

- `injectProceduralMemoryHints(...)`

作用：

- 在合适的时候，把 procedural memory 结果塞进当前请求

但在 `two_state` 模式下，这一步会被上层逻辑关掉。

### 阶段 5：before-call reduction

这是最复杂的一段之一。

调用：

- `applyProxyReductionToInput(...)`

这里会把 payload 里的输入转成 reduction 上下文，再调用 `runtime-core` 的 reduction pipeline。

它做的不只是 pass 执行，还包括：

- 载入 turn anchors
- 载入 callId 到 segment 的映射
- 调用 `policy.beforeCall`
- 按 pass 开关与 passOptions 执行本轮 reduction

### 阶段 6：写 trace

它会把很多关键中间状态写到：

- `task-state/trace.jsonl`
- `proxy-requests.jsonl`
- reduction pass trace

这对调试非常重要。

### 阶段 7：请求上游模型

调用：

- `requestUpstreamResponses(...)`

这一步才是真正把请求发给上游模型。

所以前面所有逻辑，本质上都是“发请求前的上下文处理”。

## 读这个文件时应该抓的主线

不要一开始就纠结所有日志字段。

建议你只抓这条主线：

1. upstream 怎么确定
2. session id 怎么确定
3. stable prefix 怎么改
4. memory 怎么注入
5. reduction 怎么执行
6. 最后怎么发给上游

## 这个文件为什么难读

因为它同时承担了很多角色：

- HTTP 服务入口
- 请求改写器
- reduction orchestrator
- trace 记录器
- 上游转发器

这就是它复杂的根本原因。

## 一句话总结

这个文件就是 TokenPilot 的在线请求处理主轴。

如果真实场景里出现：

- prompt 改写不对
- reduction 没生效
- memory 注入异常
- session 串了

通常都要回来看这里。
