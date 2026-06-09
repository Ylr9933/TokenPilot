<h1 align="center">LightMem2</h1>

<p align="center">
  A modular framework for long-running agent memory and context management
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Framework-LightMem2-black" alt="framework">
  <img src="https://img.shields.io/badge/Runtime-OpenClaw-green" alt="runtime">
  <img src="https://img.shields.io/badge/Component-TokenPilot-blue" alt="component">
  <img src="https://img.shields.io/badge/Package%20Manager-pnpm-informational" alt="pnpm">
  <img src="https://img.shields.io/badge/License-MIT-brightgreen" alt="license">
</p>

<p align="center">
  A practical foundation for long-running agent memory and context management
</p>

---

**LightMem2** is a modular framework for long-running agent memory and context management.
This repository currently documents the OpenClaw-based runtime path of LightMem2, with the sections below focused on the TokenPilot runtime component and its supporting code.

<span id='contents'/>

## 📑 Table of Contents

* <a href='#news'>📢 News</a>
* <a href='#installation'>🔧 Installation</a>
* <a href='#quickstart'>⚡ Quick Start</a>
* <a href='#architecture'>🏗️ Architecture</a>
* <a href='#examples'>💡 Examples</a>
* <a href='#experimental-results'>📁 Experimental Results</a>
* <a href='#configuration'>⚙️ Configuration</a>

<span id='news'/>

## 📢 News

- **[2026-06-08]** TokenPilot is released.

<span id='installation'/>

## 🔧 Installation

### Installation Steps

If your OpenClaw home or config path is not under the default `~/.openclaw`, you can override it with:

```bash
export TOKENPILOT_OPENCLAW_HOME="/path/to/openclaw-home"
export OPENCLAW_CONFIG_PATH="/path/to/openclaw.json"
```

```bash
git clone https://github.com/zjunlp/LightMem2.git
cd LightMem2
corepack enable
pnpm install
pnpm build
pnpm plugin:install:release
```

The installer will:

- package the release plugin
- install it into `~/.openclaw/extensions/tokenpilot`
- update `~/.openclaw/openclaw.json`
- enable the TokenPilot plugin entry
- try to restart the OpenClaw gateway automatically

If you only want to package the plugin without installing it:

```bash
pnpm plugin:pack:release
```

<span id='quickstart'/>

## ⚡ Quick Start

### 1. Use the TokenPilot Model Namespace

When the plugin is active, OpenClaw will expose models under:

```text
tokenpilot/<model>
```

For example:

```text
tokenpilot/gpt-5.4-mini
```

For a first run, use a `tokenpilot/...` model instead of your original provider model.

### 2. Verify It in a Real Session

The simplest manual verification flow is:

1. Start or restart OpenClaw.
2. Open a session with a `tokenpilot/<model>` model.
3. Run:

```text
/tokenpilot status
```

You should see a status block similar to:

- plugin entry enabled
- config enabled
- stabilizer enabled
- reduction enabled

For a fuller runtime summary, run:

```text
/tokenpilot report
```

After a few turns, TokenPilot state is usually written under:

```text
~/.openclaw/tokenpilot-plugin-state/tokenpilot/
```

Useful files include:

- `event-trace.jsonl`
- `provider-traffic.jsonl`
- `forwarded-inputs/`

### 3. Run the Built-In Smoke Test

```bash
bash docs/scripts/smoke_isolated_gateway.sh
```

Before running it, set your upstream provider info:

```bash
export TOKENPILOT_API_KEY="your_api_key"
export TOKENPILOT_BASE_URL="https://your-openai-compatible-endpoint/v1"
```

If your machine does **not** need an upstream HTTP proxy, also clear:

```bash
export TOKENPILOT_UPSTREAM_HTTP_PROXY=
export TOKENPILOT_UPSTREAM_HTTPS_PROXY=
```

The smoke script will:

- create a temporary OpenClaw runtime home
- wire TokenPilot as a local proxy provider
- start a local gateway
- send a minimal `Reply with exactly: pong` request

<span id='architecture'/>

## 🏗️ Architecture

The current LightMem2 runtime path is built around the TokenPilot codebase, with the OpenClaw adapter, runtime engine, shared contracts, and stateful layers kept separate.

```text
LightMem2/
├── packages/
│   ├── openclaw-plugin/    # OpenClaw adapter, hooks, commands, embedded proxy
│   ├── runtime-core/       # Host-agnostic runtime engine and shared execution logic
│   ├── kernel/             # Shared types, interfaces, events, and runtime contracts
│   └── layers/             # Stateful and policy-oriented logic
│       ├── history/        # Canonical state, raw semantic turns, task registry
│       ├── decision/       # Policy analysis, reduction/eviction decisions, estimator
│       └── memory/         # Experimental memory layer; distillation and retrieval are still in progress
├── docs/                   # Public-facing notes and smoke helpers
├── experiments/            # Benchmark adapters and evaluation scripts
└── README.md
```

<span id='examples'/>

## 💡 Examples

### Runtime Commands

TokenPilot exposes a small command surface inside OpenClaw sessions.

Status and report:

```text
/tokenpilot status
/tokenpilot report
/tokenpilot help
```

Stabilizer:

```text
/tokenpilot stabilizer on
/tokenpilot stabilizer off
/tokenpilot stabilizer target developer
/tokenpilot stabilizer target user
```

Reduction:

```text
/tokenpilot reduction on
/tokenpilot reduction off
/tokenpilot reduction mode balanced
/tokenpilot reduction pass toolPayloadTrim off
```

Eviction:

```text
/tokenpilot eviction on
/tokenpilot eviction off
```

For most users, the recommended default is:

- keep **stabilizer** on
- keep **reduction** on
- leave **eviction** for longer continuous workflows or benchmark reproduction

<span id='experimental-results'/>

## 📁 Experimental Results

The tables below summarize the current TokenPilot-based runtime path in LightMem2 on **PinchBench** and **Claw-Eval**.

`Isolated` mode evaluates each task in a fresh session, focusing on single-task behavior without cross-task history carryover.
`Continuous` mode evaluates longer-running shared-session workflows, where context accumulation and cache reuse matter much more.

### PinchBench

#### Isolated Mode

| Method | Overall | Prod | Res | Write | Code | Anal | CSV | Log | Meet | Mem | Skill | Integ | Cache Read (M) | Cache Miss (M) | Output (M) | Cost ($) |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Vanilla | 80.5 | 87.2 | 68.7 | 84.1 | 86.0 | 75.1 | 83.0 | 94.7 | 81.4 | 86.5 | 70.3 | 55.3 | 6.184 | 8.753 | 0.285 | 8.31 |
| LLMLingua-2 | 76.9 | 89.3 | 64.0 | 82.1 | 86.9 | 80.8 | 79.6 | 84.4 | 66.3 | 85.0 | 79.6 | 72.1 | 14.241 | 3.975 | 0.384 | 5.78 |
| SelectiveContext | 76.5 | 88.5 | 64.5 | 73.0 | 83.7 | 82.6 | 81.1 | 92.8 | 63.3 | 86.9 | 82.8 | 77.2 | 11.273 | 4.642 | 0.324 | 5.79 |
| LCM | 77.8 | 90.1 | 64.9 | 79.6 | 85.4 | 81.3 | 81.0 | 87.1 | 67.5 | 85.0 | 81.7 | 80.6 | 16.018 | 3.064 | 0.356 | 5.10 |
| Pichay | 78.9 | 85.4 | 58.9 | 71.8 | 79.0 | 88.3 | 79.8 | 83.6 | 84.0 | 91.3 | 69.8 | 63.3 | 6.717 | 3.333 | 0.238 | 4.07 |
| Summary | 79.5 | 80.7 | 66.3 | 83.5 | 77.9 | 82.1 | 87.5 | 77.2 | 81.3 | 92.5 | 67.2 | 54.4 | 12.303 | 3.009 | 0.296 | 4.51 |
| MemoBrain | 78.1 | 86.8 | 62.1 | 88.9 | 85.7 | 82.6 | 88.3 | 85.4 | 63.6 | 92.5 | 76.1 | 69.7 | 10.200 | 2.107 | 0.233 | 3.36 |
| AgentSwing | 78.4 | 89.8 | 71.9 | 80.2 | 79.5 | 83.5 | 80.8 | 83.7 | 77.9 | 92.5 | 65.7 | 35.0 | 4.534 | 7.129 | 0.241 | 6.77 |
| Keep-Last-N | 80.4 | 86.0 | 70.0 | 82.4 | 80.1 | 77.6 | 78.3 | 91.5 | 84.3 | 92.5 | 70.1 | 87.8 | 12.813 | 2.657 | 0.291 | 4.26 |
| MemOS | 79.4 | 84.2 | 54.4 | 83.1 | 82.3 | 78.2 | 81.1 | 97.2 | 77.6 | 92.5 | 85.9 | 80.2 | 29.018 | 4.573 | 0.492 | 7.81 |
| **TokenPilot** | **81.0** | 89.0 | 71.2 | 80.0 | 72.6 | 88.9 | 85.3 | 95.2 | 79.4 | 95.0 | 95.2 | 58.0 | 8.893 | 1.933 | 0.244 | **3.22** |

#### Continuous Mode

| Method | Overall | Prod | Res | Write | Code | Anal | CSV | Log | Meet | Mem | Skill | Integ | Cache Read (M) | Cache Miss (M) | Output (M) | Cost ($) |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Vanilla | 79.2 | 83.5 | 58.4 | 86.8 | 80.0 | 78.5 | 87.8 | 94.6 | 77.6 | 95.0 | 55.8 | 83.6 | 25.015 | 5.943 | 0.202 | 7.24 |
| LLMLingua-2 | 73.8 | 85.8 | 58.4 | 80.3 | 74.3 | 79.6 | 82.8 | 84.2 | 63.4 | 90.0 | 79.1 | 83.6 | 20.574 | 2.183 | 0.194 | 4.06 |
| SelectiveContext | 74.0 | 85.4 | 64.2 | 83.1 | 75.4 | 78.8 | 77.3 | 91.2 | 62.2 | 89.5 | 71.0 | 80.3 | 25.475 | 2.608 | 0.196 | 4.75 |
| LCM | 77.0 | 88.1 | 63.2 | 90.1 | 75.7 | 78.5 | 85.4 | 88.9 | 65.1 | 82.8 | 80.8 | 78.2 | 18.708 | 2.417 | 0.222 | 4.21 |
| Pichay | 76.5 | 88.0 | 66.7 | 76.2 | 81.0 | 77.6 | 83.5 | 84.2 | 67.6 | 100.0 | 63.8 | 75.3 | 11.698 | 6.874 | 0.260 | 7.20 |
| Summary | 78.4 | 89.1 | 64.4 | 73.8 | 82.9 | 69.6 | 81.6 | 93.6 | 80.3 | 95.0 | 61.7 | 75.3 | 20.687 | 6.249 | 0.196 | 7.12 |
| MemoBrain | 78.0 | 87.7 | 65.0 | 85.5 | 84.9 | 75.9 | 81.0 | 89.0 | 72.3 | 90.3 | 86.6 | 84.7 | 12.917 | 2.283 | 0.232 | 3.73 |
| AgentSwing | 78.5 | 86.3 | 67.3 | 89.0 | 79.1 | 82.4 | 87.4 | 68.1 | 72.4 | 93.8 | 61.7 | 83.8 | 12.680 | 5.476 | 0.314 | 6.47 |
| Keep-Last-N | 79.1 | 86.3 | 67.0 | 87.8 | 87.0 | 77.0 | 85.4 | 77.3 | 75.9 | 95.0 | 56.8 | 75.1 | 18.117 | 4.481 | 0.209 | 5.66 |
| MemOS | 80.9 | 87.5 | 59.0 | 85.4 | 87.1 | 82.0 | 81.0 | 95.0 | 78.1 | 92.5 | 87.4 | 84.1 | 30.859 | 8.939 | 0.308 | 10.41 |
| **TokenPilot** | **81.3** | 76.7 | 76.9 | 90.6 | 84.1 | 86.0 | 85.6 | 89.1 | 73.6 | 95.0 | 77.2 | 80.1 | 8.551 | 1.549 | 0.219 | **2.79** |

PinchBench abbreviations: Prod=Productivity, Res=Research, Anal=Analysis, Meet=Meeting Analysis, Mem=Memory, Integ=Integrations.

### Claw-Eval

#### Isolated Mode

| Method | Overall | Wkfl | Ops | Fin | Off | Comm | Prod | Oprn | Safe | Term | MM | Oth | Cache Read (M) | Cache Miss (M) | Output (M) | Cost ($) |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Vanilla | **64.5** | 65.4 | 70.8 | 45.7 | 44.4 | 73.2 | 70.9 | 77.7 | 74.0 | 56.8 | 41.0 | 69.2 | 9.429 | 4.637 | 0.216 | 5.16 |
| LLMLingua-2 | 61.9 | 58.7 | 67.5 | 57.6 | 43.3 | 62.9 | 70.1 | 62.4 | 61.0 | 49.6 | 44.0 | 75.2 | 8.169 | 4.043 | 0.182 | 4.44 |
| SelectiveContext | 60.7 | 59.1 | 68.2 | 46.3 | 36.9 | 61.5 | 75.5 | 59.2 | 67.2 | 53.1 | 44.0 | 74.7 | 8.271 | 3.862 | 0.181 | 4.31 |
| LCM | 61.2 | 59.0 | 67.3 | 51.1 | 47.7 | 65.9 | 76.6 | 58.4 | 58.6 | 51.4 | 41.5 | 72.2 | 9.776 | 3.543 | 0.172 | 4.17 |
| Pichay | 59.3 | 57.3 | 62.1 | 38.2 | 39.4 | 68.5 | 65.0 | 91.6 | 64.1 | 25.6 | 55.0 | 76.5 | 4.648 | 3.944 | 0.186 | 4.14 |
| Summary | 62.0 | 70.0 | 71.0 | 32.2 | 20.6 | 80.0 | 68.5 | 82.8 | 49.2 | 20.0 | 41.0 | 71.4 | 2.935 | 2.871 | 0.174 | 3.16 |
| MemoBrain | 58.0 | 64.5 | 60.5 | 26.1 | 37.6 | 56.1 | 59.9 | 71.0 | 63.4 | 20.0 | 41.0 | 75.3 | 18.182 | 5.118 | 0.332 | 6.69 |
| AgentSwing | 60.9 | 64.2 | 66.5 | 44.1 | 45.7 | 67.8 | 52.8 | 85.8 | 57.2 | 25.6 | 53.6 | 68.8 | 4.580 | 3.585 | 0.194 | 3.91 |
| Keep-Last-N | 61.8 | 67.1 | 73.8 | 44.7 | 21.6 | 54.5 | 63.6 | 86.2 | 38.4 | 39.4 | 55.0 | 69.1 | 4.229 | 1.845 | 0.186 | 2.54 |
| MemOS | 61.6 | 64.7 | 74.2 | 40.9 | 25.2 | 71.2 | 32.0 | 73.6 | 80.2 | 20.0 | 56.2 | 74.6 | 12.582 | 2.709 | 0.363 | 4.61 |
| **TokenPilot** | 63.1 | 68.1 | 75.4 | 47.0 | 22.3 | 71.8 | 65.0 | 72.0 | 47.8 | 37.0 | 45.6 | 69.9 | 4.436 | 1.154 | 0.239 | **2.27** |

#### Continuous Mode

| Method | Overall | Wkfl | Ops | Fin | Off | Comm | Prod | Oprn | Safe | Term | MM | Oth | Cache Read (M) | Cache Miss (M) | Output (M) | Cost ($) |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Vanilla | **63.4** | 70.8 | 80.3 | 26.7 | 27.8 | 62.2 | 73.4 | 78.4 | 63.6 | 20.0 | 41.0 | 69.6 | 709.845 | 21.981 | 2.622 | 81.52 |
| LLMLingua-2 | 59.0 | 58.7 | 71.3 | 34.8 | 30.6 | 61.9 | 65.3 | 77.6 | 64.6 | 20.0 | 41.0 | 72.4 | 575.654 | 37.197 | 2.630 | 82.91 |
| SelectiveContext | 56.5 | 58.1 | 71.6 | 21.8 | 21.2 | 54.7 | 74.0 | 57.7 | 66.4 | 20.0 | 41.0 | 72.3 | 437.114 | 48.678 | 2.754 | 81.69 |
| LCM | 61.4 | 66.8 | 69.0 | 38.3 | 29.5 | 63.3 | 74.9 | 66.6 | 67.3 | 20.0 | 41.0 | 72.7 | 383.007 | 28.714 | 2.691 | 62.37 |
| Pichay | 61.0 | 69.5 | 63.8 | 40.3 | 24.0 | 63.1 | 67.0 | 94.1 | 52.5 | 21.6 | 41.0 | 71.0 | 97.431 | 63.510 | 1.046 | 59.65 |
| Summary | 61.6 | 63.6 | 74.5 | 35.3 | 20.6 | 55.5 | 70.1 | 87.1 | 66.1 | 69.0 | 42.6 | 66.9 | 59.772 | 10.143 | 1.001 | 16.59 |
| MemoBrain | 57.9 | 65.9 | 55.0 | 24.9 | 36.7 | 47.8 | 73.5 | 64.2 | 60.6 | 20.0 | 38.4 | 81.6 | 47.497 | 13.990 | 1.134 | 19.16 |
| AgentSwing | 62.2 | 67.6 | 66.5 | 48.6 | 36.8 | 70.0 | 63.8 | 90.7 | 31.7 | 22.4 | 41.0 | 72.8 | 53.776 | 10.027 | 0.907 | 15.63 |
| Keep-Last-N | 60.7 | 65.3 | 74.0 | 35.5 | 20.8 | 54.1 | 73.6 | 91.9 | 35.7 | 59.5 | 42.4 | 64.7 | 44.812 | 9.106 | 0.780 | 13.70 |
| MemOS | 57.7 | 55.9 | 65.0 | 56.3 | 22.2 | 44.8 | 64.6 | 68.8 | 89.0 | 20.0 | 39.6 | 71.5 | 49.742 | 25.432 | 0.293 | 24.12 |
| **TokenPilot** | 60.8 | 58.8 | 61.8 | 52.5 | 32.1 | 64.2 | 57.3 | 89.2 | 65.8 | 76.8 | 45.2 | 70.9 | 21.430 | 9.928 | 0.338 | **10.58** |

Claw-Eval abbreviations: Wkfl=Workflow, Off=Office QA, Oprn=Operations, Safe=Safety, Term=Terminal, MM=Multimodal, Oth=Others.

<span id='configuration'/>

## ⚙️ Configuration

The configuration below is for the current **TokenPilot-based runtime path** in LightMem2, through your OpenClaw config, typically:

```text
~/.openclaw/openclaw.json
```

The plugin entry usually lives under:

```json
{
  "plugins": {
    "entries": {
      "tokenpilot": {
        "enabled": true,
        "config": {
          "...": "..."
        }
      }
    }
  }
}
```

### Minimal Example

```json
{
  "plugins": {
    "entries": {
      "tokenpilot": {
        "enabled": true,
        "config": {
          "enabled": true,
          "proxyAutostart": true,
          "proxyPort": 17667,
          "stateDir": "~/.openclaw/tokenpilot-plugin-state",
          "modules": {
            "stabilizer": true,
            "policy": true,
            "reduction": true,
            "eviction": false
          },
          "hooks": {
            "beforeToolCall": true,
            "dynamicContextTarget": "developer"
          },
          "reduction": {
            "engine": "layered",
            "triggerMinChars": 2200,
            "maxToolChars": 1200
          }
        }
      }
    }
  }
}
```

### Common Configuration

| Key | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `enabled` | `boolean` | `true` | Enable TokenPilot plugin hooks. |
| `proxyBaseUrl` | `string` | unset | OpenAI-compatible upstream base URL used by the embedded proxy. |
| `proxyApiKey` | `string` | unset | API key used with `proxyBaseUrl`. |
| `stateDir` | `string` | `~/.openclaw/tokenpilot-plugin-state` | Root directory for TokenPilot runtime state. |
| `proxyAutostart` | `boolean` | `true` after install | Whether the embedded responses proxy starts automatically. |
| `proxyPort` | `number` | `17667` | Local port used by the embedded proxy. |
| `hooks.beforeToolCall` | `boolean` | `true` after install | Enable before-tool-call safety/default injection. |
| `hooks.dynamicContextTarget` | `string` | `developer` | Where dynamic context is injected. Supported values: `developer`, `user`. |
| `modules.stabilizer` | `boolean` | `true` | Enable stable-prefix related runtime behavior. |
| `modules.policy` | `boolean` | `true` | Enable policy/decision plumbing. |
| `modules.reduction` | `boolean` | `true` | Enable observation reduction execution. |
| `modules.eviction` | `boolean` | `false` | Enable lifecycle-aware eviction execution. |
| `reduction.engine` | `string` | `layered` | Reduction engine. Current public value is `layered`. |
| `reduction.triggerMinChars` | `number` | `2200` | Minimum chars before reduction candidate generation is triggered. |
| `reduction.maxToolChars` | `number` | `1200` | Target maximum chars for trimmed tool payloads. |
| `reduction.passes.repeatedReadDedup` | `boolean` | `true` | Deduplicate repeated reads. |
| `reduction.passes.toolPayloadTrim` | `boolean` | `true` | Trim oversized tool payloads. |
| `reduction.passes.htmlSlimming` | `boolean` | `true` | Compact noisy HTML content. |
| `reduction.passes.execOutputTruncation` | `boolean` | `true` | Truncate long execution outputs. |
| `reduction.passes.agentsStartupOptimization` | `boolean` | `true` | Apply agent startup optimization pass. |
| `reduction.passes.memoryFaultRecovery` | `boolean` | `false` | Enable recovery-aware reduction fallback behavior. |
| `eviction.enabled` | `boolean` | `false` | Enable task-level canonical history eviction. |
| `taskStateEstimator.enabled` | `boolean` | `false` | Enable the estimator used by lifecycle-aware eviction. |
| `taskStateEstimator.baseUrl` | `string` | inherited from upstream when unset | OpenAI-compatible base URL for the estimator model. |
| `taskStateEstimator.apiKey` | `string` | inherited from upstream when unset | API key for estimator requests. |
| `taskStateEstimator.model` | `string` | inherited from upstream when unset | Model name used by the estimator. |
| `taskStateEstimator.batchTurns` | `number` | `5` | Minimum turns before running one estimator update. |
| `taskStateEstimator.evictionLookaheadTurns` | `number` | `3` | Lookahead horizon for completed-to-evictable decisions. |
| `taskStateEstimator.lifecycleMode` | `string` | `coupled` | Supported values: `coupled`, `decoupled`. |
| `taskStateEstimator.evidenceMode` | `string` | `three_state` | Supported values: `three_state`, `two_state`. |
| `taskStateEstimator.inputMode` | `string` | `completed_summary_plus_active_turns` | Supported values: `sliding_window`, `completed_summary_plus_active_turns`. |
| `ux.details` | `boolean` | `false` | Show module-level details in TokenPilot report surfaces. |
 
### Advanced Configuration

| Key | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `logLevel` | `string` | `info` | Plugin log verbosity. Supported values: `info`, `debug`. |
| `debugTapProviderTraffic` | `boolean` | `false` | Debug-only provider traffic tap. |
| `debugTapPath` | `string` | unset | Optional output path for tapped provider traffic. |
| `proxyMode.pureForward` | `boolean` | `false` | Disable proxy-side rewriting and only forward traffic. |
| `hooks.toolResultPersist` | `boolean` | `false` | Persist oversized tool results as external artifacts. |
| `reduction.passOptions.formatSlimming.enabled` | `boolean` | `true` | Enable lightweight formatting cleanup. |
| `reduction.passOptions.formatCleaning.enabled` | `boolean` | `true` | Enable additional formatting cleanup. |
| `reduction.passOptions.pathTruncation.enabled` | `boolean` | `true` | Enable path shortening. |
| `reduction.passOptions.imageDownsample.enabled` | `boolean` | `true` | Enable image downsampling. |
| `reduction.passOptions.lineNumberStrip.enabled` | `boolean` | `true` | Enable line-number removal for noisy reads. |
| `eviction.policy` | `string` | `noop` | Eviction policy. Supported values: `noop`, `lru`, `lfu`, `gdsf`, `model_scored`. |
| `eviction.maxCandidateBlocks` | `number` | `128` after install | Upper bound on eviction candidates. |
| `eviction.minBlockChars` | `number` | `256` after install | Minimum block size considered for eviction. |
| `eviction.replacementMode` | `string` | `pointer_stub` | How evicted content is replaced. Supported values: `pointer_stub`, `drop`. |
| `taskStateEstimator.requestTimeoutMs` | `number` | `60000` | Estimator request timeout. |
| `taskStateEstimator.completedSummaryMaxRawTurns` | `number` | `0` | Optional cap for raw turns before completed-task summaries are used. |
| `taskStateEstimator.evictionPromotionPolicy` | `string` | `fifo` | Promotion policy used in decoupled mode. |
| `taskStateEstimator.evictionPromotionHotTailSize` | `number` | `1` | Number of most-recent completed tasks kept hot before promotion. |
| `contextEngine.enabled` | `boolean` | `true` after install | Enable canonical-state context pruning logic. |
| `contextEngine.pruneThresholdChars` | `number` | `100000` | Prune older tool results when canonical chars exceed this threshold. |
| `contextEngine.keepRecentToolResults` | `number` | `5` | Number of recent tool results to keep unpruned. |
| `contextEngine.placeholder` | `string` | `[pruned]` | Placeholder used after canonical pruning. |
| `memory.enabled` | `boolean` | `false` | Enable procedural memory features. |
| `memory.autoDistill` | `boolean` | `false` | Distill evicted tasks into skills asynchronously. |
| `memory.distillerType` | `string` | `prompting` | Supported values: `prompting`, `autoskill`, `ctx2skill`. |
| `memory.batchSize` | `number` | `2` | Background distillation batch size. |
| `memory.topK` | `number` | `0` | Maximum number of retrieved skills injected per request. |
| `memory.injectAsSystemHint` | `boolean` | `false` | Inject retrieved skills as a system hint instead of a user-prefix. |

If you only want a practical starting point, configure these first:

- `enabled`
- `proxyBaseUrl`
- `proxyApiKey`
- `modules.stabilizer`
- `modules.reduction`
- `modules.eviction`

If you enable `taskStateEstimator`, you can either configure its `baseUrl`, `apiKey`, and `model` explicitly, or leave them unset and let TokenPilot fall back to the currently detected upstream provider and its first mirrored model.

Minimal example with upstream fallback:

```json
{
  "plugins": {
    "entries": {
      "tokenpilot": {
        "config": {
          "taskStateEstimator": {
            "enabled": true
          }
        }
      }
    }
  }
}
```
