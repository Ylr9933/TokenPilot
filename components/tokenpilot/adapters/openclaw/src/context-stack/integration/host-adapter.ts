import { join } from "node:path";
import { createStaticStatePathResolver } from "@tokenpilot/host-adapter";

export function createOpenClawStatePathResolver() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  const envStateDir = process.env.TOKENPILOT_STATE_DIR;
  const defaultStateDir =
    typeof envStateDir === "string" && envStateDir.trim().length > 0
      ? envStateDir.trim()
      : join(homeDir, ".openclaw", "tokenpilot-plugin-state");

  return createStaticStatePathResolver({
    hostId: "openclaw",
    displayName: "OpenClaw",
    stateDir: defaultStateDir,
    namespaceDir: "tokenpilot",
    workspaceArchiveDirname: ".tokenpilot-archives",
  });
}
