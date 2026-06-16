#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getByPath(root, path) {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function resolveOpenClawStateRoot() {
  return normalizeText(process.env.OPENCLAW_STATE_DIR)
    || normalizeText(process.env.OPENCLAW_HOME)
    || join(homedir(), ".openclaw");
}

function resolveConfigPath() {
  return normalizeText(process.env.OPENCLAW_CONFIG_PATH)
    || join(resolveOpenClawStateRoot(), "openclaw.json");
}

function resolvePluginStateDir(config) {
  const configured = getByPath(config, ["plugins", "entries", "tokenpilot", "config", "stateDir"]);
  return normalizeText(configured) || join(resolveOpenClawStateRoot(), "tokenpilot-plugin-state");
}

function printLine(status, message) {
  console.log(`${status} ${message}`);
}

const configPath = resolveConfigPath();
const stateRoot = resolveOpenClawStateRoot();
const extensionPath = join(stateRoot, "extensions", "tokenpilot");

console.log("TokenPilot OpenClaw doctor");
console.log(`- state root: ${stateRoot}`);
console.log(`- config path: ${configPath}`);
console.log(`- extension path: ${extensionPath}`);

if (!existsSync(configPath)) {
  printLine("FAIL", "OpenClaw config file not found.");
  process.exitCode = 1;
  process.exit();
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  printLine("FAIL", `OpenClaw config is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
  process.exit();
}

const pluginEnabled = getByPath(config, ["plugins", "entries", "tokenpilot", "enabled"]) === true;
const runtimeEnabled = getByPath(config, ["plugins", "entries", "tokenpilot", "config", "enabled"]) === true;
const toolsProfile = normalizeText(getByPath(config, ["tools", "profile"]));
const allow = Array.isArray(getByPath(config, ["tools", "allow"])) ? getByPath(config, ["tools", "allow"]) : [];
const alsoAllow = Array.isArray(getByPath(config, ["tools", "alsoAllow"])) ? getByPath(config, ["tools", "alsoAllow"]) : [];
const modelKeys = getByPath(config, ["agents", "defaults", "models"]);
const hasTokenPilotModelNamespace = modelKeys && typeof modelKeys === "object"
  ? Object.keys(modelKeys).some((key) => key.startsWith("tokenpilot/"))
  : false;
const pluginStateDir = resolvePluginStateDir(config);

printLine(pluginEnabled ? "OK" : "WARN", `plugin entry enabled: ${pluginEnabled}`);
printLine(runtimeEnabled ? "OK" : "WARN", `runtime config enabled: ${runtimeEnabled}`);
printLine(toolsProfile === "coding" ? "OK" : "WARN", `tools.profile: ${toolsProfile || "(unset)"}`);
printLine(
  allow.includes("memory_fault_recover") || alsoAllow.includes("memory_fault_recover") ? "OK" : "WARN",
  "memory_fault_recover is allowed",
);
printLine(existsSync(extensionPath) ? "OK" : "WARN", `installed extension directory exists: ${existsSync(extensionPath)}`);
printLine(existsSync(pluginStateDir) ? "OK" : "WARN", `plugin state dir exists: ${pluginStateDir}`);
printLine(hasTokenPilotModelNamespace ? "OK" : "WARN", "tokenpilot/<model> namespace is registered in agents.defaults.models");

if (!pluginEnabled || !runtimeEnabled) {
  console.log("");
  console.log("Suggested fix:");
  console.log("  npm run install:release");
}
