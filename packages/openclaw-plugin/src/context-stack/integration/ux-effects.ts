import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pluginStateSubdirCandidates, pluginStateSubdirWriteTargets } from "@tokenpilot/runtime-core";
import { appendJsonl } from "../../trace/io.js";

export type CountMode = "litellm_tokens" | "chars";

export type UxEffectDetails = {
  requestSavedCount?: number;
  responseSavedCount?: number;
};

export type UxEffectRecord = {
  at: string;
  sessionId: string;
  model: string;
  countMode: CountMode;
  beforeCount: number;
  afterCount: number;
  savedCount: number;
  details?: UxEffectDetails;
};

export type UxSessionAggregate = {
  sessionId: string;
  turns: number;
  latestCountMode?: CountMode;
  tokenOptimizedTurns: number;
  tokenSavedCount: number;
  avgSavedTokensPerOptimizedTurn: number;
  charOptimizedTurns: number;
  charSavedCount: number;
  avgSavedCharsPerOptimizedTurn: number;
  latestAt?: string;
};

function canonicalizeInputForUx(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeInputForUx(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (key.startsWith("__tokenpilot_")) continue;
      const child = obj[key];
      if (child === undefined || typeof child === "function") continue;
      next[key] = canonicalizeInputForUx(child);
    }
    return next;
  }
  return String(value);
}

export function serializeCanonicalInputForUx(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(canonicalizeInputForUx(input));
}

const TOKEN_COUNTER_SCRIPT_CANDIDATES = Array.from(new Set([
  process.env.TOKENPILOT_TOKEN_COUNTER_SCRIPT,
  // Bundled plugin runtime: dist/index.js -> ../scripts/token_counter.py
  join(__dirname, "../scripts/token_counter.py"),
  // Alternate bundle layouts / older installs.
  join(__dirname, "../../scripts/token_counter.py"),
  // Source-tree execution during local dev.
  join(__dirname, "../../../scripts/token_counter.py"),
].filter((value): value is string => typeof value === "string" && value.trim().length > 0)));

function latestUxEffectPathCandidates(stateDir: string): string[] {
  return pluginStateSubdirCandidates(stateDir, "ux-effects", "latest.json");
}

function latestUxEffectWriteTargets(stateDir: string): string[] {
  return pluginStateSubdirWriteTargets(stateDir, "ux-effects", "latest.json");
}

function sessionUxAggregatePathCandidates(stateDir: string, sessionId: string): string[] {
  return pluginStateSubdirCandidates(stateDir, "ux-effects", "sessions", `${sessionId}.json`);
}

function sessionUxAggregateWriteTargets(stateDir: string, sessionId: string): string[] {
  return pluginStateSubdirWriteTargets(stateDir, "ux-effects", "sessions", `${sessionId}.json`);
}

async function resolveTokenCounterScript(): Promise<string | null> {
  for (const candidate of TOKEN_COUNTER_SCRIPT_CANDIDATES) {
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizeModelForCounter(model: string): string {
  const trimmed = String(model || "").trim();
  if (!trimmed) return "gpt-5.4-mini";
  if (trimmed.startsWith("tokenpilot/")) return trimmed.slice("tokenpilot/".length);
  if (trimmed.startsWith("tokenpilot/")) return trimmed.slice("tokenpilot/".length);
  return trimmed;
}

function runExecFile(
  file: string,
  args: string[],
  input: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    child.stdin?.end(input);
  });
}

export async function countTokensWithFallback(
  model: string,
  text: string,
): Promise<{ count: number; mode: CountMode }> {
  const normalizedModel = normalizeModelForCounter(model);
  const payload = JSON.stringify({
    model: normalizedModel,
    text,
  });

  try {
    const scriptPath = await resolveTokenCounterScript();
    if (scriptPath) {
      const out = await runExecFile("python3", [scriptPath], payload);
      const parsed = JSON.parse(out.stdout);
      if (parsed?.ok === true && Number.isFinite(parsed?.tokens)) {
        return {
          count: Math.max(0, Number(parsed.tokens)),
          mode: "litellm_tokens",
        };
      }
    }
  } catch {
    // fall through to raw char counting
  }

  return {
    count: text.length,
    mode: "chars",
  };
}

export async function recordUxEffect(
  stateDir: string,
  record: UxEffectRecord,
): Promise<void> {
  for (const historyPath of pluginStateSubdirWriteTargets(stateDir, "ux-effects", "history.jsonl")) {
    await appendJsonl(historyPath, record);
  }

  for (const latestPath of latestUxEffectWriteTargets(stateDir)) {
    await mkdir(dirname(latestPath), { recursive: true });
    await writeFile(latestPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  let current: UxSessionAggregate = {
    sessionId: record.sessionId,
    turns: 0,
    tokenOptimizedTurns: 0,
    tokenSavedCount: 0,
    avgSavedTokensPerOptimizedTurn: 0,
    charOptimizedTurns: 0,
    charSavedCount: 0,
    avgSavedCharsPerOptimizedTurn: 0,
  };

  for (const sessionPath of sessionUxAggregatePathCandidates(stateDir, record.sessionId)) {
    try {
      const raw = await readFile(sessionPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        current = {
          sessionId: String(parsed.sessionId ?? record.sessionId),
          turns: Number(parsed.turns ?? 0),
          latestCountMode:
            parsed.latestCountMode === "chars" || parsed.latestCountMode === "litellm_tokens"
              ? parsed.latestCountMode
              : "litellm_tokens",
          tokenOptimizedTurns: Number(parsed.tokenOptimizedTurns ?? parsed.optimizedTurns ?? 0),
          tokenSavedCount: Number(parsed.tokenSavedCount ?? parsed.savedTokens ?? 0),
          avgSavedTokensPerOptimizedTurn: Number(parsed.avgSavedTokensPerOptimizedTurn ?? 0),
          charOptimizedTurns: Number(parsed.charOptimizedTurns ?? 0),
          charSavedCount: Number(parsed.charSavedCount ?? 0),
          avgSavedCharsPerOptimizedTurn: Number(parsed.avgSavedCharsPerOptimizedTurn ?? 0),
          latestAt: typeof parsed.latestAt === "string" ? parsed.latestAt : undefined,
        };
        break;
      }
    } catch {
      // try next candidate
    }
  }

  current.turns += 1;
  current.latestCountMode = record.countMode;
  if (record.countMode === "litellm_tokens") {
    if (record.savedCount > 0) current.tokenOptimizedTurns += 1;
    current.tokenSavedCount += record.savedCount;
    current.avgSavedTokensPerOptimizedTurn = current.tokenOptimizedTurns > 0
      ? Math.round(current.tokenSavedCount / current.tokenOptimizedTurns)
      : 0;
  } else {
    if (record.savedCount > 0) current.charOptimizedTurns += 1;
    current.charSavedCount += record.savedCount;
    current.avgSavedCharsPerOptimizedTurn = current.charOptimizedTurns > 0
      ? Math.round(current.charSavedCount / current.charOptimizedTurns)
      : 0;
  }
  current.latestAt = record.at;

  for (const sessionPath of sessionUxAggregateWriteTargets(stateDir, record.sessionId)) {
    await mkdir(dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  }
}

export async function readLatestUxEffect(stateDir: string): Promise<UxEffectRecord | null> {
  for (const path of latestUxEffectPathCandidates(stateDir)) {
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as UxEffectRecord;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function readSessionUxAggregate(stateDir: string, sessionId: string): Promise<UxSessionAggregate | null> {
  for (const path of sessionUxAggregatePathCandidates(stateDir, sessionId)) {
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as UxSessionAggregate;
    } catch {
      // try next candidate
    }
  }
  return null;
}
