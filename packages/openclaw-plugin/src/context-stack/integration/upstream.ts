/* eslint-disable @typescript-eslint/no-explicit-any */
import { execFile } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import { mkdir, appendFile, readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { pluginStateSubdir } from "@tokenpilot/runtime-core";

export type UpstreamModelDef = {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
};

export type UpstreamConfig = {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  apiFamily?: string;
  models: UpstreamModelDef[];
};

type DetectUpstreamOptions = {
  preferredProviderId?: string;
  preferredBaseUrl?: string;
  preferredApiKey?: string;
};

export type UpstreamHttpResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
  transport: "fetch" | "curl";
};

export type UpstreamStreamResponse = {
  status: number;
  headers: Record<string, string>;
  stream: Readable;
  transport: "fetch";
};

function runExecFile(
  file: string,
  args: string[],
  options?: {
    input?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        env: options?.env,
        timeout: options?.timeoutMs,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${file} failed: ${stderr || error.message}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    if (options?.input != null) {
      child.stdin?.end(options.input);
    }
  });
}

function parseCurlHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("HTTP/")) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    headers[trimmed.slice(0, idx).trim().toLowerCase()] = trimmed.slice(idx + 1).trim();
  }
  return headers;
}

function resolveUpstreamProxySettings(): {
  httpProxy?: string;
  httpsProxy?: string;
  allProxy?: string;
  noProxy?: string;
} {
  const httpProxy =
    process.env.TOKENPILOT_UPSTREAM_HTTP_PROXY
    || process.env.tokenpilot_upstream_http_proxy
    || process.env.ECOCLAW_UPSTREAM_HTTP_PROXY
    || process.env.ecoclaw_upstream_http_proxy
    || process.env.http_proxy
    || process.env.HTTP_PROXY;
  const httpsProxy =
    process.env.TOKENPILOT_UPSTREAM_HTTPS_PROXY
    || process.env.tokenpilot_upstream_https_proxy
    || process.env.ECOCLAW_UPSTREAM_HTTPS_PROXY
    || process.env.ecoclaw_upstream_https_proxy
    || process.env.https_proxy
    || process.env.HTTPS_PROXY
    || httpProxy;
  const allProxy =
    process.env.TOKENPILOT_UPSTREAM_ALL_PROXY
    || process.env.tokenpilot_upstream_all_proxy
    || process.env.ECOCLAW_UPSTREAM_ALL_PROXY
    || process.env.ecoclaw_upstream_all_proxy
    || process.env.all_proxy
    || process.env.ALL_PROXY;
  const noProxy =
    process.env.TOKENPILOT_UPSTREAM_NO_PROXY
    || process.env.tokenpilot_upstream_no_proxy
    || process.env.ECOCLAW_UPSTREAM_NO_PROXY
    || process.env.ecoclaw_upstream_no_proxy
    || process.env.no_proxy
    || process.env.NO_PROXY
    || "127.0.0.1,localhost";
  return {
    httpProxy: httpProxy?.trim() || undefined,
    httpsProxy: httpsProxy?.trim() || undefined,
    allProxy: allProxy?.trim() || undefined,
    noProxy: noProxy?.trim() || undefined,
  };
}

function hasExplicitUpstreamProxyEnv(): boolean {
  const settings = resolveUpstreamProxySettings();
  return Boolean(settings.httpProxy || settings.httpsProxy || settings.allProxy);
}

export function isCompletionsApiFamily(apiFamily: string | undefined): boolean {
  return String(apiFamily ?? "openai-responses").toLowerCase().includes("completions");
}

function isSseContentType(contentType: string | null | undefined): boolean {
  return String(contentType ?? "").toLowerCase().includes("text/event-stream");
}

export function upstreamEndpoint(upstream: UpstreamConfig): string {
  const family = String(upstream.apiFamily ?? "openai-responses").toLowerCase();
  if (family.includes("completions")) {
    return `${upstream.baseUrl}/chat/completions`;
  }
  return `${upstream.baseUrl}/responses`;
}

function normalizeInputTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const t = String(b.type ?? "").toLowerCase();
    if ((t === "input_text" || t === "text" || t === "output_text") && typeof b.text === "string") {
      parts.push(b.text);
    } else if (typeof b.content === "string") {
      parts.push(b.content);
    }
  }
  return parts.join("\n");
}

function normalizeChatCompletionsRole(role: unknown): string {
  const normalized = String(role ?? "user").toLowerCase();
  if (normalized === "developer") return "system";
  if (normalized === "system" || normalized === "assistant" || normalized === "tool") return normalized;
  return "user";
}

function normalizeToolOutputContent(output: unknown): string {
  if (typeof output === "string") return output;
  if (output == null) return "";
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function responsesInputItemToChatCompletionsMessages(item: any): any[] {
  if (!item || typeof item !== "object") return [];

  const type = String(item.type ?? "").toLowerCase();
  if (type === "function_call") {
    const callId = String(item.call_id ?? item.id ?? "").trim();
    const name = String(item.name ?? "").trim();
    if (!name) return [];
    return [{
      role: "assistant",
      content: "",
      tool_calls: [{
        id: callId || undefined,
        type: "function",
        function: {
          name,
          arguments: String(item.arguments ?? ""),
        },
      }],
    }];
  }

  if (type === "function_call_output") {
    const toolCallId = String(item.call_id ?? item.tool_call_id ?? "").trim();
    if (!toolCallId) return [];
    return [{
      role: "tool",
      tool_call_id: toolCallId,
      content: normalizeToolOutputContent(item.output),
    }];
  }

  const role = normalizeChatCompletionsRole(item.role);
  const content = normalizeInputTextContent(item.content);
  return [{
    role,
    content,
  }];
}

function responsesToolToChatCompletionsTool(tool: any): any | null {
  if (!tool || typeof tool !== "object") return null;
  const type = String(tool.type ?? "").toLowerCase();
  if (type !== "function") return null;
  const fn = tool.function && typeof tool.function === "object" ? tool.function : null;
  const name = String(fn?.name ?? tool.name ?? "").trim();
  if (!name) return null;
  return {
    type: "function",
    function: {
      name,
      description:
        typeof fn?.description === "string"
          ? fn.description
          : typeof tool.description === "string"
            ? tool.description
            : undefined,
      parameters:
        fn?.parameters && typeof fn.parameters === "object"
          ? fn.parameters
          : tool.parameters && typeof tool.parameters === "object"
            ? tool.parameters
            : undefined,
      strict:
        fn?.strict === true
          ? true
          : tool.strict === true
            ? true
            : undefined,
    },
  };
}

function responsesToolChoiceToChatCompletionsToolChoice(toolChoice: any): any {
  if (toolChoice == null) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  if (!toolChoice || typeof toolChoice !== "object") return undefined;
  const type = String(toolChoice.type ?? "").toLowerCase();
  if (type !== "function") return undefined;
  const fn = toolChoice.function && typeof toolChoice.function === "object" ? toolChoice.function : null;
  const name = String(fn?.name ?? toolChoice.name ?? "").trim();
  if (!name) return undefined;
  return {
    type: "function",
    function: { name },
  };
}

export function responsesPayloadToChatCompletions(payload: any): any {
  const input = Array.isArray(payload?.input) ? payload.input : [];
  const messages = input.flatMap((item: any) => responsesInputItemToChatCompletionsMessages(item));
  const model = typeof payload?.model === "string" ? payload.model : undefined;
  const tools = Array.isArray(payload?.tools)
    ? payload.tools.map((tool: any) => responsesToolToChatCompletionsTool(tool)).filter(Boolean)
    : undefined;
  const toolChoice = responsesToolChoiceToChatCompletionsToolChoice(payload?.tool_choice);
  return {
    model,
    messages,
    temperature: typeof payload?.temperature === "number" ? payload.temperature : 0,
    max_tokens: typeof payload?.max_output_tokens === "number" ? payload.max_output_tokens : undefined,
    stream: payload?.stream === true,
    tools: tools && tools.length > 0 ? tools : undefined,
    tool_choice: toolChoice,
    parallel_tool_calls: payload?.parallel_tool_calls === false ? false : undefined,
  };
}

export function chatCompletionsToResponsesText(raw: string): string {
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : null;
  const message = choice?.message ?? {};
  const text = typeof message?.content === "string"
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((x: any) => typeof x?.text === "string" ? x.text : typeof x === "string" ? x : "").filter(Boolean).join("\n")
      : "";
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const inputTokens = Number(parsed?.usage?.input_tokens ?? parsed?.usage?.prompt_tokens ?? 0);
  const outputTokens = Number(parsed?.usage?.output_tokens ?? parsed?.usage?.completion_tokens ?? 0);
  const totalTokens = Number(parsed?.usage?.total_tokens ?? (inputTokens + outputTokens));
  const response = {
    id: parsed?.id ?? `resp_${Date.now()}`,
    object: "response",
    created_at: typeof parsed?.created === "number" ? parsed.created : Math.floor(Date.now() / 1000),
    status: toolCalls.length > 0 ? "incomplete" : "completed",
    model: parsed?.model ?? "",
    output: [
      ...(
        text
          ? [
              {
                id: "msg_0",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text }],
              },
            ]
          : []
      ),
      ...toolCalls
        .filter((call: any) => String(call?.type ?? "").toLowerCase() === "function")
        .map((call: any, index: number) => ({
          type: "function_call",
          id: String(call?.id ?? `fc_${index}`),
          call_id: String(call?.id ?? `call_${index}`),
          name: String(call?.function?.name ?? ""),
          arguments: String(call?.function?.arguments ?? ""),
        })),
    ],
    usage: {
      input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
      total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    },
    output_text: text,
  };
  return JSON.stringify(response);
}

type ChatCompletionsSseState = {
  responseId: string;
  model: string;
  accumulatedText: string;
  usage: any;
  completed: boolean;
  started: boolean;
  textItemAdded: boolean;
  textItemDone: boolean;
  toolCallsByIndex: Map<number, {
    id: string;
    callId: string;
    name: string;
    arguments: string;
    added: boolean;
    done: boolean;
  }>;
};

function extractChatCompletionDeltaText(choice: any): string {
  const content = choice?.delta?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => {
      if (typeof item?.text === "string") return item.text;
      if (typeof item === "string") return item;
      return "";
    })
    .filter(Boolean)
    .join("");
}

function buildResponsesCompletedPayload(state: ChatCompletionsSseState): any {
  const usage = state.usage != null
    ? {
        input_tokens: Number(state.usage?.input_tokens ?? state.usage?.prompt_tokens ?? 0),
        output_tokens: Number(state.usage?.output_tokens ?? state.usage?.completion_tokens ?? 0),
        total_tokens: Number(
          state.usage?.total_tokens
            ?? (
              Number(state.usage?.input_tokens ?? state.usage?.prompt_tokens ?? 0)
              + Number(state.usage?.output_tokens ?? state.usage?.completion_tokens ?? 0)
            ),
        ),
      }
    : {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      };
  return {
    id: state.responseId || `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: state.toolCallsByIndex.size > 0 ? "incomplete" : "completed",
    model: state.model,
    output: [
      ...(
        state.textItemAdded || state.textItemDone
          ? [{
              id: "msg_0",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: state.accumulatedText }],
            }]
          : []
      ),
      ...[...state.toolCallsByIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, tool]) => ({
          type: "function_call",
          id: tool.id,
          call_id: tool.callId,
          name: tool.name,
          arguments: tool.arguments,
          status: "completed",
        })),
    ],
    usage,
    output_text: state.accumulatedText,
  };
}

function formatSseEvent(event: any): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function ensureResponsesSseStarted(state: ChatCompletionsSseState, out: string[]): void {
  if (state.started) return;
  state.started = true;
  const response = {
    id: state.responseId || `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "in_progress",
    model: state.model,
    output: [],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };
  out.push(formatSseEvent({
    type: "response.created",
    response,
  }));
  out.push(formatSseEvent({
    type: "response.in_progress",
    response,
  }));
  out.push(formatSseEvent({
    type: "response.output_item.added",
    output_index: 0,
    item: {
      id: "msg_0",
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [{ type: "output_text", text: "" }],
    },
  }));
  out.push(formatSseEvent({
    type: "response.content_part.added",
    output_index: 0,
    content_index: 0,
    item_id: "msg_0",
    part: { type: "output_text", text: "" },
  }));
  state.textItemAdded = true;
}

function finalizeChatCompletionsResponsesSse(state: ChatCompletionsSseState): string {
  if (state.completed) return "";
  state.completed = true;
  const out: string[] = [];
  if (!state.started && (state.accumulatedText || state.toolCallsByIndex.size > 0)) {
    ensureResponsesSseStarted(state, out);
  }
  if (state.textItemAdded && !state.textItemDone) {
    out.push(formatSseEvent({
      type: "response.output_text.done",
      item_id: "msg_0",
      output_index: 0,
      content_index: 0,
      text: state.accumulatedText,
    }));
    out.push(formatSseEvent({
      type: "response.content_part.done",
      item_id: "msg_0",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: state.accumulatedText },
    }));
    out.push(formatSseEvent({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        id: "msg_0",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: state.accumulatedText }],
      },
    }));
    state.textItemDone = true;
  }
  for (const [index, tool] of [...state.toolCallsByIndex.entries()].sort((a, b) => a[0] - b[0])) {
    if (tool.done) continue;
    out.push(formatSseEvent({
      type: "response.output_item.done",
      output_index: index,
      item: {
        type: "function_call",
        id: tool.id,
        call_id: tool.callId,
        name: tool.name,
        arguments: tool.arguments,
        status: "completed",
      },
    }));
    tool.done = true;
  }
  out.push(formatSseEvent({
    type: "response.completed",
    response: buildResponsesCompletedPayload(state),
  }));
  out.push("data: [DONE]\n\n");
  return out.join("");
}

function ensureToolCallState(
  state: ChatCompletionsSseState,
  index: number,
  delta: any,
): {
  id: string;
  callId: string;
  name: string;
  arguments: string;
  added: boolean;
  done: boolean;
} {
  const existing = state.toolCallsByIndex.get(index);
  if (existing) {
    if (typeof delta?.id === "string" && delta.id.length > 0) {
      existing.id = delta.id;
      if (!existing.callId) existing.callId = delta.id;
    }
    if (typeof delta?.function?.name === "string" && delta.function.name.length > 0) {
      existing.name = delta.function.name;
    }
    if (typeof delta?.function?.arguments === "string" && delta.function.arguments.length > 0) {
      existing.arguments += delta.function.arguments;
    }
    return existing;
  }
  const created = {
    id: String(delta?.id ?? `fc_${index}`),
    callId: String(delta?.id ?? `call_${index}`),
    name: String(delta?.function?.name ?? ""),
    arguments: typeof delta?.function?.arguments === "string" ? delta.function.arguments : "",
    added: false,
    done: false,
  };
  state.toolCallsByIndex.set(index, created);
  return created;
}

function processChatCompletionsSseBlock(block: string, state: ChatCompletionsSseState): string {
  const lines = block.split(/\r?\n/u);
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return "";
  const payloadText = dataLines.map((line) => line.slice(5).trim()).join("\n").trim();
  if (!payloadText) return "";
  if (payloadText === "[DONE]") {
    return finalizeChatCompletionsResponsesSse(state);
  }
  let parsed: any = null;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    return "";
  }

  const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : null;
  const deltaText = extractChatCompletionDeltaText(choice);
  state.responseId = String(parsed?.id ?? (state.responseId || `resp_${Date.now()}`));
  state.model = String(parsed?.model ?? state.model ?? "");
  if (parsed?.usage != null) state.usage = parsed.usage;

  const out: string[] = [];
  ensureResponsesSseStarted(state, out);
  const toolCallDeltas = Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls : [];
  if (deltaText) {
    state.accumulatedText += deltaText;
    out.push(formatSseEvent({
      type: "response.output_text.delta",
      output_index: 0,
      content_index: 0,
      delta: deltaText,
      item_id: "msg_0",
    }));
  }
  for (const tcDelta of toolCallDeltas) {
    const index = Number.isInteger(tcDelta?.index) ? tcDelta.index : 0;
    const toolState = ensureToolCallState(state, index + 1, tcDelta);
    if (!toolState.added) {
      out.push(formatSseEvent({
        type: "response.output_item.added",
        output_index: index + 1,
        item: {
          type: "function_call",
          id: toolState.id,
          call_id: toolState.callId,
          name: toolState.name,
          arguments: "",
          status: "in_progress",
        },
      }));
      toolState.added = true;
    }
    if (typeof tcDelta?.function?.arguments === "string" && tcDelta.function.arguments.length > 0) {
      out.push(formatSseEvent({
        type: "response.function_call_arguments.delta",
        item_id: toolState.id,
        output_index: index + 1,
        delta: tcDelta.function.arguments,
      }));
    }
  }

  const finishReason = choice?.finish_reason;
  if (finishReason && !state.completed) {
    out.push(finalizeChatCompletionsResponsesSse(state));
  }
  return out.join("");
}

function findSseBoundary(buffer: string): { index: number; separatorLength: number } | null {
  const rn = buffer.indexOf("\r\n\r\n");
  const nn = buffer.indexOf("\n\n");
  if (rn < 0 && nn < 0) return null;
  if (rn >= 0 && (nn < 0 || rn <= nn)) {
    return { index: rn, separatorLength: 4 };
  }
  return { index: nn, separatorLength: 2 };
}

function createChatCompletionsToResponsesSseTransform(): Transform {
  let buffer = "";
  const state: ChatCompletionsSseState = {
    responseId: "",
    model: "",
    accumulatedText: "",
    usage: null,
    completed: false,
    started: false,
    textItemAdded: false,
    textItemDone: false,
    toolCallsByIndex: new Map(),
  };
  return new Transform({
    transform(chunk, _encoding, callback) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      let boundary = findSseBoundary(buffer);
      while (boundary) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.separatorLength);
        const converted = processChatCompletionsSseBlock(block, state);
        if (converted) this.push(converted);
        boundary = findSseBoundary(buffer);
      }
      callback();
    },
    flush(callback) {
      const converted = buffer.trim() ? processChatCompletionsSseBlock(buffer, state) : "";
      if (converted) this.push(converted);
      const final = finalizeChatCompletionsResponsesSse(state);
      if (final) this.push(final);
      callback();
    },
  });
}

export function convertChatCompletionsSseToResponsesSse(rawSse: string): string {
  const blocks = String(rawSse ?? "").split(/\r?\n\r?\n/u);
  const state: ChatCompletionsSseState = {
    responseId: "",
    model: "",
    accumulatedText: "",
    usage: null,
    completed: false,
    started: false,
    textItemAdded: false,
    textItemDone: false,
    toolCallsByIndex: new Map(),
  };
  const out: string[] = [];
  for (const block of blocks) {
    const converted = processChatCompletionsSseBlock(block, state);
    if (converted) out.push(converted);
  }
  const final = finalizeChatCompletionsResponsesSse(state);
  if (final) out.push(final);
  return out.join("");
}

function convertChatCompletionsSseToResponsesText(rawSse: string): string {
  const blocks = String(rawSse ?? "").split(/\r?\n\r?\n/u);
  const state: ChatCompletionsSseState = {
    responseId: "",
    model: "",
    accumulatedText: "",
    usage: null,
    completed: false,
    started: false,
    textItemAdded: false,
    textItemDone: false,
    toolCallsByIndex: new Map(),
  };
  for (const block of blocks) {
    processChatCompletionsSseBlock(block, state);
  }
  return JSON.stringify(buildResponsesCompletedPayload(state));
}

function buildUpstreamRequestPayload(upstream: UpstreamConfig, payload: any): any {
  return isCompletionsApiFamily(upstream.apiFamily)
    ? responsesPayloadToChatCompletions(payload)
    : payload;
}

function buildNonStreamingUpstreamRequestPayload(upstream: UpstreamConfig, payload: any): any {
  const requestPayload = buildUpstreamRequestPayload(upstream, payload);
  if (!requestPayload || typeof requestPayload !== "object") return requestPayload;
  return {
    ...requestPayload,
    stream: false,
  };
}

function buildUpstreamCurlEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "SHELL"]) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }
  const { httpProxy, httpsProxy, allProxy, noProxy } = resolveUpstreamProxySettings();
  if (httpProxy) {
    env.http_proxy = httpProxy;
    env.HTTP_PROXY = httpProxy;
  }
  if (httpsProxy) {
    env.https_proxy = httpsProxy;
    env.HTTPS_PROXY = httpsProxy;
  }
  if (allProxy) {
    env.all_proxy = allProxy;
    env.ALL_PROXY = allProxy;
  }
  if (noProxy) {
    env.no_proxy = noProxy;
    env.NO_PROXY = noProxy;
  }
  return env;
}

async function appendUpstreamTransportTrace(
  stateDir: string,
  record: Record<string, unknown>,
): Promise<void> {
  try {
    const tracePath = pluginStateSubdir(stateDir, "upstream-transport-trace.jsonl");
    await mkdir(dirname(tracePath), { recursive: true });
    await appendFile(tracePath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, "utf8");
  } catch {
    // best-effort trace only
  }
}

async function requestUpstreamWithCurl(
  upstream: UpstreamConfig,
  payload: any,
  stateDir: string,
  logger?: { warn: (message: string) => void },
): Promise<UpstreamHttpResponse> {
  const realTempDir = await mkdtemp(join(tmpdir(), "ecoclaw-curl-"));
  const bodyPath = join(realTempDir, "request.json");
  const headersPath = join(realTempDir, "headers.txt");
  const curlEnv = buildUpstreamCurlEnv();
  const proxySettings = resolveUpstreamProxySettings();
  try {
    await writeFile(bodyPath, JSON.stringify(buildNonStreamingUpstreamRequestPayload(upstream, payload)), "utf8");
    await appendUpstreamTransportTrace(stateDir, {
      stage: "curl_start",
      upstreamBaseUrl: upstream.baseUrl,
      httpProxy: curlEnv.http_proxy ?? curlEnv.HTTP_PROXY ?? "",
      httpsProxy: curlEnv.https_proxy ?? curlEnv.HTTPS_PROXY ?? "",
      noProxy: curlEnv.no_proxy ?? curlEnv.NO_PROXY ?? "",
    });
    const { stdout } = await runExecFile(
      "curl",
      (() => {
        const requestPayload = buildNonStreamingUpstreamRequestPayload(upstream, payload);
        writeFile(bodyPath, JSON.stringify(requestPayload), "utf8");
        const args = [
          "-sS",
          "-X",
          "POST",
          upstreamEndpoint(upstream),
          "-H",
          "content-type: application/json",
          "-H",
          `authorization: Bearer ${upstream.apiKey}`,
          "--data-binary",
          `@${bodyPath}`,
          "--dump-header",
          headersPath,
          "--output",
          "-",
          "--write-out",
          "\n__UPSTREAM_CURL_STATUS__:%{http_code}",
        ];
        const targetUrl = new URL(upstreamEndpoint(upstream));
        const chosenProxy = targetUrl.protocol === "https:"
          ? (proxySettings.httpsProxy || proxySettings.allProxy || proxySettings.httpProxy)
          : (proxySettings.httpProxy || proxySettings.allProxy || proxySettings.httpsProxy);
        if (chosenProxy) args.push("--proxy", chosenProxy);
        if (proxySettings.noProxy) args.push("--noproxy", proxySettings.noProxy);
        return args;
      })(),
      { env: curlEnv, timeoutMs: 180000 },
    );
    const marker = "\n__UPSTREAM_CURL_STATUS__:";
    const idx = stdout.lastIndexOf(marker);
    if (idx < 0) throw new Error("curl missing status marker");
    const rawText = stdout.slice(0, idx);
    const rawHeaders = await readFile(headersPath, "utf8");
    const parsedHeaders = parseCurlHeaders(rawHeaders);
    const rawContentType = parsedHeaders["content-type"];
    const text = isCompletionsApiFamily(upstream.apiFamily)
      ? isSseContentType(rawContentType)
        ? convertChatCompletionsSseToResponsesText(rawText)
        : chatCompletionsToResponsesText(rawText)
      : rawText;
    const status = Number.parseInt(stdout.slice(idx + marker.length).trim(), 10);
    await appendUpstreamTransportTrace(stateDir, {
      stage: "curl_ok",
      upstreamBaseUrl: upstream.baseUrl,
      status: Number.isFinite(status) ? status : 502,
    });
    return {
      status: Number.isFinite(status) ? status : 502,
      headers: isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(rawContentType)
        ? { ...parsedHeaders, "content-type": "application/json; charset=utf-8" }
        : parsedHeaders,
      text,
      transport: "curl",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await appendUpstreamTransportTrace(stateDir, {
      stage: "curl_error",
      upstreamBaseUrl: upstream.baseUrl,
      error: detail,
      httpProxy: curlEnv.http_proxy ?? curlEnv.HTTP_PROXY ?? "",
      httpsProxy: curlEnv.https_proxy ?? curlEnv.HTTPS_PROXY ?? "",
      noProxy: curlEnv.no_proxy ?? curlEnv.NO_PROXY ?? "",
    });
    throw err;
  } finally {
    await rm(realTempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function requestUpstreamResponses(
  upstream: UpstreamConfig,
  payload: any,
  logger: { warn: (message: string) => void; error: (message: string) => void },
  stateDir: string,
): Promise<UpstreamHttpResponse> {
  if (hasExplicitUpstreamProxyEnv()) {
    await appendUpstreamTransportTrace(stateDir, {
      stage: "transport_policy",
      upstreamBaseUrl: upstream.baseUrl,
      policy: "prefer_curl_due_to_proxy_env",
    });
    return requestUpstreamWithCurl(upstream, payload, stateDir, logger);
  }
  try {
    const endpoint = upstreamEndpoint(upstream);
    const requestPayload = buildNonStreamingUpstreamRequestPayload(upstream, payload);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstream.apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });
    const headers = Object.fromEntries(resp.headers.entries());
    const rawText = await resp.text();
    const rawContentType = headers["content-type"];
    const text = isCompletionsApiFamily(upstream.apiFamily)
      ? isSseContentType(rawContentType)
        ? convertChatCompletionsSseToResponsesText(rawText)
        : chatCompletionsToResponsesText(rawText)
      : rawText;
    return {
      status: resp.status,
      headers: isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(rawContentType)
        ? { ...headers, "content-type": "application/json; charset=utf-8" }
        : headers,
      text,
      transport: "fetch",
    };
  } catch (err) {
    const fetchDetail = err instanceof Error ? err.message : String(err);
    await appendUpstreamTransportTrace(stateDir, {
      stage: "fetch_error",
      upstreamBaseUrl: upstream.baseUrl,
      error: fetchDetail,
    });
    logger.warn(`[plugin-runtime] upstream fetch failed, fallback to curl: ${fetchDetail}`);
    try {
      return await requestUpstreamWithCurl(upstream, payload, stateDir, logger);
    } catch (curlErr) {
      const curlDetail = curlErr instanceof Error ? curlErr.message : String(curlErr);
      await appendUpstreamTransportTrace(stateDir, {
        stage: "fetch_then_curl_error",
        upstreamBaseUrl: upstream.baseUrl,
        fetchError: fetchDetail,
        curlError: curlDetail,
      });
      logger.error(`[plugin-runtime] upstream curl fallback failed: ${curlDetail}`);
      throw new Error(`upstream fetch failed (${fetchDetail}); curl fallback failed (${curlDetail})`);
    }
  }
}

export async function requestUpstreamResponsesStream(
  upstream: UpstreamConfig,
  payload: any,
  logger: { warn: (message: string) => void; error: (message: string) => void },
  stateDir: string,
): Promise<UpstreamStreamResponse> {
  const endpoint = upstreamEndpoint(upstream);
  const requestPayload = buildUpstreamRequestPayload(upstream, payload);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstream.apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });
    const headers = Object.fromEntries(resp.headers.entries());
    if (!resp.body) {
      return {
        status: resp.status,
        headers,
        stream: Readable.from([""]),
        transport: "fetch",
      };
    }
    const rawStream = Readable.fromWeb(resp.body as any);
    const stream = isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(headers["content-type"])
      ? rawStream.pipe(createChatCompletionsToResponsesSseTransform())
      : rawStream;
    const normalizedHeaders =
      isCompletionsApiFamily(upstream.apiFamily) && isSseContentType(headers["content-type"])
        ? { ...headers, "content-type": "text/event-stream; charset=utf-8" }
        : headers;
    return {
      status: resp.status,
      headers: normalizedHeaders,
      stream,
      transport: "fetch",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await appendUpstreamTransportTrace(stateDir, {
      stage: "fetch_stream_error",
      upstreamBaseUrl: upstream.baseUrl,
      error: detail,
    });
    logger.error(`[plugin-runtime] upstream stream fetch failed: ${detail}`);
    throw new Error(`upstream stream fetch failed (${detail})`);
  }
}

export async function detectUpstreamConfig(
  logger: { warn: (message: string) => void },
  options?: DetectUpstreamOptions,
): Promise<UpstreamConfig | null> {
  const cfgPath = join(homedir(), ".openclaw", "openclaw.json");
  try {
    const raw = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(raw) as any;
    const providers = parsed?.models?.providers ?? {};
    const preferred = ["tuzi", "dica", "openai", "qwen-portal", "bailian", "gmn"];
    const preferredProviderId = String(options?.preferredProviderId ?? "").trim();
    const preferredBaseUrl = String(options?.preferredBaseUrl ?? "").trim().replace(/\/+$/, "");
    const preferredApiKey = String(options?.preferredApiKey ?? "").trim();
    const matchedProviderByBaseUrl = Object.keys(providers).find((id) => {
      const provider = providers?.[id];
      if (!provider?.baseUrl || !provider?.apiKey) return false;
      const normalizedBaseUrl = String(provider.baseUrl).trim().replace(/\/+$/, "");
      if (!normalizedBaseUrl || normalizedBaseUrl !== preferredBaseUrl) return false;
      if (!preferredApiKey) return true;
      return String(provider.apiKey).trim() === preferredApiKey;
    });
    const selectedProvider = (
      preferredProviderId
      && providers?.[preferredProviderId]?.baseUrl
      && providers?.[preferredProviderId]?.apiKey
    )
      ? preferredProviderId
      : matchedProviderByBaseUrl
      ? matchedProviderByBaseUrl
      : preferred.find((id) => providers?.[id]?.baseUrl && providers?.[id]?.apiKey)
      ?? Object.keys(providers).find((id) => id !== "tokenpilot" && id !== "ecoclaw" && providers[id]?.baseUrl && providers[id]?.apiKey)
      ?? Object.keys(providers)[0];
    if (!selectedProvider) return null;
    const p = providers[selectedProvider];
    const models = Array.isArray(p?.models) ? p.models : [];
    const normalized: UpstreamModelDef[] = models
      .filter((m: any) => typeof m?.id === "string" && m.id.trim())
      .map((m: any) => ({
        id: String(m.id),
        name: String(m.name ?? m.id),
        reasoning: Boolean(m.reasoning ?? false),
        input: Array.isArray(m.input) ? m.input.filter((x: any) => x === "text" || x === "image") : ["text"],
        contextWindow: Number(m.contextWindow ?? 128000),
        maxTokens: Number(m.maxTokens ?? 8192),
      }));
    if (!p?.baseUrl || !p?.apiKey) return null;
    return {
      providerId: selectedProvider,
      baseUrl: String(p.baseUrl).replace(/\/+$/, ""),
      apiKey: String(p.apiKey),
      apiFamily: typeof p.api === "string" ? String(p.api) : "openai-responses",
      models: normalized.length > 0 ? normalized : [{
        id: "gpt-5.4",
        name: "gpt-5.4",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 128000,
        maxTokens: 8192,
      }],
    };
  } catch (err) {
    logger.warn(`[plugin-runtime] detect upstream config failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function ensureExplicitProxyModelsInConfig(
  proxyBaseUrl: string,
  upstream: UpstreamConfig,
  logger: { warn: (message: string) => void; info: (message: string) => void },
): Promise<void> {
  const cfgPath = join(homedir(), ".openclaw", "openclaw.json");
  try {
    const raw = await readFile(cfgPath, "utf8");
    const doc = JSON.parse(raw) as any;
    doc.models = doc.models ?? {};
    doc.models.providers = doc.models.providers ?? {};
    doc.agents = doc.agents ?? {};
    doc.agents.defaults = doc.agents.defaults ?? {};
    doc.agents.defaults.models = doc.agents.defaults.models ?? {};

    const existingProvider = doc.models.providers.tokenpilot ?? {};
    const desiredModels = upstream.models.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.input,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
    }));
    doc.models.providers.tokenpilot = {
      ...existingProvider,
      baseUrl: proxyBaseUrl,
      apiKey: "tokenpilot-local",
      api: "openai-responses",
      authHeader: false,
      models: desiredModels,
    };

    for (const model of upstream.models) {
      const key = `tokenpilot/${model.id}`;
      if (!doc.agents.defaults.models[key]) doc.agents.defaults.models[key] = {};
    }

    const nextRaw = JSON.stringify(doc, null, 2);
    if (nextRaw !== raw) {
      await writeFile(cfgPath, nextRaw, "utf8");
      logger.info(`[plugin-runtime] synced explicit model keys into openclaw.json (${upstream.models.length} models).`);
    }
  } catch (err) {
    logger.warn(`[plugin-runtime] sync explicit proxy models failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function normalizeProxyModelId(model: string): string {
  const value = model.trim();
  if (!value) return value;
  const stripped = value.startsWith("tokenpilot/")
    ? value.slice("tokenpilot/".length)
    : value.startsWith("ecoclaw/")
      ? value.slice("ecoclaw/".length)
      : value;
  return stripped.replace("gpt-5-4-mini", "gpt-5.4-mini");
}
