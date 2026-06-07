# TokenPilot Todo

## 当前状态

已完成：

- `/tokenpilot report`
- `/tokenpilot settings details on|off`
- Python token counter：`packages/openclaw-plugin/scripts/token_counter.py`
- 模型名归一化
- live runtime 已切到新 `ux-effects` schema
- `ux-effects` 落盘：
  - `latest.json`
  - `history.jsonl`
  - `sessions/<sessionId>.json`
- 统计口径已改为：
  - `litellm_tokens` 成功时按 `tokens`
  - 否则按原始 `chars`
  - 不再对用户展示 `chars / 4`
- details 模式下已支持：
  - `latest request savings`
  - `latest response savings`

当前结论：

- 不在 assistant 最终回复正文尾部追加 side-effect
- 如果 OpenClaw 插件层没有独立 TUI 展示入口，则 side-effect 暂不实现
- `/tokenpilot report` 作为当前会话累计节省的主入口

## 当前数据结构

```json
{
  "at": "2026-06-06T22:00:00.000Z",
  "sessionId": "xxx",
  "model": "tokenpilot/gpt-5.4-mini",
  "countMode": "litellm_tokens",
  "beforeCount": 14320,
  "afterCount": 13036,
  "savedCount": 1284,
  "details": {
    "requestSavedCount": 120,
    "responseSavedCount": 1164
  }
}
```

## 还没做

第一优先级：

- [ ] live runtime 稳定验证 `litellm_tokens` 是否生效
- [ ] 修稳 token counter 在 gateway 运行时的脚本发现/执行链路

第二优先级：

- [ ] details 下模块级拆分
  - stabilizer
  - reduction
  - eviction

第三优先级：

- [ ] details 下 pass 级拆分

## Report 目标

默认：

- 只显示当前会话累计节省
- 只展示 `tokens` 或 `chars`

details：

- 显示 latest request / response savings
- 后续扩展到模块级 / pass 级
