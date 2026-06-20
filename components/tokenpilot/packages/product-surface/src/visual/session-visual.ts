import { createServer, type Server } from "node:http";
import { defaultPluginStateDir } from "@tokenpilot/runtime-core";
import { readVisualSessionData, readVisualSessionList } from "./session-visual-data.js";
import { renderVisualPageHtml, renderVisualPageScript } from "./session-visual-page.js";

export type VisualStateDirResolver = (config: Record<string, unknown>) => string | undefined;

let visualServerState: { stateDir: string; server: Server; url: string } | null = null;

function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(res: any, html: string): void {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
}

function sendJs(res: any, script: string): void {
  res.statusCode = 200;
  res.setHeader("content-type", "application/javascript; charset=utf-8");
  res.end(script);
}

async function createVisualServer(stateDir: string): Promise<{ stateDir: string; server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        sendHtml(res, renderVisualPageHtml());
        return;
      }
      if (url.pathname === "/app.js") {
        sendJs(res, renderVisualPageScript());
        return;
      }
      if (url.pathname === "/api/sessions") {
        sendJson(res, 200, { sessions: await readVisualSessionList(stateDir) });
        return;
      }
      if (url.pathname === "/api/session") {
        const sessionId = String(url.searchParams.get("sessionId") ?? "").trim();
        if (!sessionId) {
          sendJson(res, 400, { error: "sessionId is required" });
          return;
        }
        sendJson(res, 200, await readVisualSessionData(stateDir, sessionId));
        return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve visual server address.");
  }

  return {
    stateDir,
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function ensureVisualServer(stateDir: string): Promise<{ stateDir: string; server: Server; url: string }> {
  if (visualServerState?.stateDir === stateDir) return visualServerState;
  if (visualServerState) {
    await new Promise<void>((resolve) => {
      visualServerState?.server.close(() => resolve());
    });
  }
  visualServerState = await createVisualServer(stateDir);
  return visualServerState;
}

export async function handleVisual(
  currentConfig: Record<string, unknown>,
  resolveStateDir: VisualStateDirResolver,
): Promise<{ text: string }> {
  const stateDir = resolveStateDir(currentConfig) ?? defaultPluginStateDir();
  const visualServer = await ensureVisualServer(stateDir);
  const sessions = await readVisualSessionList(stateDir);
  const lines = [
    `TokenPilot visual: ${visualServer.url}`,
    `- sessions with snapshots: ${sessions.length}`,
    "- open this URL in your browser to inspect reduction and eviction before/after views",
  ];
  if (sessions.length === 0) {
    lines.push("- no visual snapshots yet; new reduction/eviction events will appear after future turns");
  }
  return { text: lines.join("\n") };
}
