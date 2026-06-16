# TokenPilot OpenClaw Adapter

This package contains the live OpenClaw adapter runtime for the current LightMem2 OpenClaw path.
Within the broader LightMem2 framework, this package is the runtime adapter layer used by the TokenPilot component.

For the component-level overview, command surface, and full configuration reference, see:

- [`components/tokenpilot/README.md`](../README.md)

Current runtime responsibilities:

- embedded responses proxy
- stable-prefix rewriting
- request-time reduction
- tool-result persistence
- canonical history rewrite and eviction
- recovery protocol and recovery tool wiring

For a higher-level semantic map of the current module boundaries, see:

- [`docs/architecture/plugin-semantic-grouping.md`](../../../../docs/architecture/plugin-semantic-grouping.md)

## Install

Release-style install:

```bash
cd /path/to/LightMem2/components/tokenpilot/packages/openclaw-plugin
npm run install:release
```

This installs the packaged TokenPilot runtime component into:

```text
~/.openclaw/extensions/tokenpilot
```

After install, run the adapter doctor:

```bash
cd /path/to/LightMem2/components/tokenpilot/packages/openclaw-plugin
npm run doctor:openclaw
```

Development-style install should use source build + runtime sync instead of
mixing release and load-path installs. The current sanity workflow is:

1. build the package
2. sync the runtime artifact
3. validate OpenClaw config
4. restart gateway

See:

- [`docs/run-guide.md`](../../../../docs/run-guide.md)

## Build

```bash
cd /path/to/LightMem2/components/tokenpilot/packages/openclaw-plugin
corepack pnpm build
corepack pnpm typecheck
```

## Runtime Model Prefix

When the current TokenPilot component is active, it registers an explicit provider namespace:

```text
tokenpilot/<model>
```

Example:

```text
tokenpilot/gpt-5.4-mini
```

## Runtime State

The current component state directory prefers:

```text
$HOME/.openclaw/tokenpilot-plugin-state/tokenpilot/
```

Legacy state roots are still read during the migration window.

Useful files:

- `event-trace.jsonl`
- `provider-traffic.jsonl`
- `response-root-state.json`
- `sessions/<logical>/turns.jsonl`

## Debugging

When a run looks invalid, start with:

```bash
OPENCLAW_CONFIG_PATH=$HOME/.openclaw/openclaw.json openclaw config validate
tail -n 100 $HOME/.openclaw/logs/gateway.log
rg 'stable_prefix_rewrite|proxy_before_call_rewrite|proxy_after_call_rewrite|tool_result_persist_applied' \
  $HOME/.openclaw/tokenpilot-plugin-state/task-state/trace.jsonl
```

Lightweight integration self-check:

```bash
cd /path/to/LightMem2/components/tokenpilot/packages/openclaw-plugin
npm run doctor:openclaw
```

The runtime sanity guide lives in:

- [`docs/run-guide.md`](../../../../docs/run-guide.md)

## Package Scripts

Primary package scripts:

```bash
corepack pnpm build
corepack pnpm typecheck
node --import tsx --test src/**/*.test.ts
npm run doctor:openclaw
```

The package still contains a small release-helper surface under
`components/tokenpilot/packages/openclaw-plugin/scripts/`. Benchmarking and evaluation flows should
stay outside this package and eventually live under the top-level
`experiments/` tree.

Script inventory:

- [`docs/architecture/plugin-script-inventory.md`](../../../../docs/architecture/plugin-script-inventory.md)
