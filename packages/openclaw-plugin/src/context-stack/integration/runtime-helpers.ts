/* eslint-disable @typescript-eslint/no-explicit-any */
import { basename, isAbsolute, resolve } from "node:path";

type PluginLoggerLike = {
  info?: (...args: any[]) => void;
  debug?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
};

export function makeLogger(input?: PluginLoggerLike): Required<PluginLoggerLike> {
  return {
    info: input?.info ?? ((...args) => console.log(...args)),
    debug: input?.debug ?? (() => {}),
    warn: input?.warn ?? ((...args) => console.warn(...args)),
    error: input?.error ?? ((...args) => console.error(...args)),
  };
}

export function hookOn(api: any, event: string, handler: (...args: any[]) => any): void {
  if (typeof api.on === "function") {
    api.on(event, handler);
    return;
  }
  if (typeof api.registerHook === "function") {
    api.registerHook(event, handler);
  }
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeWebSearchDateFilters(target: Record<string, unknown>): Record<string, unknown> {
  const freshness = typeof target.freshness === "string" ? target.freshness.trim() : "";
  const dateAfter = typeof target.date_after === "string" ? target.date_after.trim() : "";
  const dateBefore = typeof target.date_before === "string" ? target.date_before.trim() : "";
  if (!freshness || (!dateAfter && !dateBefore)) {
    return target;
  }
  return {
    ...target,
    freshness: "",
  };
}

export function applyBeforeToolCallDefaults(event: any): Record<string, unknown> {
  const toolName = String(
    event?.toolName
    ?? event?.tool_name
    ?? event?.name
    ?? event?.params?.toolName
    ?? event?.params?.tool_name
    ?? event?.params?.name
    ?? "",
  ).trim().toLowerCase();
  const params = event?.params && typeof event.params === "object"
    ? { ...(event.params as Record<string, unknown>) }
    : {};
  const args =
    params.args && typeof params.args === "object"
      ? { ...(params.args as Record<string, unknown>) }
      : null;
  const argumentsObject =
    params.arguments && typeof params.arguments === "object"
      ? { ...(params.arguments as Record<string, unknown>) }
      : null;

  if (toolName === "read") {
    const readTarget = args ?? argumentsObject ?? params;
    if (!isPositiveNumber(readTarget.limit)) readTarget.limit = 200;
    if (!isPositiveNumber(readTarget.offset)) readTarget.offset = 1;
    if (args) params.args = readTarget;
    if (argumentsObject) params.arguments = readTarget;
    return params;
  }
  if (toolName === "web_fetch") {
    const fetchTarget = args ?? argumentsObject ?? params;
    if (!isPositiveNumber(fetchTarget.maxChars)) fetchTarget.maxChars = 12_000;
    if (args) params.args = fetchTarget;
    if (argumentsObject) params.arguments = fetchTarget;
    return params;
  }
  if (toolName === "web_search") {
    const searchTarget = args ?? argumentsObject ?? params;
    const normalized = normalizeWebSearchDateFilters(searchTarget);
    if (args) params.args = normalized;
    if (argumentsObject) params.arguments = normalized;
    if (!args && !argumentsObject) return normalized;
  }
  return params;
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolvePathField(target: Record<string, unknown>, fieldName: string, workspaceDir: string): boolean {
  const current = trimText(target[fieldName]);
  if (!current || isAbsolute(current)) return false;
  target[fieldName] = resolve(workspaceDir, current);
  return true;
}

export function applyWorkspacePathHintToToolParams(
  event: any,
  workspaceDir: string | undefined,
): Record<string, unknown> | undefined {
  const normalizedWorkspaceDir = trimText(workspaceDir);
  const toolName = String(
    event?.toolName
    ?? event?.tool_name
    ?? event?.name
    ?? event?.params?.toolName
    ?? event?.params?.tool_name
    ?? event?.params?.name
    ?? "",
  ).trim().toLowerCase();
  if (!normalizedWorkspaceDir) return event?.params;
  if (!new Set(["read", "write", "edit"]).has(toolName)) return event?.params;

  const params = event?.params && typeof event.params === "object"
    ? { ...(event.params as Record<string, unknown>) }
    : {};
  const args =
    params.args && typeof params.args === "object"
      ? { ...(params.args as Record<string, unknown>) }
      : null;
  const argumentsObject =
    params.arguments && typeof params.arguments === "object"
      ? { ...(params.arguments as Record<string, unknown>) }
      : null;

  const target = args ?? argumentsObject ?? params;
  resolvePathField(target, "path", normalizedWorkspaceDir);

  if (args) params.args = target;
  if (argumentsObject) params.arguments = target;
  return params;
}

export function extractWorkspaceDirFromMessages(
  messages: any[],
  contentToTextFn: (value: unknown) => string,
): string | undefined {
  const patterns = [
    /Your working directory is:\s*([^\n\r]+)/i,
    /(?:^|\n)-\s*WORKDIR:\s*([^\n\r]+)/i,
  ];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const text = contentToTextFn(message?.content ?? message);
    if (!text.trim()) continue;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const candidate = trimText(match?.[1]);
      if (!candidate || candidate === "<WORKDIR>") continue;
      if (candidate.startsWith("/") || /^[A-Za-z]:[\\/]/.test(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

export function isToolResultLikeMessage(message: Record<string, unknown>): boolean {
  const role = String(message.role ?? "").toLowerCase();
  const type = String(message.type ?? "").toLowerCase();
  return (
    role === "toolresult" ||
    role === "tool" ||
    type === "toolresult" ||
    type === "tool_result" ||
    type === "function_call_output"
  );
}

export function extractToolMessageText(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string") return b.text;
      if (typeof b.content === "string") return b.content;
      return "";
    })
    .filter((v) => v.length > 0)
    .join("\n");
}

export function ensureContextSafeDetails(
  details: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = details && typeof details === "object" ? { ...(details as Record<string, unknown>) } : {};
  const contextSafe =
    base.contextSafe && typeof base.contextSafe === "object"
      ? { ...(base.contextSafe as Record<string, unknown>) }
      : {};
  base.contextSafe = { ...contextSafe, ...patch };
  return base;
}

export function messageToolCallId(message: Record<string, unknown>): string | undefined {
  const direct =
    typeof message.tool_call_id === "string" && message.tool_call_id.trim().length > 0
      ? message.tool_call_id.trim()
      : typeof message.toolCallId === "string" && message.toolCallId.trim().length > 0
        ? message.toolCallId.trim()
        : undefined;
  return direct;
}

export function dedupeStrings(values: string[]): string[] {
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

export function canonicalMessageTaskIds(
  message: Record<string, unknown>,
  asRecord: (value: unknown) => Record<string, unknown> | undefined,
): string[] {
  const details = asRecord(message.details);
  const contextSafe = asRecord(details?.contextSafe);
  return Array.isArray(contextSafe?.taskIds)
    ? contextSafe.taskIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

import { extractScopedSessionKey } from "../../session/scoped-session-key.js";

export function extractSessionKey(event: any): string {
  const agentMeta = event?.result?.meta?.agentMeta ?? event?.meta?.agentMeta ?? event?.agentMeta;
  const direct =
    event?.sessionKey ??
    event?.SessionKey ??
    event?.result?.sessionKey ??
    event?.result?.SessionKey ??
    event?.meta?.sessionKey ??
    event?.meta?.SessionKey ??
    event?.ctx?.SessionKey ??
    event?.ctx?.CommandTargetSessionKey ??
    event?.session?.key ??
    event?.sessionId ??
    event?.result?.sessionId ??
    agentMeta?.sessionKey ??
    agentMeta?.sessionId ??
    "";
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();

  const scoped = extractScopedSessionKey(event);
  if (scoped) return scoped;

  return "unknown";
}

export function contentToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => contentToText(item))
      .filter((s) => s.trim().length > 0)
      .join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.type === "thinking" || obj.type === "reasoning") {
      return "";
    }
    if (obj.type === "output_text" && typeof obj.text === "string") {
      return obj.text;
    }
    const preferred = obj.text ?? obj.content ?? obj.value ?? obj.message;
    if (preferred !== undefined) {
      const nested = contentToText(preferred);
      if (nested.trim().length > 0) return nested;
    }
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }
  return String(value);
}

export function extractLastUserMessage(event: any): string {
  const promptText = typeof event?.prompt === "string" ? event.prompt.trim() : "";
  if (promptText) return promptText;
  const messages = Array.isArray(event?.messages) ? event.messages : [];
  const lastUser = [...messages].reverse().find((m: any) => m?.role === "user");
  return contentToText(lastUser?.content ?? event?.message?.content ?? event?.message ?? "");
}

export function extractOpenClawSessionId(event: any): string {
  const agentMeta = event?.result?.meta?.agentMeta ?? event?.meta?.agentMeta ?? event?.agentMeta;
  const sessionFile =
    event?.sessionFile ??
    event?.result?.sessionFile ??
    event?.meta?.sessionFile ??
    agentMeta?.sessionFile ??
    "";
  if (typeof sessionFile === "string" && sessionFile.trim().length > 0) {
    const fileBase = basename(sessionFile.trim()).replace(/\.jsonl$/i, "").trim();
    if (fileBase.length > 0) return fileBase;
  }
  const direct =
    event?.sessionId ??
    event?.SessionId ??
    event?.ctx?.SessionId ??
    event?.result?.sessionId ??
    event?.result?.SessionId ??
    event?.meta?.sessionId ??
    event?.meta?.SessionId ??
    event?.session?.id ??
    agentMeta?.sessionId ??
    "";
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  return "";
}

export function extractResponseTextFromProviderNode(value: unknown, contentToTextFn: (value: unknown) => string): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return contentToTextFn(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractResponseTextFromProviderNode(item, contentToTextFn))
      .filter((s) => s.trim().length > 0)
      .join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const type = String(obj.type ?? "").toLowerCase();
    const role = String(obj.role ?? "").toLowerCase();
    if (type === "output_text" && typeof obj.text === "string") {
      return obj.text;
    }
    if (typeof obj.delta === "string" && obj.delta.trim().length > 0) {
      return obj.delta;
    }
    if (type === "message" || role === "assistant") {
      return extractResponseTextFromProviderNode(obj.content ?? obj.output ?? obj.text, contentToTextFn);
    }
    return extractResponseTextFromProviderNode(
      obj.response ?? obj.output ?? obj.item ?? obj.content ?? obj.text ?? obj.message,
      contentToTextFn,
    );
  }
  return "";
}

export function extractProviderResponseText(rawText: string, parsed: unknown, contentToTextFn: (value: unknown) => string): string {
  const parsedRecord = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const parsedType = String(parsedRecord?.type ?? "").toLowerCase();
  const fromParsed = parsedType === "response.created" ? "" : extractResponseTextFromProviderNode(parsed, contentToTextFn);
  if (fromParsed.trim().length > 0) return fromParsed.trim();

  let deltaText = "";
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    try {
      const record = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      const type = String(record.type ?? "").toLowerCase();
      if (type === "response.created") continue;
      const fromRecord = extractResponseTextFromProviderNode(
        record.response ?? record.output ?? record.item ?? record,
        contentToTextFn,
      );
      if (fromRecord.trim().length > 0) return fromRecord.trim();
      if (typeof record.delta === "string") {
        deltaText += record.delta;
      }
    } catch {
      // ignore malformed stream fragments
    }
  }
  return deltaText.trim();
}

export function extractLastAssistant(event: any, contentToTextFn: (value: unknown) => string): any {
  const messages = Array.isArray(event?.messages) ? event.messages : [];
  const fromMessages = [...messages].reverse().find((m: any) => m?.role === "assistant");
  if (fromMessages) return fromMessages;

  const payloads = Array.isArray(event?.result?.payloads) ? event.result.payloads : [];
  if (payloads.length === 0) return null;
  const payloadText = payloads
    .map((payload: any) => contentToTextFn(payload?.text ?? payload?.content ?? payload))
    .filter((s: string) => s.trim().length > 0)
    .join("\n");
  const lastPayload = payloads[payloads.length - 1];

  const agentMeta = event?.result?.meta?.agentMeta ?? event?.meta?.agentMeta ?? event?.agentMeta ?? {};
  const usage = agentMeta?.lastCallUsage ?? agentMeta?.usage ?? event?.usage ?? {};
  return {
    role: "assistant",
    content: payloadText || contentToTextFn(lastPayload?.text ?? lastPayload?.content ?? ""),
    provider: agentMeta?.provider ?? event?.provider,
    model: agentMeta?.model ?? event?.model,
    usage,
  };
}

export function extractItemText(item: any, extractInputTextFn: (input: any) => string): string {
  if (!item || typeof item !== "object") return "";
  return extractInputTextFn([item]).trim();
}

export function findLastUserItem(input: any): { userIndex: number; userItem: any | null } | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    const item = input[i];
    if (!item || typeof item !== "object") continue;
    if (String((item as any).role) === "user") {
      return { userIndex: i, userItem: item };
    }
  }
  return null;
}

export function stripReplyTag(text: string): string {
  return String(text ?? "").replace(/^\s*\[\[[^\]]+\]\]\s*/u, "").trim();
}
