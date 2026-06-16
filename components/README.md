# Components

This directory contains runtime components built on top of the LightMem2 framework.

The current public repository ships one component:

| Component | Status | Role | Docs |
| :-- | :-- | :-- | :-- |
| `TokenPilot` | public | OpenClaw runtime component for context stabilization, reduction, and lifecycle-aware eviction | [components/tokenpilot/README.md](./tokenpilot/README.md) |

## How To Read This Directory

Use the root [README.md](../README.md) first if you want the fastest path to:

- install the repo
- install the current component
- verify the runtime path in a real OpenClaw session

Use a component subtree when you need component-specific material such as:

- command surface
- package layout
- configuration details
- runtime state layout
- debugging notes
- benchmark-specific experiment docs

## Current Layout

```text
components/
└── tokenpilot/
    ├── README.md
    └── packages/
        ├── host-adapter/
        ├── openclaw-plugin/
        ├── runtime-core/
        ├── kernel/
        └── layers/
```

## Naming Boundary

At the repository level, the framework name is `LightMem2`.

At the current runtime-compatibility layer, the shipped component still uses
the established `tokenpilot` namespace for commands, model routing, plugin id,
and persisted state. That boundary is intentional for now so the repo can move
toward a multi-component layout without breaking the working OpenClaw path.
