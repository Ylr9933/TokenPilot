/* eslint-disable @typescript-eslint/no-explicit-any */
import { rewriteCanonicalState, syncCanonicalStateFromTranscript } from "../page-out/canonical-rewrite-adapter.js";
import { estimateMessagesChars, saveCanonicalState } from "@tokenpilot/history";
import { enqueueEvictedTasksForProceduralMemory } from "./procedural-memory.js";

export function createPluginContextEngine(cfg: any, logger: any, deps: any) {
  const canonicalMessageTaskIdsBound = (message: Record<string, unknown>): string[] => deps.canonicalMessageTaskIds(message, deps.asRecord);
  return {
    info: {
      id: "layered-context",
      name: "Layered Context Engine",
    },
    async ingest() {
      return { ingested: false };
    },
    async afterTurn(params: { sessionId: string; messages: any[] }) {
      const synced = await syncCanonicalStateFromTranscript({
        stateDir: cfg.stateDir,
        sessionId: params.sessionId,
        getMessage: (entry: any) => entry.message,
        helpers: {
          appendTaskStateTrace: deps.appendTaskStateTrace,
          readTranscriptEntriesForSession: deps.readTranscriptEntriesForSession,
          stableIdForEntry: deps.transcriptMessageStableId,
        },
      });
      const rewritten = await rewriteCanonicalState({
        stateDir: cfg.stateDir,
        sessionId: params.sessionId,
        state: synced.state,
        evictionEnabled: cfg.modules.eviction && cfg.eviction.enabled,
        evictionPolicy: cfg.eviction.policy,
        evictionMinBlockChars: cfg.eviction.minBlockChars,
        evictionReplacementMode: cfg.eviction.replacementMode,
        helpers: {
          appendTaskStateTrace: deps.appendTaskStateTrace,
          appendEvictionVisualSnapshot: deps.appendEvictionVisualSnapshot,
          asRecord: deps.asRecord,
          canonicalMessageTaskIds: canonicalMessageTaskIdsBound,
          contentToText: deps.contentToText,
          dedupeStrings: deps.dedupeStrings,
          ensureContextSafeDetails: deps.ensureContextSafeDetails,
          extractPathLike: deps.extractPathLike,
          extractToolMessageText: deps.extractToolMessageText,
          isToolResultLikeMessage: deps.isToolResultLikeMessage,
          logger,
          messageToolCallId: deps.messageToolCallId,
          safeId: deps.safeId,
        },
      });
      await enqueueEvictedTasksForProceduralMemory({
        cfg,
        sessionId: params.sessionId,
        state: rewritten.state,
        appliedTaskIds: rewritten.appliedEvictionTaskIds,
        helpers: deps,
        logger,
      });
      if (synced.changed || rewritten.changed) await saveCanonicalState(cfg.stateDir, rewritten.state);
    },
    async assemble(params: { sessionId: string; messages: any[]; tokenBudget?: number }) {
      const synced = await syncCanonicalStateFromTranscript({
        stateDir: cfg.stateDir,
        sessionId: params.sessionId,
        getMessage: (entry: any) => entry.message,
        helpers: {
          appendTaskStateTrace: deps.appendTaskStateTrace,
          readTranscriptEntriesForSession: deps.readTranscriptEntriesForSession,
          stableIdForEntry: deps.transcriptMessageStableId,
        },
      });
      const rewritten = await rewriteCanonicalState({
        stateDir: cfg.stateDir,
        sessionId: params.sessionId,
        state: synced.state,
        evictionEnabled: cfg.modules.eviction && cfg.eviction.enabled,
        evictionPolicy: cfg.eviction.policy,
        evictionMinBlockChars: cfg.eviction.minBlockChars,
        evictionReplacementMode: cfg.eviction.replacementMode,
        helpers: {
          appendTaskStateTrace: deps.appendTaskStateTrace,
          appendEvictionVisualSnapshot: deps.appendEvictionVisualSnapshot,
          asRecord: deps.asRecord,
          canonicalMessageTaskIds: canonicalMessageTaskIdsBound,
          contentToText: deps.contentToText,
          dedupeStrings: deps.dedupeStrings,
          ensureContextSafeDetails: deps.ensureContextSafeDetails,
          extractPathLike: deps.extractPathLike,
          extractToolMessageText: deps.extractToolMessageText,
          isToolResultLikeMessage: deps.isToolResultLikeMessage,
          logger,
          messageToolCallId: deps.messageToolCallId,
          safeId: deps.safeId,
        },
      });
      await enqueueEvictedTasksForProceduralMemory({
        cfg,
        sessionId: params.sessionId,
        state: rewritten.state,
        appliedTaskIds: rewritten.appliedEvictionTaskIds,
        helpers: deps,
        logger,
      });
      if (synced.changed || rewritten.changed) await saveCanonicalState(cfg.stateDir, rewritten.state);
      const estimatedChars = estimateMessagesChars(rewritten.state.messages, deps.contentToText);
      return { messages: rewritten.state.messages, estimatedTokens: Math.max(1, Math.ceil(estimatedChars / 4)) };
    },
    async compact(params: { sessionId: string; messages?: any[]; force?: boolean }) {
      const synced = await syncCanonicalStateFromTranscript({
        stateDir: cfg.stateDir,
        sessionId: params.sessionId,
        getMessage: (entry: any) => entry.message,
        helpers: {
          appendTaskStateTrace: deps.appendTaskStateTrace,
          readTranscriptEntriesForSession: deps.readTranscriptEntriesForSession,
          stableIdForEntry: deps.transcriptMessageStableId,
        },
      });
      const rewritten = await rewriteCanonicalState({
        stateDir: cfg.stateDir,
        sessionId: params.sessionId,
        state: synced.state,
        evictionEnabled: cfg.modules.eviction && cfg.eviction.enabled,
        evictionPolicy: cfg.eviction.policy,
        evictionMinBlockChars: cfg.eviction.minBlockChars,
        evictionReplacementMode: cfg.eviction.replacementMode,
        helpers: {
          appendTaskStateTrace: deps.appendTaskStateTrace,
          appendEvictionVisualSnapshot: deps.appendEvictionVisualSnapshot,
          asRecord: deps.asRecord,
          canonicalMessageTaskIds: canonicalMessageTaskIdsBound,
          contentToText: deps.contentToText,
          dedupeStrings: deps.dedupeStrings,
          ensureContextSafeDetails: deps.ensureContextSafeDetails,
          extractPathLike: deps.extractPathLike,
          extractToolMessageText: deps.extractToolMessageText,
          isToolResultLikeMessage: deps.isToolResultLikeMessage,
          logger,
          messageToolCallId: deps.messageToolCallId,
          safeId: deps.safeId,
        },
      });
      await enqueueEvictedTasksForProceduralMemory({
        cfg,
        sessionId: params.sessionId,
        state: rewritten.state,
        appliedTaskIds: rewritten.appliedEvictionTaskIds,
        helpers: deps,
        logger,
      });
      if (synced.changed || rewritten.changed) await saveCanonicalState(cfg.stateDir, rewritten.state);
      return {
        ok: true,
        compacted: synced.changed || rewritten.changed,
        reason: synced.changed || rewritten.changed ? "tokenpilot canonical state updated" : "tokenpilot canonical state unchanged",
      };
    },
  };
}
