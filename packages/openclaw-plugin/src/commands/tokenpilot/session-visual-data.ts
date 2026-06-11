import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pluginStateSubdirCandidates, pluginStateSubdirWriteTargets } from "@tokenpilot/runtime-core";
import { appendJsonl } from "../../trace/io.js";

export type ReductionVisualSnapshot = {
  kind: "reduction";
  at: string;
  sessionId: string;
  requestId: string;
  model: string;
  upstreamModel: string;
  segmentId: string;
  itemIndex: number;
  field: "content" | "arguments" | "output" | "result";
  blockIndex?: number;
  blockKey?: "text" | "content";
  toolName?: string;
  dataPath?: string;
  savedChars: number;
  beforeText: string;
  afterText: string;
  report: Array<{
    id: string;
    phase: string;
    target: string;
    changed: boolean;
    note?: string;
    skippedReason?: string;
    beforeChars?: number;
    afterChars?: number;
    touchedSegmentIds?: string[];
  }>;
};

export type EvictionVisualSnapshot = {
  kind: "eviction";
  at: string;
  sessionId: string;
  taskId: string;
  taskLabel?: string;
  replacementMode: "pointer_stub" | "drop";
  beforeText: string;
  afterText: string;
  beforeChars: number;
  afterChars: number;
  archivePath: string;
  dataKey: string;
  turnAbsIds: string[];
};

export type VisualSessionSummary = {
  sessionId: string;
  reductionCount: number;
  evictionCount: number;
  lastAt: string;
};

export type VisualSessionData = {
  sessionId: string;
  reduction: ReductionVisualSnapshot[];
  eviction: EvictionVisualSnapshot[];
};

function encodeSessionId(sessionId: string): string {
  return encodeURIComponent(String(sessionId || "").trim() || "session");
}

function snapshotWriteTargets(stateDir: string, kind: "reduction" | "eviction", sessionId: string): string[] {
  return pluginStateSubdirWriteTargets(stateDir, "visual", kind, `${encodeSessionId(sessionId)}.jsonl`);
}

function snapshotCandidates(stateDir: string, kind: "reduction" | "eviction", sessionId: string): string[] {
  return pluginStateSubdirCandidates(stateDir, "visual", kind, `${encodeSessionId(sessionId)}.jsonl`);
}

function snapshotDirCandidates(stateDir: string, kind: "reduction" | "eviction"): string[] {
  return pluginStateSubdirCandidates(stateDir, "visual", kind);
}

function parseJsonlLines<T>(raw: string): T[] {
  const out: T[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // Ignore malformed historical lines.
    }
  }
  return out;
}

function sortByAtDesc<T extends { at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => String(right.at).localeCompare(String(left.at)));
}

function latestAtOf<T extends { at: string }>(items: T[]): string {
  return items.reduce((latest, item) => item.at > latest ? item.at : latest, "");
}

async function readSnapshotFile<T>(paths: string[]): Promise<T[]> {
  for (const path of paths) {
    try {
      const raw = await readFile(path, "utf8");
      return parseJsonlLines<T>(raw);
    } catch {
      // try next candidate
    }
  }
  return [];
}

async function listSnapshotFiles(stateDir: string, kind: "reduction" | "eviction"): Promise<string[]> {
  for (const dir of snapshotDirCandidates(stateDir, kind)) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => entry.name)
        .sort();
    } catch {
      // try next candidate
    }
  }
  return [];
}

export async function appendReductionVisualSnapshot(stateDir: string, snapshot: ReductionVisualSnapshot): Promise<void> {
  if (!snapshot.sessionId || snapshot.savedChars <= 0) return;
  for (const path of snapshotWriteTargets(stateDir, "reduction", snapshot.sessionId)) {
    await appendJsonl(path, snapshot);
  }
}

export async function appendEvictionVisualSnapshot(stateDir: string, snapshot: EvictionVisualSnapshot): Promise<void> {
  if (!snapshot.sessionId || !snapshot.taskId) return;
  for (const path of snapshotWriteTargets(stateDir, "eviction", snapshot.sessionId)) {
    await appendJsonl(path, snapshot);
  }
}

export async function readVisualSessionData(stateDir: string, sessionId: string): Promise<VisualSessionData> {
  const reduction = sortByAtDesc(await readSnapshotFile<ReductionVisualSnapshot>(snapshotCandidates(stateDir, "reduction", sessionId)));
  const eviction = sortByAtDesc(await readSnapshotFile<EvictionVisualSnapshot>(snapshotCandidates(stateDir, "eviction", sessionId)));
  return {
    sessionId,
    reduction,
    eviction,
  };
}

export async function readVisualSessionList(stateDir: string): Promise<VisualSessionSummary[]> {
  const reductionFiles = await listSnapshotFiles(stateDir, "reduction");
  const evictionFiles = await listSnapshotFiles(stateDir, "eviction");
  const summaryBySessionId = new Map<string, VisualSessionSummary>();

  const mergeCount = async (kind: "reduction" | "eviction", fileName: string) => {
    const sessionId = decodeURIComponent(basename(fileName, ".jsonl"));
    const summary = summaryBySessionId.get(sessionId) ?? {
      sessionId,
      reductionCount: 0,
      evictionCount: 0,
      lastAt: "",
    };
    if (kind === "reduction") {
      const snapshots = await readSnapshotFile<ReductionVisualSnapshot>(snapshotCandidates(stateDir, "reduction", sessionId));
      if (snapshots.length === 0) return;
      summary.reductionCount = snapshots.length;
      const latestAt = latestAtOf(snapshots);
      if (latestAt > summary.lastAt) summary.lastAt = latestAt;
    } else {
      const snapshots = await readSnapshotFile<EvictionVisualSnapshot>(snapshotCandidates(stateDir, "eviction", sessionId));
      if (snapshots.length === 0) return;
      summary.evictionCount = snapshots.length;
      const latestAt = latestAtOf(snapshots);
      if (latestAt > summary.lastAt) summary.lastAt = latestAt;
    }
    summaryBySessionId.set(sessionId, summary);
  };

  for (const fileName of reductionFiles) {
    await mergeCount("reduction", fileName);
  }
  for (const fileName of evictionFiles) {
    await mergeCount("eviction", fileName);
  }

  return [...summaryBySessionId.values()].sort((left, right) => right.lastAt.localeCompare(left.lastAt));
}
