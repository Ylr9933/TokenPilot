/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  resolveReductionPasses as resolveLayerReductionPasses,
  runReductionBeforeCall as runLayerReductionBeforeCall,
  runReductionAfterCall as runLayerReductionAfterCall,
} from "@tokenpilot/runtime-core";
import { createPolicyModule } from "@tokenpilot/decision";
import {
  applyProxyReductionToInput,
  applyLayeredReductionAfterCall,
  applyLayeredReductionAfterCallToSse,
  buildLayeredReductionContext,
  estimatePayloadInputChars,
  extractInputText,
  findDeveloperAndPrimaryUser,
  isReductionPassEnabled,
  isSseContentType,
  loadOrderedTurnAnchors,
  loadSegmentAnchorByCallId,
  normalizeText,
  normalizeTurnBindingMessage,
  prependTextToContent,
  rewritePayloadForStablePrefix,
  rewriteRootPromptForStablePrefix,
  type ProxyAfterCallReductionResult,
  type ProxyReductionResult,
  type RootPromptRewrite,
} from "./context-stack/request-preprocessing-api.js";
import {
  extractTurnObservations,
  inferObservationPayloadKind,
  readTranscriptEntriesForSession,
  syncRawSemanticTurnsFromTranscript,
  transcriptMessageStableId,
} from "./context-stack/page-out-api.js";
import {
  MEMORY_FAULT_RECOVER_TOOL_NAME,
  archiveContent,
  buildRecoveryHint,
  injectMemoryFaultProtocolInstructions,
  registerMemoryFaultRecoverTool,
  stripInternalPayloadMarkers,
} from "./context-stack/page-in-api.js";
import {
  PluginRuntimeConfig,
  PluginLogger,
  applyBeforeToolCallDefaults,
  applyPolicyBeforeCall,
  asRecord,
  buildPolicyModuleConfigFromPluginConfig,
  canonicalMessageTaskIds,
  contentToText,
  detectUpstreamConfig,
  dedupeStrings,
  ensureContextSafeDetails,
  extractPathLike,
  extractItemText,
  extractLastUserMessage,
  extractOpenClawSessionId,
  extractSessionKey,
  extractToolMessageText,
  findLastUserItem,
  hookOn,
  installLlmHookTap,
  isToolResultLikeMessage,
  makeLogger,
  messageToolCallId,
  maybeRegisterProxyProvider,
  normalizeConfig,
  ensureExplicitProxyModelsInConfig,
  countTokensWithFallback,
  recordUxEffect,
  responsesPayloadToChatCompletions,
  chatCompletionsToResponsesText,
  requestUpstreamResponses,
  requestUpstreamResponsesStream,
  createPluginContextEngine,
  normalizeProxyModelId,
  registerRuntime,
  type UpstreamConfig,
  type UpstreamHttpResponse,
  safeId,
} from "./context-stack/integration.js";
import {
  maybeBlockRepeatedToolCall,
  recordToolCallMemo,
} from "./context-stack/integration/tool-call-memo.js";
import {
  appendJsonl,
  appendForwardedInputDump,
  appendReductionPassTrace,
  appendTaskStateTrace,
} from "./trace/io.js";
import { applyToolResultPersistPolicy } from "./context-stack/request-preprocessing/tool-results-persist-policy.js";
import { contextSafeRecovery as importedContextSafeRecovery, hasRecoveryMarker as importedHasRecoveryMarker } from "./context-stack/page-in-api.js";
import { registerTokenPilotCommand } from "./commands/tokenpilot-command.js";

const TEST_WORKSPACE_DIR = "/tmp/tokenpilot-openclaw-plugin-tests";

const proxyRuntimeHelpers = {
  detectUpstreamConfig,
  createPolicyModule,
  buildPolicyModuleConfigFromPluginConfig,
  normalizeProxyModelId,
  injectMemoryFaultProtocolInstructions,
  normalizeText,
  findDeveloperAndPrimaryUser,
  rewriteRootPromptForStablePrefix,
  prependTextToContent,
  rewritePayloadForStablePrefix,
  estimatePayloadInputChars,
  appendTaskStateTrace,
  applyProxyReductionToInput,
  applyPolicyBeforeCall,
  buildLayeredReductionContext,
  isReductionPassEnabled,
  loadOrderedTurnAnchors,
  loadSegmentAnchorByCallId,
  dedupeStrings,
  syncRawSemanticTurnsFromTranscript,
  contentToText,
  contextSafeRecovery,
  MEMORY_FAULT_RECOVER_TOOL_NAME,
  hasRecoveryMarker,
  inferObservationPayloadKind,
  makeLogger,
  stripInternalPayloadMarkers,
  extractInputText,
  appendReductionPassTrace,
  appendJsonl,
  appendForwardedInputDump,
  requestUpstreamResponses,
  requestUpstreamResponsesStream,
  applyLayeredReductionAfterCall,
  applyLayeredReductionAfterCallToSse,
  isSseContentType,
  countTokensWithFallback,
  recordUxEffect,
};

const defaultBeforeCallTestHelpers = {
  applyPolicyBeforeCall,
  buildLayeredReductionContext: (
    payload: any,
    triggerMinChars: number,
    sessionId: string,
    passToggles: any,
    passOptions: any,
    segmentAnchorByCallId: any,
    orderedTurnAnchors: any,
  ) => withTestWorkspaceDir(
    buildLayeredReductionContext(
      payload,
      triggerMinChars,
      sessionId,
      {
        memoryFaultRecoverToolName: MEMORY_FAULT_RECOVER_TOOL_NAME,
        hasRecoveryMarker,
        inferObservationPayloadKind,
      },
      passToggles,
      passOptions,
      segmentAnchorByCallId,
      orderedTurnAnchors,
    ),
  ),
  isReductionPassEnabled,
  loadOrderedTurnAnchors: (stateDir: string, sessionId: string) =>
    loadOrderedTurnAnchors(stateDir, sessionId, dedupeStrings),
  loadSegmentAnchorByCallId: (stateDir: string, sessionId: string) =>
    loadSegmentAnchorByCallId(stateDir, sessionId, {
      dedupeStrings,
      syncRawSemanticTurnsFromTranscript: async (dir: string, sid: string) => {
        await syncRawSemanticTurnsFromTranscript(dir, sid, {
          contentToText,
          contextSafeRecovery,
          memoryFaultRecoverToolName: MEMORY_FAULT_RECOVER_TOOL_NAME,
        });
      },
    }),
  makeLogger: () => makeLogger(),
};

function withTestReductionConfig(
  options?: {
    sessionId?: string;
    engine?: "layered";
    logger?: any;
    triggerMinChars?: number;
    maxToolChars?: number;
    passToggles?: Record<string, unknown>;
    passOptions?: Record<string, Record<string, unknown>>;
    beforeCallModules?: {
      policy?: any;
      eviction?: any;
    };
    cfg?: any;
  },
): {
  sessionId?: string;
  engine?: "layered";
  logger?: any;
  triggerMinChars?: number;
  maxToolChars?: number;
  passToggles?: Record<string, unknown>;
  passOptions?: Record<string, Record<string, unknown>>;
  beforeCallModules?: {
    policy?: any;
    eviction?: any;
  };
  cfg?: any;
} | undefined {
  if (!options) {
    return { cfg: { stateDir: TEST_WORKSPACE_DIR } };
  }
  return {
    ...options,
    cfg: {
      ...(options.cfg ?? {}),
      stateDir: options.cfg?.stateDir ?? TEST_WORKSPACE_DIR,
    },
  };
}

function withTestWorkspaceDir(result: ReturnType<typeof buildLayeredReductionContext>): ReturnType<typeof buildLayeredReductionContext> {
  return {
    ...result,
    turnCtx: {
      ...result.turnCtx,
      metadata: {
        ...(result.turnCtx.metadata ?? {}),
        workspaceDir:
          typeof result.turnCtx.metadata?.workspaceDir === "string"
            ? result.turnCtx.metadata.workspaceDir
            : TEST_WORKSPACE_DIR,
      },
    },
  };
}

function contextSafeRecovery(details: unknown): Record<string, unknown> | undefined {
  return importedContextSafeRecovery(details, asRecord);
}

function hasRecoveryMarker(details: unknown): boolean {
  return importedHasRecoveryMarker(details, asRecord);
}

const __testHooks = {
  rewritePayloadForStablePrefix,
  applyProxyReductionToInput: (
    payload: any,
    options?: {
      sessionId?: string;
      engine?: "layered";
      logger?: any;
      triggerMinChars?: number;
      maxToolChars?: number;
      passToggles?: Record<string, unknown>;
      passOptions?: Record<string, Record<string, unknown>>;
      beforeCallModules?: {
        policy?: any;
        eviction?: any;
      };
      cfg?: any;
    },
  ) => applyProxyReductionToInput(
    payload,
    withTestReductionConfig(options),
    defaultBeforeCallTestHelpers,
  ),
  stripInternalPayloadMarkers,
  normalizeConfig,
  responsesPayloadToChatCompletions,
  chatCompletionsToResponsesText,
};

module.exports = {
  id: "tokenpilot",
  name: "TokenPilot Runtime Optimizer",
  __testHooks,

  register(api: any) {
    const logger = makeLogger(api?.logger);
    const cfg = normalizeConfig(api?.pluginConfig);

    registerTokenPilotCommand(api, logger);

    if (!cfg.enabled) {
      logger.info("[plugin-runtime] Plugin disabled by config.");
      return;
    }

    if (cfg.hooks.beforeToolCall) {
      hookOn(api, "before_tool_call", async (event: any) => {
        const blockReason = await maybeBlockRepeatedToolCall(event, cfg, {
          appendTaskStateTrace,
        });
        if (blockReason) {
          return { block: true, blockReason };
        }
        return { params: applyBeforeToolCallDefaults(event) };
      });

      hookOn(api, "after_tool_call", (event: any) => {
        void recordToolCallMemo(event, cfg, {
          safeId,
          appendTaskStateTrace,
          logger,
        });
      });
    }

    if (cfg.hooks.toolResultPersist) {
      hookOn(api, "tool_result_persist", (event: any) => {
        const out = applyToolResultPersistPolicy(event, cfg, logger, {
          appendTaskStateTrace,
          ensureContextSafeDetails,
          extractOpenClawSessionId,
          extractToolMessageText,
          isToolResultLikeMessage,
          safeId,
        });
        return out ?? { message: event?.message };
      });
    }

    if (cfg.contextEngine.enabled && typeof api.registerContextEngine === "function") {
      api.registerContextEngine("layered-context", () => createPluginContextEngine(cfg, logger, {
        appendTaskStateTrace,
        readTranscriptEntriesForSession,
        transcriptMessageStableId,
        asRecord,
        canonicalMessageTaskIds,
        contentToText,
        dedupeStrings,
        ensureContextSafeDetails,
        extractPathLike,
        extractToolMessageText,
        isToolResultLikeMessage,
        messageToolCallId,
        safeId,
      }));
    } else if (cfg.contextEngine.enabled) {
      logger.warn("[plugin-runtime] registerContextEngine unavailable in this OpenClaw version.");
    }

    void registerRuntime(api, cfg, logger, {
      debugEnabled: cfg.logLevel === "debug",
      hookOn,
      safeId,
      contentToText,
      contextSafeRecovery,
      memoryFaultRecoverToolName: MEMORY_FAULT_RECOVER_TOOL_NAME,
      extractTurnObservations,
      extractSessionKey,
      extractLastUserMessage,
      extractOpenClawSessionId,
      normalizeTurnBindingMessage,
      extractItemText: (item: any) => extractItemText(item, extractInputText),
      findLastUserItem,
      syncRawSemanticTurnsFromTranscript,
      appendTaskStateTrace,
      maybeRegisterProxyProvider,
      ensureExplicitProxyModelsInConfig,
      installLlmHookTap,
      proxyRuntimeHelpers,
    });
  },
};
