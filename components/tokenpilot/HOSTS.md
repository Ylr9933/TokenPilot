# TokenPilot Host Integrations

TokenPilot is intended to become a reusable LightMem2 runtime component across
multiple coding-agent hosts, not a permanently OpenClaw-only plugin.

The current public repository ships one production adapter:

| Host | Status | Integration Mode | Install Surface | Main Adapter Docs |
| :-- | :-- | :-- | :-- | :-- |
| `OpenClaw` | public | bundled runtime plugin | `pnpm plugin:install:release` or `npm --prefix components/tokenpilot/adapters/openclaw run install:release` | [adapters/openclaw/README.md](./adapters/openclaw/README.md) |
| `Codex CLI` | planned | external hook / adapter | todo | not implemented yet |
| `Claude Code` | planned | external hook / adapter | todo | not implemented yet |

## Current Boundary

The intended split is:

- `kernel`
  - shared contracts, events, and runtime-facing types
- `runtime-core`
  - host-agnostic reduction / recovery / archive primitives
- `layers/*`
  - policy, history, and memory logic
- host adapter
  - host config wiring
  - session / transcript bridge
  - command surface
  - install / doctor / runtime bootstrap

At the moment, OpenClaw is the only fully implemented adapter. Some OpenClaw
assumptions are still being pushed out of shared packages and into the adapter
boundary.

## Adapter Checklist

When adding a new host adapter, cover these surfaces explicitly:

- install surface
  - where the host is configured
  - what file or plugin entry is touched
  - how to enable and disable it
- session bridge
  - how session ids, turn ids, and workspace paths are resolved
- transcript bridge
  - how raw host messages are read or reconstructed
- request / response hook model
  - before-call rewriting
  - after-call reduction
  - tool-result persistence
  - streaming vs non-streaming behavior
- state roots
  - state dir
  - namespace dir
  - archive dir
- control surface
  - commands, visualizations, status, and debugging entrypoints

## Near-Term Plan

Before adding new hosts, the current cleanup sequence is:

1. finish moving remaining OpenClaw-specific path and transcript assumptions into the OpenClaw adapter
2. keep `runtime-core` and `layers/*` on host-agnostic contracts
3. add a second host adapter only after the boundary is stable enough to prove reuse
