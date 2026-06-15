# PinchBench Experiments

This directory contains the PinchBench experiment harness for the current
LightMem2 runtime path.

At the current stage, the migration scope is intentionally narrow:

- dataset: `PinchBench` only
- settings: `isolated` and `continuous`
- active paths:
  - current LightMem2 method runs through the TokenPilot component
  - single-agent baseline runs

Out of scope for the first consolidation pass:

- baseline cleanup and revalidation
- `ClawEval`
- `FrontierScience`
- multi-agent / MAS variants
- legacy wrapper scripts that were only used for old ablations

This subtree documents the benchmark surface for the current public LightMem2
runtime release, where TokenPilot is the active context-management component.

The migration is now in an intermediate state:

- dataset tasks and assets have already been copied here
- dataset-side Python harness files have already been copied here
- the active single-agent method path now runs from this subtree
- the active single-agent baseline path now runs from this subtree

## Current Contents

- `docs/runtime-profile.md`
  - shared runtime profile used by the PinchBench method runs
- `docs/migration-scope.md`
  - keep/defer/drop inventory for the first merge pass
- `docs/layout-plan.md`
  - target subtree structure and directory ownership rules
- `dataset/`
  - current home for:
    - `tasks/`
    - `assets/`
    - `scripts/`
- `scripts/`
  - current home for the official baseline/method runners and shared helpers
- `save/`
  - reserved for local run outputs; only directory skeletons should be committed

## Official runners

The public runner surface is intentionally small:

- `scripts/run_baseline.sh`
- `scripts/run_method.sh`

These are the canonical entrypoints for open-source use.

### Baseline

Minimal isolated baseline run:

```bash
cd /path/to/LightMem2
bash experiments/pinchbench/scripts/run_baseline.sh \
  --suite automated-only \
  --session-mode isolated \
  --model gpt-5.4-mini
```

### Method

Minimal isolated method run:

```bash
cd /path/to/LightMem2
bash experiments/pinchbench/scripts/run_method.sh \
  --suite automated-only \
  --session-mode isolated \
  --model tokenpilot/gpt-5.4-mini
```

Continuous method run:

```bash
cd /path/to/LightMem2
bash experiments/pinchbench/scripts/run_method.sh \
  --suite automated-only \
  --session-mode continuous \
  --model tokenpilot/gpt-5.4-mini
```

## Auxiliary runners

The following scripts remain useful, but they are not the primary public API:

- `scripts/run_experiment_matrix.sh`
  - batch orchestration over multiple baseline/method cases
- `scripts/run.sh`
  - convenience wrapper that launches the default experiment matrix

## Immediate Goal

The first real consolidation target is:

1. keep cleaning the migrated PinchBench wrapper surface
2. keep only:
   - PinchBench
   - isolated mode
   - continuous mode
   - single-agent method and baseline paths
3. defer MAS and other benchmark families until this active path is stable
