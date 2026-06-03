# Runtime Core 层

## 这一层负责什么

`packages/runtime-core` 放的是可复用的运行能力。

它不应该知道 OpenClaw 的 hook 细节，也不应该直接处理插件注册。

它主要负责两件事：

- reduction pipeline
- archive recovery

## 关键文件

### 1. `src/reduction/pipeline.ts`

这是 reduction 的执行主线。

它负责：

- 接收一组 pass
- 在 before_call 或 after_call 阶段执行
- 产出修改后的 `turnCtx`
- 产出 report

你可以把它理解成一个“文本处理流水线”。

### 2. `src/passes/*`

每个文件对应一个 reduction pass。

例如：

- `pass-repeated-read-dedup.ts`
- `pass-tool-payload-trim.ts`
- `pass-html-slimming.ts`
- `pass-exec-output-truncation.ts`

这些 pass 负责很具体的局部改写。

### 3. `src/archive-recovery/index.ts`

这是 recovery 相关的底层存储入口。

主要负责：

- 归档内容
- 生成 archive 路径
- 生成 recovery hint
- 控制 memory fault recovery 是否启用

### 4. `src/archive-recovery/tool-result-persist.ts`

处理工具结果持久化。

## 这一层与插件层的边界

一个简单判断规则：

- 如果逻辑依赖 OpenClaw payload 结构、provider 注册、hook 生命周期，它属于插件层
- 如果逻辑只是“给一段文本，按规则做裁剪/归档/恢复”，它更适合属于 runtime-core

## 对 Python 开发者的理解方式

可以把 `runtime-core` 想成：

- 一组纯服务函数
- 一个局部文本处理引擎
- 一个归档与恢复工具库

它不直接启动服务，也不直接处理 OpenClaw 配置。
