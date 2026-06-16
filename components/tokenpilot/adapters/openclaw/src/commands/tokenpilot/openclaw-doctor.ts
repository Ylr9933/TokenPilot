import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveOpenClawConfigPath, resolveOpenClawStateRoot } from "../../context-stack/integration/openclaw-paths.js";
import { getNestedValue, pluginConfigRecord } from "./shared.js";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type OpenClawDoctorCheck = {
  key: string;
  ok: boolean;
  detail: string;
};

export type OpenClawDoctorReport = {
  ok: boolean;
  stateRoot: string;
  configPath: string;
  extensionPath: string;
  stateDir: string;
  checks: OpenClawDoctorCheck[];
};

export function inspectOpenClawDoctor(currentConfig?: Record<string, unknown>): OpenClawDoctorReport {
  const stateRoot = resolveOpenClawStateRoot();
  const configPath = resolveOpenClawConfigPath();
  const extensionPath = join(stateRoot, "extensions", "tokenpilot");

  if (!existsSync(configPath)) {
    return {
      ok: false,
      stateRoot,
      configPath,
      extensionPath,
      stateDir: join(stateRoot, "tokenpilot-plugin-state"),
      checks: [
        {
          key: "config",
          ok: false,
          detail: "OpenClaw config file not found.",
        },
      ],
    };
  }

  let config = currentConfig;
  if (!config) {
    config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  }

  const pluginCfg = pluginConfigRecord(config) ?? {};
  const stateDir = normalizeText(getNestedValue(pluginCfg, ["stateDir"])) || join(stateRoot, "tokenpilot-plugin-state");
  const allow = Array.isArray(getNestedValue(config, ["tools", "allow"])) ? getNestedValue(config, ["tools", "allow"]) as unknown[] : [];
  const alsoAllow = Array.isArray(getNestedValue(config, ["tools", "alsoAllow"])) ? getNestedValue(config, ["tools", "alsoAllow"]) as unknown[] : [];
  const modelKeys = getNestedValue(config, ["agents", "defaults", "models"]);
  const hasRuntimeModelNamespace = modelKeys && typeof modelKeys === "object"
    ? Object.keys(modelKeys as Record<string, unknown>).some((key) => key.startsWith("tokenpilot/") || key.startsWith("lightmem2/"))
    : false;

  const checks: OpenClawDoctorCheck[] = [
    {
      key: "pluginEntry",
      ok: getNestedValue(config, ["plugins", "entries", "tokenpilot", "enabled"]) === true,
      detail: `plugin entry enabled: ${getNestedValue(config, ["plugins", "entries", "tokenpilot", "enabled"]) === true}`,
    },
    {
      key: "runtimeConfig",
      ok: getNestedValue(pluginCfg, ["enabled"]) === true,
      detail: `runtime config enabled: ${getNestedValue(pluginCfg, ["enabled"]) === true}`,
    },
    {
      key: "toolsProfile",
      ok: normalizeText(getNestedValue(config, ["tools", "profile"])) === "coding",
      detail: `tools.profile: ${normalizeText(getNestedValue(config, ["tools", "profile"])) || "(unset)"}`,
    },
    {
      key: "memoryFaultRecover",
      ok: allow.includes("memory_fault_recover") || alsoAllow.includes("memory_fault_recover"),
      detail: "memory_fault_recover is allowed",
    },
    {
      key: "extensionPath",
      ok: existsSync(extensionPath),
      detail: `installed extension directory exists: ${existsSync(extensionPath)}`,
    },
    {
      key: "stateDir",
      ok: existsSync(stateDir),
      detail: `plugin state dir exists: ${stateDir}`,
    },
    {
      key: "modelNamespace",
      ok: hasRuntimeModelNamespace,
      detail: "tokenpilot/<model> or lightmem2/<model> namespace is registered in agents.defaults.models",
    },
  ];

  return {
    ok: checks.every((item) => item.ok),
    stateRoot,
    configPath,
    extensionPath,
    stateDir,
    checks,
  };
}

export function formatOpenClawDoctorReport(report: OpenClawDoctorReport): string {
  const lines = [
    "TokenPilot OpenClaw doctor:",
    `- state root: ${report.stateRoot}`,
    `- config path: ${report.configPath}`,
    `- extension path: ${report.extensionPath}`,
    `- state dir: ${report.stateDir}`,
    ...report.checks.map((check) => `- ${check.ok ? "OK" : "WARN"} ${check.detail}`),
  ];

  if (!report.ok) {
    lines.push("");
    lines.push("Suggested fix:");
    lines.push("- run `npm run install:release` in `components/tokenpilot/adapters/openclaw`");
  }

  return lines.join("\n");
}
