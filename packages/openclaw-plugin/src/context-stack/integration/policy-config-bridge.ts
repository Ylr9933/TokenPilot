import type { RuntimeModule, RuntimeModuleRuntime, RuntimeTurnContext } from "@tokenpilot/kernel";
import type { PolicyModuleConfig } from "@tokenpilot/decision";
import { applyPolicyMonitors } from "./runtime-register.js";
import { asRecord, type NormalizedPluginRuntimeConfig, type PluginLogger } from "./config-types.js";

const NULL_RUNTIME: RuntimeModuleRuntime = {
  async callModel() {
    throw new Error("callModel is unavailable during plugin-side before_call optimization");
  },
};

export function buildPolicyModuleConfigFromPluginConfig(cfg: NormalizedPluginRuntimeConfig): PolicyModuleConfig {
  return {
    localityEnabled: true,
    stateDir: cfg.stateDir,
    reductionEnabled: false,
    reductionFormatSlimmingEnabled: false,
    reductionSemanticEnabled: false,
    handoffEnabled: false,
    evictionEnabled: cfg.modules.eviction && cfg.eviction.enabled,
    evictionPolicy: cfg.eviction.policy,
    evictionMinBlockChars: cfg.eviction.minBlockChars,
    taskStateEstimator: cfg.taskStateEstimator.enabled
      ? {
          enabled: true,
          baseUrl: cfg.taskStateEstimator.baseUrl,
          apiKey: cfg.taskStateEstimator.apiKey,
          model: cfg.taskStateEstimator.model,
          requestTimeoutMs: cfg.taskStateEstimator.requestTimeoutMs,
          batchTurns: cfg.taskStateEstimator.batchTurns,
          evictionLookaheadTurns: cfg.taskStateEstimator.evictionLookaheadTurns,
          completedSummaryMaxRawTurns: cfg.taskStateEstimator.completedSummaryMaxRawTurns,
          inputMode: cfg.taskStateEstimator.inputMode,
          lifecycleMode: cfg.taskStateEstimator.lifecycleMode,
          evidenceMode: cfg.taskStateEstimator.evidenceMode,
          evictionPromotionPolicy: cfg.taskStateEstimator.evictionPromotionPolicy,
          evictionPromotionHotTailSize: cfg.taskStateEstimator.evictionPromotionHotTailSize,
        }
      : { enabled: false },
    summaryGenerationMode: cfg.summary.summaryGenerationMode,
    summaryMaxOutputTokens: cfg.summary.summaryMaxOutputTokens,
    cacheHealthEnabled: false,
  };
}

export async function applyPolicyBeforeCall(
  turnCtx: RuntimeTurnContext,
  cfg: NormalizedPluginRuntimeConfig,
  logger: Required<PluginLogger>,
  modules: { policy?: RuntimeModule } | undefined,
): Promise<{ turnCtx: RuntimeTurnContext; policyChangedSegmentIds: string[] }> {
  let nextCtx = turnCtx;
  const bridgedReductionDecision = asRecord(asRecord(asRecord(nextCtx.metadata?.policy)?.decisions)?.reduction);

  if (cfg.modules.policy && modules?.policy?.beforeBuild) {
    nextCtx = await modules.policy.beforeBuild(nextCtx, NULL_RUNTIME);
    applyPolicyMonitors(nextCtx, logger, asRecord);
    if (bridgedReductionDecision) {
      const policy = asRecord(nextCtx.metadata?.policy) ?? {};
      const decisions = asRecord(policy.decisions) ?? {};
      nextCtx = {
        ...nextCtx,
        metadata: {
          ...(nextCtx.metadata ?? {}),
          policy: { ...policy, decisions: { ...decisions, reduction: bridgedReductionDecision } },
        },
      };
    }
  }

  return { turnCtx: nextCtx, policyChangedSegmentIds: [] };
}
