# OpenClaw 版本兼容记录

## 2026-06-07：当前仓库与同门新版分支的一个已知差异

本仓库当前接入和调试时，实际运行环境里的 OpenClaw 版本是：

- `2026.3.13`

同门后续版本里有一处安装/配置逻辑，默认会写入：

```json
plugins.entries.tokenpilot.hooks.allowConversationAccess = true
```

但这个字段在当前这台机器上的 OpenClaw 版本里**不被识别**。实际现象是：

- `openclaw doctor`
- `openclaw config validate`
- gateway 重启后的配置加载

都会报配置非法，典型报错是：

```text
plugins.entries.tokenpilot.hooks: Unrecognized key: "allowConversationAccess"
```

## 影响

这个问题不是 TokenPilot 核心逻辑错误，而是 **插件配置结构和当前 OpenClaw 版本之间的兼容性问题**。

如果直接把同门新版里这段配置原样迁过来，会出现：

- `openclaw.json` 被写脏
- gateway 重启时提示配置非法
- 需要手动删掉该字段后才能恢复正常

## 当前仓库里的处理方式

在本仓库当前分支中，已经做了兼容处理：

- 保留了同门版本里对 `responses <-> completions` 的协议桥接修复
- 保留了流式链路修复：`stream=true` 时支持真实上游流和流式协议转换
- 保留了 tool call 历史结构适配：`function_call` / `function_call_output` 不再被简单压成纯文本
- **没有**继续写入 `plugins.entries.tokenpilot.hooks.allowConversationAccess`

也就是说，当前仓库为了兼容这台机器上的旧版 OpenClaw，刻意绕开了这一项。

## 这次从同门版本摘了哪些改动

本次实际合到当前仓库里的内容，主要是这几类：

1. `responses -> chat/completions` 请求适配
   - 保留 `stream: true`
   - 转发 `tools`、`tool_choice`、`parallel_tool_calls`
   - 兼容 OpenClaw 实际给出的扁平工具定义
   - 保留历史里的 `function_call` / `function_call_output`

2. `chat/completions -> responses` 响应适配
   - 非流式 `tool_calls` 转 `function_call`
   - completions SSE 转 responses SSE
   - 文本流改成真正的增量事件

3. 代理层的流式链路修复
   - 不再把所有流式请求都退化成“先拿完整响应，再本地伪造 SSE”的旧主路径
   - 改成真实上游流转发；如果上游是 completions SSE，则在插件侧转成 responses SSE 再回给 OpenClaw TUI

4. 一部分插件声明
   - `openclaw.plugin.json` 里的 `contracts.tools`
   - `activation.onStartup`

## 这次没有直接照搬的部分

本次没有直接整份迁入同门版本，而是做了手工合并。主要没直接照搬的是：

1. `plugins.entries.tokenpilot.hooks.allowConversationAccess`
   - 当前 OpenClaw 版本不支持
   - 原样写入会导致配置非法

2. 当前仓库后续自己已经加的内容
   - `/tokenpilot` command
   - report / stats / side-effect 相关逻辑
   - 默认配置整理

这些部分不是直接用同门分支整文件覆盖，而是按功能挑着合。

## 当前默认上游为什么是 tuzi，不是 kuaipao

需要区分两件事：

- **协议兼容能力**
  指插件现在已经能同时兼容 `responses` 和 `chat/completions` 两类上游

- **当前默认实际使用的上游**
  指这台机器现在真正连到哪个 provider

这次虽然补了 `completions <-> responses` 的桥，但当前默认运行时仍然优先连：

- `tuzi / openai-responses`

原因是：

1. `tuzi` 原生支持 `/responses`
2. 原生 responses 路径更短，协议转换更少
3. completions 兼容层现在更像“兜底能力 / 可选适配”，不是必须默认启用的路径

也就是说，这次不只是改了“completion 兼容 response”这一处，还额外补了：

- tool call 历史结构转换
- 流式 SSE 转换
- 真流式转发链路

所以当前默认选 `tuzi`，是为了先走更直接、更稳的原生 responses 路径；而 `kuaipao / completions` 现在理论上也能接，但属于兼容路线，不是默认路线。

## 后续迁移建议

如果后面要切到同门那个较新的版本，建议先确认两件事：

1. 目标 OpenClaw 版本是否已经支持 `plugins.entries.<plugin>.hooks.allowConversationAccess`
2. 安装脚本和默认配置里，是否仍然会自动写入这个字段

在没有确认之前，不要直接把该字段写回安装脚本或用户配置。

## 相关背景

- 记录时间：`2026-06-07`
- 当前仓库路径：`/mnt/20t/xubuqiang/EcoClaw/TokenPilot`
- 对比参考版本路径：`/mnt/20t/xubuqiang/TokenPilot-main`
