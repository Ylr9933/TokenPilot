import { readLatestUxEffect, readSessionUxAggregate } from "../context-stack/integration/ux-effects.js";
import { extractScopedSessionKey } from "../session/scoped-session-key.js";
import { resolveSessionIdFromCommandScope } from "../session/command-scope-map.js";
import { loadRecentTurnBindingsFromState } from "../session/turn-bindings.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const TOKENPILOT_CONFIG_ROOT = ["plugins", "entries", "tokenpilot", "config"] as const;
const TOKENPILOT_ENTRY_ROOT = ["plugins", "entries", "tokenpilot"] as const;

const REDUCTION_PASS_PATHS: Record<string, string[]> = {
  repeatedReadDedup: ["reduction", "passes", "repeatedReadDedup"],
  toolPayloadTrim: ["reduction", "passes", "toolPayloadTrim"],
  htmlSlimming: ["reduction", "passes", "htmlSlimming"],
  execOutputTruncation: ["reduction", "passes", "execOutputTruncation"],
  agentsStartupOptimization: ["reduction", "passes", "agentsStartupOptimization"],
  memoryFaultRecovery: ["reduction", "passes", "memoryFaultRecovery"],
  formatSlimming: ["reduction", "passOptions", "formatSlimming", "enabled"],
  formatCleaning: ["reduction", "passOptions", "formatCleaning", "enabled"],
  pathTruncation: ["reduction", "passOptions", "pathTruncation", "enabled"],
  imageDownsample: ["reduction", "passOptions", "imageDownsample", "enabled"],
  lineNumberStrip: ["reduction", "passOptions", "lineNumberStrip", "enabled"],
};

const REDUCTION_PRESETS: Record<
  string,
  {
    triggerMinChars: number;
    maxToolChars: number;
    passToggles: Record<string, boolean>;
  }
> = {
  light: {
    triggerMinChars: 4000,
    maxToolChars: 1800,
    passToggles: {
      repeatedReadDedup: true,
      toolPayloadTrim: true,
      htmlSlimming: false,
      execOutputTruncation: false,
      agentsStartupOptimization: true,
      memoryFaultRecovery: false,
      formatSlimming: false,
      formatCleaning: false,
      pathTruncation: false,
      imageDownsample: false,
      lineNumberStrip: false,
    },
  },
  balanced: {
    triggerMinChars: 2200,
    maxToolChars: 1200,
    passToggles: {
      repeatedReadDedup: true,
      toolPayloadTrim: true,
      htmlSlimming: true,
      execOutputTruncation: true,
      agentsStartupOptimization: true,
      memoryFaultRecovery: false,
      formatSlimming: true,
      formatCleaning: true,
      pathTruncation: true,
      imageDownsample: true,
      lineNumberStrip: true,
    },
  },
  aggressive: {
    triggerMinChars: 1400,
    maxToolChars: 900,
    passToggles: {
      repeatedReadDedup: true,
      toolPayloadTrim: true,
      htmlSlimming: true,
      execOutputTruncation: true,
      agentsStartupOptimization: true,
      memoryFaultRecovery: false,
      formatSlimming: true,
      formatCleaning: true,
      pathTruncation: true,
      imageDownsample: true,
      lineNumberStrip: true,
    },
  },
};

function parseCommandAction(raw: string): { action: string; rest: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { action: "", rest: "" };
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { action: trimmed.toLowerCase(), rest: "" };
  return {
    action: trimmed.slice(0, firstSpace).trim().toLowerCase(),
    rest: trimmed.slice(firstSpace + 1).trim(),
  };
}

function splitArgs(raw: string): string[] {
  return raw.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

function getNestedValue(target: unknown, path: readonly string[]): unknown {
  let current: unknown = target;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setNestedValue(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  if (path.length === 0) throw new Error("Path cannot be empty.");
  let current: Record<string, unknown> = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseBooleanWord(raw: string): boolean | undefined {
  switch (raw.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
    case "enable":
    case "enabled":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
    case "disable":
    case "disabled":
      return false;
    default:
      return undefined;
  }
}

function parseNumberWord(raw: string): number | undefined {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringValue(raw: string): string {
  return raw.trim();
}

function formatDisplayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "(unset)";
  return JSON.stringify(value, null, 2);
}

function formatInt(value: number | undefined): string {
  if (!Number.isFinite(value ?? Number.NaN)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value ?? 0)));
}

function countModeLabel(mode: unknown): "tokens" | "chars" {
  return mode === "chars" ? "chars" : "tokens";
}

function formatOnOff(value: unknown): string {
  return value === true ? "on" : "off";
}

function ensurePluginConfig(config: Record<string, unknown>): Record<string, unknown> {
  let current: Record<string, unknown> = config;
  for (const segment of TOKENPILOT_CONFIG_ROOT) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  return current;
}

function ensurePluginEntry(config: Record<string, unknown>): Record<string, unknown> {
  let current: Record<string, unknown> = config;
  for (const segment of TOKENPILOT_ENTRY_ROOT) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  return current;
}

function pluginConfigRecord(config: Record<string, unknown>): Record<string, unknown> | undefined {
  return toRecord(getNestedValue(config, TOKENPILOT_CONFIG_ROOT));
}

function pluginEntryRecord(config: Record<string, unknown>): Record<string, unknown> | undefined {
  return toRecord(getNestedValue(config, TOKENPILOT_ENTRY_ROOT));
}

function resolveStateDir(config: Record<string, unknown>): string | undefined {
  const pluginCfg = pluginConfigRecord(config);
  const stateDir = getNestedValue(pluginCfg, ["stateDir"]);
  return typeof stateDir === "string" && stateDir.trim().length > 0 ? stateDir.trim() : undefined;
}

function normalizeSessionRef(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeUuidSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function looksLikeOpenClawSessionKey(value: string): boolean {
  return value.startsWith("agent:");
}

function readSessionIdFromRegistryEntry(entry: Record<string, unknown> | undefined): string | undefined {
  const direct = normalizeSessionRef(entry?.sessionId);
  if (looksLikeUuidSessionId(direct)) return direct;

  const sessionFile = normalizeSessionRef(entry?.sessionFile);
  if (sessionFile) {
    const fileBase = basename(sessionFile).replace(/\.jsonl$/i, "").trim();
    if (looksLikeUuidSessionId(fileBase)) return fileBase;
  }

  const systemPromptReport = toRecord(entry?.systemPromptReport);
  const nested = normalizeSessionRef(systemPromptReport?.sessionId);
  if (looksLikeUuidSessionId(nested)) return nested;
  return undefined;
}

function resolveOpenClawSessionIdFromSessionKey(sessionKey: string): string | undefined {
  const normalized = normalizeSessionRef(sessionKey);
  if (!looksLikeOpenClawSessionKey(normalized)) return undefined;
  const segments = normalized.split(":");
  const agentId = segments[1]?.trim();
  if (!agentId) return undefined;
  const registryPath = join(homedir(), ".openclaw", "agents", agentId, "sessions", "sessions.json");
  try {
    const parsed = JSON.parse(readFileSync(registryPath, "utf8"));
    const registry = toRecord(parsed);
    if (!registry) return undefined;
    const directEntry = toRecord(registry[normalized]);
    const directSessionId = readSessionIdFromRegistryEntry(directEntry);
    if (directSessionId) return directSessionId;
    for (const value of Object.values(registry)) {
      const entry = toRecord(value);
      const systemPromptReport = toRecord(entry?.systemPromptReport);
      if (normalizeSessionRef(systemPromptReport?.sessionKey) !== normalized) continue;
      const sessionId = readSessionIdFromRegistryEntry(entry);
      if (sessionId) return sessionId;
    }
  } catch {
    // best effort
  }
  return undefined;
}

function resolveDirectSessionId(ctx: any): string | undefined {
  const directCandidates = [
    ctx?.sessionId,
    ctx?.session_id,
    ctx?.ctx?.SessionId,
    ctx?.ctx?.sessionId,
    ctx?.params?.sessionId,
    ctx?.params?.session_id,
    ctx?.params?.SessionId,
  ];
  for (const candidate of directCandidates) {
    const value = normalizeSessionRef(candidate);
    if (!value) continue;
    if (looksLikeOpenClawSessionKey(value)) {
      const mapped = resolveOpenClawSessionIdFromSessionKey(value);
      if (mapped) return mapped;
      continue;
    }
    if (looksLikeUuidSessionId(value)) return value;
  }

  const sessionKeyCandidates = [
    ctx?.sessionKey,
    ctx?.session_key,
    ctx?.SessionKey,
    ctx?.ctx?.SessionKey,
    ctx?.ctx?.CommandTargetSessionKey,
    ctx?.params?.sessionKey,
    ctx?.params?.session_key,
    ctx?.params?.SessionKey,
  ];
  for (const candidate of sessionKeyCandidates) {
    const value = normalizeSessionRef(candidate);
    if (!value) continue;
    const mapped = resolveOpenClawSessionIdFromSessionKey(value);
    if (mapped) return mapped;
  }
  return undefined;
}

function resolveScopedSessionId(stateDir: string, ctx: any): string | undefined {
  const mappedSessionId = resolveSessionIdFromCommandScope(stateDir, ctx, ctx?.commandBody);
  if (mappedSessionId) return mappedSessionId;

  const scopedSessionKey = extractScopedSessionKey(ctx);
  const bindings = loadRecentTurnBindingsFromState(stateDir, (text) => text);

  if (scopedSessionKey) {
    for (let index = bindings.length - 1; index >= 0; index -= 1) {
      const binding = bindings[index];
      if (binding.sessionKey !== scopedSessionKey) continue;
      const upstreamSessionId = String(binding.upstreamSessionId ?? "").trim();
      if (upstreamSessionId) return upstreamSessionId;
    }
  }

  const recentCutoff = Date.now() - 30 * 60 * 1000;
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index];
    if (binding.at < recentCutoff) continue;
    const upstreamSessionId = String(binding.upstreamSessionId ?? "").trim();
    if (upstreamSessionId) return upstreamSessionId;
  }
  return undefined;
}

function applyReductionPreset(config: Record<string, unknown>, presetName: string): void {
  const preset = REDUCTION_PRESETS[presetName];
  if (!preset) return;
  const pluginCfg = ensurePluginConfig(config);
  setNestedValue(pluginCfg, ["modules", "reduction"], true);
  setNestedValue(pluginCfg, ["reduction", "engine"], "layered");
  setNestedValue(pluginCfg, ["reduction", "triggerMinChars"], preset.triggerMinChars);
  setNestedValue(pluginCfg, ["reduction", "maxToolChars"], preset.maxToolChars);
  for (const [passName, enabled] of Object.entries(preset.passToggles)) {
    const passPath = REDUCTION_PASS_PATHS[passName];
    if (passPath) setNestedValue(pluginCfg, passPath, enabled);
  }
}

function formatTokenPilotHelp(section?: string): string {
  if (section === "stabilizer") {
    return [
      "Prefix Stabilization commands:",
      "/tokenpilot stabilizer",
      "/tokenpilot stabilizer on",
      "/tokenpilot stabilizer off",
      "/tokenpilot stabilizer hook <on|off>",
      "/tokenpilot stabilizer target <developer|user>",
      "",
      "Knobs:",
      "- modules.stabilizer",
      "- hooks.beforeToolCall",
      "- hooks.dynamicContextTarget",
    ].join("\n");
  }

  if (section === "reduction") {
    return [
      "Observation Reduction commands:",
      "/tokenpilot reduction",
      "/tokenpilot reduction on",
      "/tokenpilot reduction off",
      "/tokenpilot reduction mode <light|balanced|aggressive>",
      "/tokenpilot reduction pass <name> <on|off>",
      "/tokenpilot reduction set <triggerMinChars|maxToolChars> <number>",
      "",
      "Pass names:",
      "- repeatedReadDedup",
      "- toolPayloadTrim",
      "- htmlSlimming",
      "- execOutputTruncation",
      "- agentsStartupOptimization",
      "- memoryFaultRecovery",
      "- formatSlimming",
      "- formatCleaning",
      "- pathTruncation",
      "- imageDownsample",
      "- lineNumberStrip",
    ].join("\n");
  }

  if (section === "eviction") {
    return [
      "Lifecycle-Aware Eviction commands:",
      "/tokenpilot eviction",
      "/tokenpilot eviction on",
      "/tokenpilot eviction off",
      "/tokenpilot eviction estimator <on|off>",
      "/tokenpilot eviction set <key> <value>",
      "",
      "Keys:",
      "- policy: noop|lru|lfu|gdsf|model_scored",
      "- minBlockChars",
      "- maxCandidateBlocks",
      "- replacementMode: pointer_stub|drop",
      "- batchTurns",
      "- evictionLookaheadTurns",
      "- completedSummaryMaxRawTurns",
      "- inputMode: sliding_window|completed_summary_plus_active_turns",
      "- lifecycleMode: coupled|decoupled",
      "- evidenceMode: three_state|two_state",
      "- evictionPromotionHotTailSize",
    ].join("\n");
  }

  return [
    "TokenPilot commands:",
    "",
    "/tokenpilot status",
    "/tokenpilot help [stabilizer|reduction|eviction]",
    "/tokenpilot report",
    "/tokenpilot settings details <on|off>",
    "/tokenpilot stabilizer ...",
    "/tokenpilot reduction ...",
    "/tokenpilot eviction ...",
    "",
    "Core modules:",
    "- Prefix Stabilization: prompt stability and dynamic context target",
    "- Observation Reduction: reduction presets, pass toggles, and thresholds",
    "- Lifecycle-Aware Eviction: eviction policy and task-state lifecycle knobs",
    "",
    "Examples:",
    "/tokenpilot report",
    "/tokenpilot settings details on",
    "/tokenpilot reduction mode balanced",
    "/tokenpilot reduction pass toolPayloadTrim off",
    "/tokenpilot eviction on",
    "/tokenpilot eviction set minBlockChars 512",
    "/tokenpilot stabilizer target developer",
  ].join("\n");
}

function summarizeTokenPilotStatus(cfg: Record<string, unknown>): string {
  const entry = pluginEntryRecord(cfg);
  const pluginCfg = pluginConfigRecord(cfg);
  const stabilizerEnabled = getNestedValue(pluginCfg, ["modules", "stabilizer"]);
  const reductionEnabled = getNestedValue(pluginCfg, ["modules", "reduction"]);
  const evictionEnabled = Boolean(getNestedValue(pluginCfg, ["modules", "eviction"])) && Boolean(getNestedValue(pluginCfg, ["eviction", "enabled"]));
  const estimatorEnabled = getNestedValue(pluginCfg, ["taskStateEstimator", "enabled"]);

  return [
    "TokenPilot status:",
    `- entry.enabled: ${formatOnOff(entry?.enabled)}`,
    `- config.enabled: ${formatOnOff(pluginCfg?.enabled)}`,
    `- stabilizer: ${formatOnOff(stabilizerEnabled)}`,
    `- reduction: ${formatOnOff(reductionEnabled)}`,
    `- lifecycle eviction: ${formatOnOff(evictionEnabled)}`,
    `- task-state estimator: ${formatOnOff(estimatorEnabled)}`,
    `- details: ${formatOnOff(getNestedValue(pluginCfg, ["ux", "details"]))}`,
    `- proxyAutostart: ${formatOnOff(pluginCfg?.proxyAutostart)}`,
    `- proxyPort: ${formatDisplayValue(pluginCfg?.proxyPort)}`,
  ].join("\n");
}

function summarizeStabilizerStatus(cfg: Record<string, unknown>): string {
  const pluginCfg = pluginConfigRecord(cfg);
  return [
    "Prefix Stabilization:",
    `- enabled: ${formatOnOff(getNestedValue(pluginCfg, ["modules", "stabilizer"]))}`,
    `- beforeToolCall: ${formatOnOff(getNestedValue(pluginCfg, ["hooks", "beforeToolCall"]))}`,
    `- dynamicContextTarget: ${formatDisplayValue(getNestedValue(pluginCfg, ["hooks", "dynamicContextTarget"]))}`,
  ].join("\n");
}

function summarizeReductionStatus(cfg: Record<string, unknown>): string {
  const pluginCfg = pluginConfigRecord(cfg);
  const passSummary = Object.keys(REDUCTION_PASS_PATHS)
    .map((passName) => `${passName}=${formatOnOff(getNestedValue(pluginCfg, REDUCTION_PASS_PATHS[passName]))}`)
    .join(", ");

  return [
    "Observation Reduction:",
    `- enabled: ${formatOnOff(getNestedValue(pluginCfg, ["modules", "reduction"]))}`,
    `- engine: ${formatDisplayValue(getNestedValue(pluginCfg, ["reduction", "engine"]))}`,
    `- triggerMinChars: ${formatDisplayValue(getNestedValue(pluginCfg, ["reduction", "triggerMinChars"]))}`,
    `- maxToolChars: ${formatDisplayValue(getNestedValue(pluginCfg, ["reduction", "maxToolChars"]))}`,
    `- passes: ${passSummary}`,
  ].join("\n");
}

function summarizeEvictionStatus(cfg: Record<string, unknown>): string {
  const pluginCfg = pluginConfigRecord(cfg);
  return [
    "Lifecycle-Aware Eviction:",
    `- moduleEnabled: ${formatOnOff(getNestedValue(pluginCfg, ["modules", "eviction"]))}`,
    `- evictionEnabled: ${formatOnOff(getNestedValue(pluginCfg, ["eviction", "enabled"]))}`,
    `- taskStateEstimator: ${formatOnOff(getNestedValue(pluginCfg, ["taskStateEstimator", "enabled"]))}`,
    `- policy: ${formatDisplayValue(getNestedValue(pluginCfg, ["eviction", "policy"]))}`,
    `- minBlockChars: ${formatDisplayValue(getNestedValue(pluginCfg, ["eviction", "minBlockChars"]))}`,
    `- maxCandidateBlocks: ${formatDisplayValue(getNestedValue(pluginCfg, ["eviction", "maxCandidateBlocks"]))}`,
    `- replacementMode: ${formatDisplayValue(getNestedValue(pluginCfg, ["eviction", "replacementMode"]))}`,
    `- batchTurns: ${formatDisplayValue(getNestedValue(pluginCfg, ["taskStateEstimator", "batchTurns"]))}`,
    `- evictionLookaheadTurns: ${formatDisplayValue(getNestedValue(pluginCfg, ["taskStateEstimator", "evictionLookaheadTurns"]))}`,
    `- lifecycleMode: ${formatDisplayValue(getNestedValue(pluginCfg, ["taskStateEstimator", "lifecycleMode"]))}`,
    `- evidenceMode: ${formatDisplayValue(getNestedValue(pluginCfg, ["taskStateEstimator", "evidenceMode"]))}`,
  ].join("\n");
}

async function writeUpdatedConfig(
  api: any,
  currentConfig: Record<string, unknown>,
  mutate: (nextConfig: Record<string, unknown>) => string,
): Promise<{ text: string }> {
  const nextConfig = structuredClone(currentConfig);
  const message = mutate(nextConfig);
  await api.runtime.config.writeConfigFile(nextConfig);
  return { text: message };
}

function handleHelp(rest: string): { text: string } {
  const section = splitArgs(rest)[0]?.toLowerCase();
  return { text: formatTokenPilotHelp(section) };
}

async function handleStabilizer(api: any, currentConfig: Record<string, unknown>, rest: string): Promise<{ text: string }> {
  const args = splitArgs(rest);
  const action = args[0]?.toLowerCase() ?? "status";

  if (action === "status" || action === "show") {
    return { text: summarizeStabilizerStatus(currentConfig) };
  }

  if (action === "help") {
    return { text: formatTokenPilotHelp("stabilizer") };
  }

  const toggleValue = parseBooleanWord(action);
  if (toggleValue !== undefined) {
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      const entry = ensurePluginEntry(nextConfig);
      entry.enabled = true;
      pluginCfg.enabled = true;
      setNestedValue(pluginCfg, ["modules", "stabilizer"], toggleValue);
      return `✅ Prefix Stabilization ${toggleValue ? "enabled" : "disabled"}`;
    });
  }

  if (action === "hook") {
    const value = parseBooleanWord(args[1] ?? "");
    if (value === undefined) {
      return { text: "Usage: /tokenpilot stabilizer hook <on|off>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["hooks", "beforeToolCall"], value);
      return `✅ hooks.beforeToolCall = ${value}`;
    });
  }

  if (action === "target") {
    const target = parseStringValue(args[1] ?? "").toLowerCase();
    if (target !== "developer" && target !== "user") {
      return { text: "Usage: /tokenpilot stabilizer target <developer|user>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["hooks", "dynamicContextTarget"], target);
      return `✅ hooks.dynamicContextTarget = ${target}`;
    });
  }

  return { text: formatTokenPilotHelp("stabilizer") };
}

async function handleReduction(api: any, currentConfig: Record<string, unknown>, rest: string): Promise<{ text: string }> {
  const args = splitArgs(rest);
  const action = args[0]?.toLowerCase() ?? "status";

  if (action === "status" || action === "show") {
    return { text: summarizeReductionStatus(currentConfig) };
  }

  if (action === "help") {
    return { text: formatTokenPilotHelp("reduction") };
  }

  const toggleValue = parseBooleanWord(action);
  if (toggleValue !== undefined) {
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["modules", "reduction"], toggleValue);
      return `✅ Observation Reduction ${toggleValue ? "enabled" : "disabled"}`;
    });
  }

  if (action === "mode") {
    const presetName = parseStringValue(args[1] ?? "").toLowerCase();
    if (!REDUCTION_PRESETS[presetName]) {
      return { text: "Usage: /tokenpilot reduction mode <light|balanced|aggressive>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      applyReductionPreset(nextConfig, presetName);
      return `✅ Observation Reduction preset = ${presetName}`;
    });
  }

  if (action === "pass") {
    const passName = args[1] ?? "";
    const passPath = REDUCTION_PASS_PATHS[passName];
    const value = parseBooleanWord(args[2] ?? "");
    if (!passPath || value === undefined) {
      return { text: "Usage: /tokenpilot reduction pass <name> <on|off>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, passPath, value);
      return `✅ reduction.${passName} = ${value}`;
    });
  }

  if (action === "set") {
    const key = args[1] ?? "";
    const value = parseNumberWord(args[2] ?? "");
    if ((key !== "triggerMinChars" && key !== "maxToolChars") || value === undefined) {
      return { text: "Usage: /tokenpilot reduction set <triggerMinChars|maxToolChars> <number>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["reduction", key], value);
      return `✅ reduction.${key} = ${value}`;
    });
  }

  return { text: formatTokenPilotHelp("reduction") };
}

async function handleEviction(api: any, currentConfig: Record<string, unknown>, rest: string): Promise<{ text: string }> {
  const args = splitArgs(rest);
  const action = args[0]?.toLowerCase() ?? "status";

  if (action === "status" || action === "show") {
    return { text: summarizeEvictionStatus(currentConfig) };
  }

  if (action === "help") {
    return { text: formatTokenPilotHelp("eviction") };
  }

  const toggleValue = parseBooleanWord(action);
  if (toggleValue !== undefined) {
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["modules", "eviction"], toggleValue);
      setNestedValue(pluginCfg, ["eviction", "enabled"], toggleValue);
      setNestedValue(pluginCfg, ["taskStateEstimator", "enabled"], toggleValue);
      return `✅ Lifecycle-Aware Eviction ${toggleValue ? "enabled" : "disabled"}`;
    });
  }

  if (action === "estimator") {
    const value = parseBooleanWord(args[1] ?? "");
    if (value === undefined) {
      return { text: "Usage: /tokenpilot eviction estimator <on|off>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["taskStateEstimator", "enabled"], value);
      return `✅ taskStateEstimator.enabled = ${value}`;
    });
  }

  if (action === "set") {
    const key = args[1] ?? "";
    const rawValue = args[2] ?? "";

    const numericKeys = new Set([
      "minBlockChars",
      "maxCandidateBlocks",
      "batchTurns",
      "evictionLookaheadTurns",
      "completedSummaryMaxRawTurns",
      "evictionPromotionHotTailSize",
    ]);
    const enumKeys = new Set(["policy", "replacementMode", "inputMode", "lifecycleMode", "evidenceMode"]);

    if (!numericKeys.has(key) && !enumKeys.has(key)) {
      return { text: "Usage: /tokenpilot eviction set <key> <value>" };
    }

    let parsedValue: string | number | undefined;
    if (numericKeys.has(key)) parsedValue = parseNumberWord(rawValue);
    if (enumKeys.has(key)) parsedValue = parseStringValue(rawValue);
    if (parsedValue === undefined || parsedValue === "") {
      return { text: "Usage: /tokenpilot eviction set <key> <value>" };
    }

    const targetPath = key === "policy" || key === "replacementMode" || key === "minBlockChars" || key === "maxCandidateBlocks"
      ? ["eviction", key]
      : ["taskStateEstimator", key];

    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, targetPath, parsedValue);
      return `✅ ${targetPath.join(".")} = ${parsedValue}`;
    });
  }

  return { text: formatTokenPilotHelp("eviction") };
}

async function handleReport(ctx: any, currentConfig: Record<string, unknown>): Promise<{ text: string }> {
  const stateDir = resolveStateDir(currentConfig);
  if (!stateDir) {
    return { text: "⚠️ TokenPilot stateDir is not configured." };
  }

  const latest = await readLatestUxEffect(stateDir);
  const directSessionId = resolveDirectSessionId(ctx);
  const scopedSessionKey = directSessionId ? undefined : extractScopedSessionKey(ctx);
  const scopedSessionId = directSessionId ? undefined : resolveScopedSessionId(stateDir, ctx);
  const sessionId = directSessionId ?? scopedSessionId ?? (scopedSessionKey ? undefined : latest?.sessionId);
  if (!sessionId) {
    return { text: scopedSessionKey ? "No TokenPilot savings recorded yet for current session." : "No TokenPilot session stats yet." };
  }

  const aggregate = await readSessionUxAggregate(stateDir, sessionId);
  if (!aggregate) {
    return { text: `No TokenPilot savings recorded yet for session ${sessionId}.` };
  }

  const pluginCfg = pluginConfigRecord(currentConfig);
  const detailsEnabled = getNestedValue(pluginCfg, ["ux", "details"]) === true;
  const latestCountMode = latest?.countMode ?? aggregate.latestCountMode ?? "litellm_tokens";
  const unitLabel = countModeLabel(latestCountMode);
  const savedCount = latestCountMode === "chars" ? aggregate.charSavedCount : aggregate.tokenSavedCount;
  const optimizedTurns = latestCountMode === "chars" ? aggregate.charOptimizedTurns : aggregate.tokenOptimizedTurns;
  const avgSavedPerOptimizedTurn = latestCountMode === "chars"
    ? aggregate.avgSavedCharsPerOptimizedTurn
    : aggregate.avgSavedTokensPerOptimizedTurn;
  const lines = [
    "TokenPilot report:",
    `- session: ${sessionId}`,
    `- saved ${unitLabel}: ${formatInt(savedCount)}`,
    `- recorded turns: ${formatInt(aggregate.turns)}`,
    `- optimized turns: ${formatInt(optimizedTurns)}`,
    `- avg saved ${unitLabel} per optimized turn: ${formatInt(avgSavedPerOptimizedTurn)}`,
  ];

  if (detailsEnabled) {
    if (latest?.details?.requestSavedCount !== undefined) {
      lines.push(`- latest request savings: ${formatInt(latest.details.requestSavedCount)} ${unitLabel}`);
    }
    if (latest?.details?.responseSavedCount !== undefined) {
      lines.push(`- latest response savings: ${formatInt(latest.details.responseSavedCount)} ${unitLabel}`);
    }
  }

  return { text: lines.join("\n") };
}

async function handleSettings(api: any, currentConfig: Record<string, unknown>, rest: string): Promise<{ text: string }> {
  const args = splitArgs(rest);
  const key = args[0]?.toLowerCase() ?? "";

  if (!key) {
    const pluginCfg = pluginConfigRecord(currentConfig);
    return {
      text: [
        "TokenPilot settings:",
        `- details: ${formatOnOff(getNestedValue(pluginCfg, ["ux", "details"]))}`,
      ].join("\n"),
    };
  }

  if (key === "details") {
    const value = parseBooleanWord(args[1] ?? "");
    if (value === undefined) {
      return { text: "Usage: /tokenpilot settings details <on|off>" };
    }
    return writeUpdatedConfig(api, currentConfig, (nextConfig) => {
      const pluginCfg = ensurePluginConfig(nextConfig);
      setNestedValue(pluginCfg, ["ux", "details"], value);
      return `✅ ux.details = ${value}`;
    });
  }

  return { text: "Usage: /tokenpilot settings details <on|off>" };
}

export function registerTokenPilotCommand(api: any, logger: { debug?: (...args: unknown[]) => void }): void {
  if (typeof api.registerCommand !== "function") {
    logger.debug?.("[plugin-runtime] registerCommand unavailable; /tokenpilot not registered.");
    return;
  }

  const handler = async (ctx: any) => {
    const rawArgs = typeof ctx?.args === "string" ? ctx.args : "";
    const { action, rest } = parseCommandAction(rawArgs);
    const currentConfig = api.runtime.config.loadConfig() as Record<string, unknown>;

    if (!action || action === "help") {
      return action === "help" ? handleHelp(rest) : { text: `${summarizeTokenPilotStatus(currentConfig)}\n\n${formatTokenPilotHelp()}` };
    }

    if (action === "status") {
      return { text: summarizeTokenPilotStatus(currentConfig) };
    }

    if (action === "report") {
      return handleReport(ctx, currentConfig);
    }

    if (action === "settings") {
      return handleSettings(api, currentConfig, rest);
    }

    if (action === "stabilizer") {
      return handleStabilizer(api, currentConfig, rest);
    }

    if (action === "reduction") {
      return handleReduction(api, currentConfig, rest);
    }

    if (action === "eviction") {
      return handleEviction(api, currentConfig, rest);
    }

    return { text: formatTokenPilotHelp() };
  };

  api.registerCommand({
    name: "tokenpilot",
    description: "Manage TokenPilot runtime knobs by module.",
    acceptsArgs: true,
    handler,
  });
  api.registerCommand({
    name: "tp",
    description: "Alias for /tokenpilot.",
    acceptsArgs: true,
    handler,
  });
  logger.debug?.("[plugin-runtime] Registered /tokenpilot and /tp commands.");
}
