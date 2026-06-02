/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prependTextToContent } from "../request-preprocessing/root-prompt-stabilizer.js";
import { formatProceduralMemoryInjection, createLocalProceduralMemoryBackend, createPromptingDistiller, loadSkills, runProceduralMemoryBatch } from "@tokenpilot/memory";
import { loadSessionTaskRegistry } from "@tokenpilot/history";
import { hashText, pluginStateSubdirCandidates } from "@tokenpilot/runtime-core";

function extractTaskObjective(registry: Awaited<ReturnType<typeof loadSessionTaskRegistry>>, taskId: string): string {
  return String(registry.tasks[taskId]?.objective ?? "").trim();
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function extractLastUserPrompt(input: any, helpers: any): string {
  if (!Array.isArray(input) || input.length === 0) return "";
  for (let i = input.length - 1; i >= 0; i -= 1) {
    const item = input[i];
    if (!item || typeof item !== "object") continue;
    if (String((item as any).role ?? "") !== "user") continue;
    return String(helpers.extractInputText([item]) ?? "").trim();
  }
  return "";
}

function toCanonicalEvictionStableTaskId(taskId: string): string {
  const trimmed = taskId.trim().toLowerCase();
  const norm = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return norm || "main";
}

function embeddingProviderFromConfig(cfg: any):
  | {
      baseUrl: string;
      apiKey: string;
      model: string;
      queryInstruction?: string;
    }
  | undefined {
  const embedding = cfg?.memory?.embedding;
  if (!embedding || embedding.enabled !== true) return undefined;
  const baseUrl = String(embedding.baseUrl ?? "").trim();
  const apiKey = String(embedding.apiKey ?? "").trim();
  const model = String(embedding.model ?? "").trim();
  if (!baseUrl || !apiKey || !model) return undefined;
  return {
    baseUrl,
    apiKey,
    model,
    queryInstruction: typeof embedding.queryInstruction === "string" ? embedding.queryInstruction.trim() : undefined,
  };
}

function distillProviderFromConfig(cfg: any):
  | {
      baseUrl: string;
      apiKey: string;
      model: string;
      requestTimeoutMs?: number;
    }
  | undefined {
  const provider = cfg?.memory?.distillProvider;
  if (!provider) return undefined;
  const baseUrl = String(provider.baseUrl ?? "").trim();
  const apiKey = String(provider.apiKey ?? "").trim();
  const model = String(provider.model ?? "").trim();
  if (!baseUrl || !apiKey || !model) return undefined;
  return {
    baseUrl,
    apiKey,
    model,
    requestTimeoutMs: typeof provider.requestTimeoutMs === "number" ? provider.requestTimeoutMs : undefined,
  };
}

function createConfiguredDistiller(cfg: any) {
  const provider = distillProviderFromConfig(cfg);
  if (!provider) return undefined;
  const kind = String(cfg?.memory?.distillerType ?? "prompting").trim();
  if (kind === "prompting") return createPromptingDistiller(provider);
  if (kind === "autoskill") throw new Error("procedural_memory_distiller_not_implemented:autoskill");
  if (kind === "ctx2skill") throw new Error("procedural_memory_distiller_not_implemented:ctx2skill");
  throw new Error(`procedural_memory_distiller_unknown:${kind}`);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function jsonTextFromChatPayload(payload: any): string {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const first = choices[0];
  const content = first?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const texts = content
      .map((part: any) => (typeof part?.text === "string" ? part.text.trim() : ""))
      .filter((text: string) => text.length > 0);
    if (texts.length > 0) return texts.join("\n");
  }
  return "";
}

async function adaptProceduralMemoryInjection(params: {
  cfg: any;
  objective: string;
  rawInjectionText: string;
}): Promise<{ useful: boolean; adaptedHint: string; reason: string }> {
  const provider = distillProviderFromConfig(params.cfg);
  if (!provider || !params.rawInjectionText.trim()) {
    return {
      useful: false,
      adaptedHint: "",
      reason: provider ? "empty_candidate" : "adapter_missing",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1000, typeof provider.requestTimeoutMs === "number" ? provider.requestTimeoutMs : 60_000),
  );
  try {
    const systemPrompt = [
      "You adapt procedural memory into a minimal task-specific factual hint for an agent.",
      "Decide whether any part of the candidate memory is genuinely useful for the current task.",
      "Keep only the smallest useful subset.",
      "Prefer transcript-grounded specifics over generic advice.",
      "Favor concise retained facts, decisions, owners, deadlines, named entities, quotes, constraints, and concrete checks.",
      "Drop generic methodology, broad writing advice, stylistic guidance, and any detail that is weakly related or likely to encourage fabrication.",
      "Return only JSON with exactly this schema:",
      "{\"useful\":boolean,\"retained_facts\":string[],\"reason\":string}",
      "If useful is true, retained_facts must contain 1 to 3 short bullets.",
      "Each bullet must be under 18 words.",
      "Keep the total output under 55 words.",
      "Only keep details that are directly helpful for the current task.",
      "Do not add new facts.",
      "Do not repeat boilerplate.",
      "If the memory is not useful, set useful=false and retained_facts to an empty array.",
    ].join(" ");
    const userPayload = JSON.stringify({
      objective: params.objective,
      candidate_memory: params.rawInjectionText,
    });
    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        response_format: {
          type: "json_object",
        },
        temperature: 0,
      }),
    });
    if (!response.ok) {
      throw new Error(`memory_adapter_failed:${response.status}:${await response.text()}`);
    }
    const payload = await response.json();
    const raw = JSON.parse(jsonTextFromChatPayload(payload) || "{}") as {
      useful?: boolean;
      retained_facts?: string[];
      reason?: string;
    };
    const retainedFacts = Array.isArray(raw?.retained_facts)
      ? raw.retained_facts
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .slice(0, 3)
      : [];
    const adaptedHint = retainedFacts.map((fact) => `- ${fact}`).join("\n").trim();
    const useful = adaptedHint.length > 0 && raw?.useful !== false;
    return {
      useful,
      adaptedHint: useful ? adaptedHint : "",
      reason: typeof raw?.reason === "string" && raw.reason.trim() ? raw.reason.trim() : "adapter_decision",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      useful: false,
      adaptedHint: "",
      reason: `adapter_failed:${reason}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function collectArchivePaths(state: any, taskId: string, helpers: any): string[] {
  const out: string[] = [];
  const messages = Array.isArray(state?.messages) ? state.messages : [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as Record<string, unknown>;
    const details = helpers.asRecord(message.details);
    const contextSafe = helpers.asRecord(details?.contextSafe);
    const taskIds = Array.isArray(contextSafe?.taskIds)
      ? contextSafe.taskIds.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (!taskIds.includes(taskId)) continue;
    const eviction = helpers.asRecord(contextSafe?.eviction);
    const archivePath = typeof eviction?.archivePath === "string" ? eviction.archivePath.trim() : "";
    if (archivePath) out.push(archivePath);
  }
  return unique(out);
}

async function resolveCanonicalEvictionArchivePaths(
  cfg: any,
  sessionId: string,
  state: any,
  taskId: string,
  helpers: any,
): Promise<string[]> {
  const messagePaths = collectArchivePaths(state, taskId, helpers);
  if (messagePaths.length > 0) return messagePaths;

  const stableTaskId = toCanonicalEvictionStableTaskId(taskId);
  const dataKey = `canonical_task_eviction:${stableTaskId}`;
  const lookupDirs = pluginStateSubdirCandidates(cfg.stateDir, "canonical-eviction", "task");
  let archivePath: string | null = null;
  for (const archiveDir of lookupDirs) {
    const keyPath = join(archiveDir, "keys", `${hashText(dataKey)}.json`);
    try {
      const raw = await readFile(keyPath, "utf8");
      const parsed = JSON.parse(raw) as { dataKey?: string; archivePath?: string };
      if (parsed?.dataKey === dataKey && typeof parsed.archivePath === "string" && parsed.archivePath.trim()) {
        archivePath = parsed.archivePath.trim();
        break;
      }
    } catch {
      // Try aggregate lookup next.
    }
    try {
      const raw = await readFile(join(archiveDir, "key-lookup.json"), "utf8");
      const parsed = JSON.parse(raw) as Record<string, string>;
      const found = typeof parsed[dataKey] === "string" ? parsed[dataKey].trim() : "";
      if (found) {
        archivePath = found;
        break;
      }
    } catch {
      // Try next candidate directory.
    }
  }
  return archivePath ? [archivePath] : [];
}

export async function enqueueEvictedTasksForProceduralMemory(params: {
  cfg: any;
  sessionId: string;
  state: any;
  appliedTaskIds: string[];
  helpers: any;
  logger: any;
}): Promise<{ enqueued: number; processed: number; produced: number }> {
  const evidenceMode = String(params.cfg?.taskStateEstimator?.evidenceMode ?? "three_state");
  if (
    evidenceMode === "two_state"
    || !params.cfg.memory.enabled
    || !params.cfg.memory.autoDistill
    || params.appliedTaskIds.length === 0
  ) {
    return { enqueued: 0, processed: 0, produced: 0 };
  }
  const backend = createLocalProceduralMemoryBackend(params.cfg.stateDir, {
    embeddingProvider: embeddingProviderFromConfig(params.cfg),
    distillProvider: distillProviderFromConfig(params.cfg),
  });
  const registry = await loadSessionTaskRegistry(params.cfg.stateDir, params.sessionId);
  const uniqueTaskIds = unique(params.appliedTaskIds);
  const payloads: Array<{
    sessionId: string;
    taskId: string;
    archivePath: string;
    archiveSourceLabel: string;
    archiveDigest?: string;
    objective: string;
    completionEvidence: string[];
    unresolvedQuestions: string[];
    turnAbsIds: string[];
  }> = [];
  const archivePathCountByTask: Record<string, number> = {};
  for (const taskId of uniqueTaskIds) {
    const task = registry.tasks[taskId];
    if (!task) continue;
    const archivePaths = await resolveCanonicalEvictionArchivePaths(
      params.cfg,
      params.sessionId,
      params.state,
      taskId,
      params.helpers,
    );
    archivePathCountByTask[taskId] = archivePaths.length;
    for (const archivePath of archivePaths) {
      payloads.push({
        sessionId: params.sessionId,
        taskId,
        archivePath,
        archiveSourceLabel: "canonical_task_eviction",
        objective: extractTaskObjective(registry, taskId),
        completionEvidence: [...task.completionEvidence],
        unresolvedQuestions: [...task.unresolvedQuestions],
        turnAbsIds: [...task.span.supportingTurnAbsIds],
      });
    }
  }
  const enqueued = await backend.enqueue(payloads);
  let batch = { drained: 0, produced: 0, failed: 0 };
  const distillerType = String(params.cfg?.memory?.distillerType ?? "prompting").trim();
  const distiller = createConfiguredDistiller(params.cfg);
  let distillerStatus = "disabled";
  if (distiller) {
    try {
      distillerStatus = "active";
      batch = await runProceduralMemoryBatch({
      backend,
      batchSize: params.cfg.memory.batchSize,
      distiller,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      distillerStatus = "setup_failed";
      params.logger.warn?.(
        `[plugin-runtime/procedural-memory] session=${params.sessionId} distiller=${distillerType} distiller_setup_failed reason=${reason}`,
      );
    }
  } else if (distillProviderFromConfig(params.cfg)) {
    distillerStatus = "provider_missing_or_disabled";
  }
  await params.helpers.appendTaskStateTrace(params.cfg.stateDir, {
    stage: "procedural_memory_batch",
    sessionId: params.sessionId,
    distillerType,
    distillerStatus,
    enqueued,
    processed: batch.drained,
    produced: batch.produced,
    failed: batch.failed,
    taskIds: uniqueTaskIds,
    payloadCount: payloads.length,
    archivePathCountByTask,
  });
  params.logger.info(
    `[plugin-runtime/procedural-memory] session=${params.sessionId} distiller=${distillerType} status=${distillerStatus} enqueued=${enqueued} processed=${batch.drained} produced=${batch.produced} failed=${batch.failed} payloads=${payloads.length}`,
  );
  return { enqueued, processed: batch.drained, produced: batch.produced };
}

export async function injectProceduralMemoryHints(params: {
  cfg: any;
  sessionId: string;
  payload: any;
  helpers: any;
}): Promise<{ injected: boolean; hitCount: number }> {
  const evidenceMode = String(params.cfg?.taskStateEstimator?.evidenceMode ?? "three_state");
  if (evidenceMode === "two_state" || !params.cfg.memory.enabled || params.cfg.memory.topK <= 0) {
    await params.helpers.appendTaskStateTrace(params.cfg.stateDir, {
      stage: "procedural_memory_retrieval",
      sessionId: params.sessionId,
      injected: false,
      reason: evidenceMode === "two_state" ? "two_state_evidence_mode" : "disabled_or_topk_zero",
      topK: params.cfg?.memory?.topK ?? 0,
      activeTaskId: "",
      objective: "",
      hitCount: 0,
      skillIds: [],
    });
    return { injected: false, hitCount: 0 };
  }
  const objective = extractLastUserPrompt(params.payload?.input, params.helpers);
  if (!objective) {
    await params.helpers.appendTaskStateTrace(params.cfg.stateDir, {
      stage: "procedural_memory_retrieval",
      sessionId: params.sessionId,
      injected: false,
      reason: "empty_objective",
      topK: params.cfg.memory.topK,
      activeTaskId: "",
      objective,
      hitCount: 0,
      skillIds: [],
    });
    return { injected: false, hitCount: 0 };
  }

  const backend = createLocalProceduralMemoryBackend(params.cfg.stateDir, {
    embeddingProvider: embeddingProviderFromConfig(params.cfg),
    distillProvider: distillProviderFromConfig(params.cfg),
  });
  const visibleSkills = await loadSkills(params.cfg.stateDir, params.sessionId);
  const hits = await backend.retrieve({
    sessionId: params.sessionId,
    objective,
    topK: params.cfg.memory.topK,
  });
  await params.helpers.appendTaskStateTrace(params.cfg.stateDir, {
    stage: "procedural_memory_retrieval",
    sessionId: params.sessionId,
    injected: hits.length > 0,
    reason: hits.length > 0 ? "hits_found" : "no_hits",
    topK: params.cfg.memory.topK,
    activeTaskId: "",
    objective,
    hitCount: hits.length,
    skillIds: hits.map((hit) => hit.skill.skillId),
    visibleSkillCount: visibleSkills.length,
    visibleSkillIds: visibleSkills.slice(0, 5).map((skill) => skill.skillId),
    stateDir: params.cfg.stateDir,
  });
  if (hits.length === 0) return { injected: false, hitCount: 0 };

  const rawText = formatProceduralMemoryInjection(hits);
  if (!rawText) return { injected: false, hitCount: 0 };
  const adapted = await adaptProceduralMemoryInjection({
    cfg: params.cfg,
    objective,
    rawInjectionText: rawText,
  });
  await params.helpers.appendTaskStateTrace(params.cfg.stateDir, {
    stage: "procedural_memory_adapted",
    sessionId: params.sessionId,
    objective,
    useful: adapted.useful,
    reason: adapted.reason,
    rawLength: rawText.length,
    adaptedLength: adapted.adaptedHint.length,
    hitCount: hits.length,
    skillIds: hits.map((hit) => hit.skill.skillId),
  });
  if (!adapted.useful || !adapted.adaptedHint) return { injected: false, hitCount: 0 };
  const text = `[TokenPilot Procedural Memory]\n${adapted.adaptedHint}`.trim();

  if (!Array.isArray(params.payload.input)) params.payload.input = [];
  if (params.cfg.memory.injectAsSystemHint) {
    params.payload.input.unshift({
      role: "system",
      content: text,
    });
  } else {
    const userIndex = params.payload.input.findIndex((item: any) => item && typeof item === "object" && String(item.role ?? "") === "user");
    if (userIndex >= 0) {
      const userItem = params.payload.input[userIndex];
      params.payload.input[userIndex] = {
        ...userItem,
        role: "user",
        content: prependTextToContent(userItem?.content, text),
      };
    } else {
      params.payload.input.unshift({
        role: "user",
        content: text,
      });
    }
  }
  await params.helpers.appendTaskStateTrace(params.cfg.stateDir, {
    stage: "procedural_memory_injected",
    sessionId: params.sessionId,
    distillerType: String(params.cfg?.memory?.distillerType ?? "prompting").trim(),
    activeTaskId: "",
    objective,
    hitCount: hits.length,
    skillIds: hits.map((hit) => hit.skill.skillId),
  });
  return { injected: true, hitCount: hits.length };
}
