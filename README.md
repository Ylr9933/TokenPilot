<h1 align="center">TokenPilot</h1>

<p align="center">
  Cache-efficient context management for long-running OpenClaw agents
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-OpenClaw-green" alt="runtime">
  <img src="https://img.shields.io/badge/Plugin-TokenPilot-blue" alt="plugin">
  <img src="https://img.shields.io/badge/Package%20Manager-pnpm-informational" alt="pnpm">
  <img src="https://img.shields.io/badge/License-MIT-brightgreen" alt="license">
</p>

<p align="center">
  Stable Prefix, Observation Reduction, and Lifecycle-Aware Eviction for practical long-session agents
</p>

---

**TokenPilot** is an OpenClaw runtime plugin for reducing token cost in long-running agent sessions.
It focuses on a practical deployment problem: once an agent keeps working in one shared session, prompt history grows, tool outputs accumulate, and cache reuse becomes unstable.

TokenPilot addresses this with three runtime mechanisms:

- **Stable Prefix**: keep the reusable prompt prefix structurally stable across turns
- **Observation Reduction**: trim bulky tool outputs before they pollute later requests
- **Lifecycle-Aware Eviction**: remove cold completed tasks from canonical history when needed

This repository is organized first as a usable open-source project.
The main goal of this README is to help a new user install the plugin and run it successfully.

<span id='news'/>

## 📢 News

- **[2026-06-08]** TokenPilot open-source README is being reorganized for practical public use.
- **[2026-05-01]** TokenPilot is released.

<span id='reproduction'/>

## 🧪 Reproduction Scripts

We provide benchmark adapters and runnable scripts for reproducing the main evaluation pipelines.
If you only want to use the plugin, you can skip this section and go straight to [Installation](#installation) and [Quick Start](#quickstart).

Main entrypoints:

- high-level experiment notes: [experiments/README.md](./experiments/README.md)
- Claw-Eval adapter: [experiments/claw-eval/README.md](./experiments/claw-eval/README.md)
- plugin package details: [packages/openclaw-plugin/README.md](./packages/openclaw-plugin/README.md)

Example Claw-Eval method smoke:

```bash
bash experiments/claw-eval/scripts/run_method.sh \
  --scope suite \
  --suite T001zh_email_triage \
  --session-mode isolated \
  --profile reduction \
  --model tokenpilot/gpt-5.4-mini
```

Example Claw-Eval baseline smoke:

```bash
bash experiments/claw-eval/scripts/run_baseline.sh \
  --scope suite \
  --suite T001zh_email_triage \
  --session-mode isolated \
  --model ecoclaw/gpt-5.4-mini
```

Notes:

- `claw-eval` still requires a valid OpenClaw runtime environment
- some benchmark assets, especially `dataset/general/`, are not committed
- PinchBench migration is in progress and not yet the cleanest public entrypoint

<span id='baseline-evaluation'/>

## 🧪 Baseline Evaluation

TokenPilot currently ships with benchmark adapters around the OpenClaw runtime workflow rather than a standalone unified leaderboard script.

The most relevant public evaluation surfaces are:

- `experiments/claw-eval/scripts/run_baseline.sh`
- `experiments/claw-eval/scripts/run_method.sh`

For benchmark-specific setup and caveats, see:

- [experiments/README.md](./experiments/README.md)
- [experiments/claw-eval/README.md](./experiments/claw-eval/README.md)

<span id='demo'/>

## 🎥 Demo & Tutorials

There is no polished public demo video or notebook tutorial yet.

For now, the most practical runnable demo is:

- the plugin install flow in [Installation](#installation)
- the session verification flow in [Quick Start](#quickstart)
- the isolated gateway smoke script in [docs/scripts/smoke_isolated_gateway.sh](./docs/scripts/smoke_isolated_gateway.sh)

<span id='todo'/>

## ☑️ Todo List

- Add public paper link and citation block
- Add a cleaner end-to-end OpenClaw walkthrough
- Consolidate benchmark entrypoints further inside `experiments/`
- Add more public-facing examples for common OpenClaw workflows

<span id='contents'/>

## 📑 Table of Contents

* <a href='#news'>📢 News</a>
* <a href='#reproduction'>🧪 Reproduction Scripts</a>
* <a href='#baseline-evaluation'>🧪 Baseline Evaluation</a>
* <a href='#demo'>🎥 Demo & Tutorials</a>
* <a href='#todo'>☑️ Todo List</a>
* <a href='#installation'>🔧 Installation</a>
* <a href='#quickstart'>⚡ Quick Start</a>
* <a href='#architecture'>🏗️ Architecture</a>
* <a href='#examples'>💡 Examples</a>
* <a href='#experimental-results'>📁 Experimental Results</a>
* <a href='#configuration'>⚙️ Configuration</a>
* <a href='#contributors'>👥 Contributors</a>
* <a href='#related'>🔗 Related Projects</a>

<span id='installation'/>

## 🔧 Installation

### Before You Begin

You need:

- **Node.js 20+**
- **pnpm** via `corepack`
- **OpenClaw** installed and already runnable on your machine
- a working OpenClaw config at `~/.openclaw/openclaw.json`
- at least one provider/model in OpenClaw that can already answer normally

If OpenClaw itself is not working yet, fix that first. TokenPilot is a runtime plugin on top of OpenClaw, not a standalone agent framework.

### Installation Steps

```bash
git clone https://github.com/Xubqpanda/TokenPilot.git
cd TokenPilot
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

### 2. Verify the Plugin in a Real Session

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

For a richer report, run:

```text
/tokenpilot report
```

After a real session, TokenPilot state is usually written under:

```text
~/.openclaw/tokenpilot-plugin-state/tokenpilot/
```

Useful files include:

- `event-trace.jsonl`
- `provider-traffic.jsonl`
- `forwarded-inputs/`

### 3. Run the Repo-Provided Smoke Test

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

TokenPilot is built around three runtime mechanisms:

### 1. Stable Prefix

TokenPilot rewrites volatile runtime fields so consecutive requests share a more stable cacheable prefix.
This improves provider-side cache reuse.

### 2. Observation Reduction

TokenPilot applies reduction passes to noisy or oversized payloads, including:

- repeated read deduplication
- tool payload trimming
- HTML slimming
- execution output truncation
- format/path cleanup

If truncation removes something important, the plugin can preserve recovery metadata so the agent can fetch the full content later.

### 3. Lifecycle-Aware Eviction

For continuous multi-task sessions, TokenPilot tracks task lifecycle states such as:

- `active`
- `completed`
- `evictable`

This allows the runtime to remove cold completed tasks instead of replaying them forever.

The most important code for open-source users is in:

- `packages/openclaw-plugin/`
- `packages/runtime-core/`

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

For most users, the recommended first path is:

- keep **stabilizer** on
- keep **reduction** on
- leave **eviction** for longer continuous workflows or benchmark reproduction

<span id='experimental-results'/>

## 📁 Experimental Results

The repository includes runnable benchmark adapters, but this README intentionally keeps the homepage focused on practical open-source usage rather than detailed paper tables.

For experimental scripts and benchmark notes, see:

- [experiments/README.md](./experiments/README.md)
- [experiments/claw-eval/README.md](./experiments/claw-eval/README.md)

Headline paper result:

- **Isolated mode**: up to **61%** lower inference cost on PinchBench and **56%** on Claw-Eval
- **Continuous mode**: up to **61%** lower inference cost on PinchBench and **87%** on Claw-Eval

The paper link will be added here after release.

<span id='configuration'/>

## ⚙️ Configuration

TokenPilot is configured through your OpenClaw config, typically:

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
| `taskStateEstimator.baseUrl` | `string` | unset | OpenAI-compatible base URL for the estimator model. |
| `taskStateEstimator.apiKey` | `string` | unset | API key for estimator requests. |
| `taskStateEstimator.model` | `string` | unset | Model name used by the estimator. |
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

If you want the full raw schema, see:

- [packages/openclaw-plugin/openclaw.plugin.json](./packages/openclaw-plugin/openclaw.plugin.json)

Useful related docs:

- [docs/README.md](./docs/README.md)
- [packages/openclaw-plugin/README.md](./packages/openclaw-plugin/README.md)

Troubleshooting notes:

- If `tokenpilot/<model>` does not appear, validate and restart OpenClaw:

```bash
OPENCLAW_CONFIG_PATH="$HOME/.openclaw/openclaw.json" openclaw config validate
```

- If the plugin is installed but you still used the original model, switch to a `tokenpilot/<model>` model key.

<span id='contributors'/>

## 👥 Contributors

Contributor details will be added after the open-source release metadata is finalized.

<span id='related'/>

## 🔗 Related Projects

- [LightMem](https://github.com/zjunlp/LightMem)
- [OpenClaw](https://github.com/openclaw/openclaw)  

## Repository Structure

```text
TokenPilot/
├── docs/                         # public-facing operational notes and smoke helper
├── experiments/                  # benchmark adapters and reproduction scripts
├── figs/                         # figures used in the README
├── packages/
│   ├── openclaw-plugin/          # main OpenClaw plugin package
│   └── runtime-core/             # shared runtime logic and reduction/recovery code
├── dist/                         # built artifacts
└── README.md
```
