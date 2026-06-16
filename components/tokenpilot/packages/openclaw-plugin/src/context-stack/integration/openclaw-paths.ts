import { homedir } from "node:os";
import { join } from "node:path";

export function resolveOpenClawStateRoot(): string {
  const explicit =
    String(process.env.OPENCLAW_STATE_DIR ?? "").trim()
    || String(process.env.OPENCLAW_HOME ?? "").trim();
  if (explicit) return explicit;
  return join(homedir(), ".openclaw");
}

export function resolveOpenClawConfigPath(): string {
  const explicit = String(process.env.OPENCLAW_CONFIG_PATH ?? "").trim();
  if (explicit) return explicit;
  return join(resolveOpenClawStateRoot(), "openclaw.json");
}

export function resolveOpenClawAgentsDir(): string {
  return join(resolveOpenClawStateRoot(), "agents");
}

export function resolveOpenClawSessionsRegistryPath(agentId: string): string {
  return join(resolveOpenClawAgentsDir(), agentId, "sessions", "sessions.json");
}
