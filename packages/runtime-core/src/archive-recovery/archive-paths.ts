import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const PLUGIN_STATE_DIRNAME = "tokenpilot-plugin-state";
export const PLUGIN_NAMESPACE_DIR = "tokenpilot";
export const WORKSPACE_ARCHIVE_DIRNAME = ".tokenpilot-archives";

export function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function defaultPluginStateDir(): string {
  const envStateDir = process.env.TOKENPILOT_STATE_DIR;
  if (typeof envStateDir === "string" && envStateDir.trim().length > 0) {
    return envStateDir.trim();
  }
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  const candidate = join(homeDir, ".openclaw", PLUGIN_STATE_DIRNAME);
  if (existsSync(candidate)) return candidate;
  return candidate;
}

export function pluginStateDirCandidates(explicitStateDir?: string): string[] {
  if (explicitStateDir && explicitStateDir.trim().length > 0) {
    return [explicitStateDir.trim()];
  }
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  return [join(homeDir, ".openclaw", PLUGIN_STATE_DIRNAME)];
}

export function pluginStateDirWriteTargets(stateDir: string): string[] {
  return [stateDir.trim()];
}

export function pluginStateSubdir(stateDir: string, ...parts: string[]): string {
  return join(stateDir, PLUGIN_NAMESPACE_DIR, ...parts);
}

export function pluginStateSubdirCandidates(stateDir: string, ...parts: string[]): string[] {
  return pluginStateDirCandidates(stateDir).map((root) => join(root, PLUGIN_NAMESPACE_DIR, ...parts));
}

export function pluginStateSubdirWriteTargets(stateDir: string, ...parts: string[]): string[] {
  return pluginStateDirWriteTargets(stateDir).map((root) => join(root, PLUGIN_NAMESPACE_DIR, ...parts));
}

export function workspaceArchiveDir(workspaceDir: string): string {
  return join(workspaceDir, WORKSPACE_ARCHIVE_DIRNAME);
}

export function workspaceArchiveDirCandidates(workspaceDir: string): string[] {
  return [join(workspaceDir, WORKSPACE_ARCHIVE_DIRNAME)];
}

export function archiveDirWriteTargets(archiveDir: string): string[] {
  return [archiveDir.trim()];
}

export function defaultArchiveDir(sessionId: string, workspaceDir?: string): string {
  if (workspaceDir) {
    return workspaceArchiveDir(workspaceDir);
  }
  const match = sessionId.match(/-(\d+)-j(\d+)$/);
  if (match) {
    const runId = match[1];
    const jobId = match[2];
    return `/tmp/pinchbench/${runId}/agent_workspace_j${jobId}/${WORKSPACE_ARCHIVE_DIRNAME}`;
  }
  return pluginStateSubdir(defaultPluginStateDir(), "tool-result-archives", sanitizePathPart(sessionId));
}

export function defaultArchiveLookupDirs(sessionId: string, stateDir?: string): string[] {
  const dirs: string[] = [];
  const sessionMatch = sessionId.match(/-(\d+)-j(\d+)$/);
  if (sessionMatch) {
    dirs.push(`/tmp/pinchbench/${sessionMatch[1]}/agent_workspace_j${sessionMatch[2]}/${WORKSPACE_ARCHIVE_DIRNAME}`);
  }
  const resolvedStateDir = stateDir ?? defaultPluginStateDir();
  dirs.push(...pluginStateSubdirCandidates(resolvedStateDir, "tool-result-archives", sessionId));
  return Array.from(new Set(dirs));
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
