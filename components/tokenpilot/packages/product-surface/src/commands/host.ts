import { splitArgs } from "../config.js";
import { formatTokenPilotHelp, summarizeTokenPilotStatus } from "../presentation.js";
import type { ProductSurfaceActionHandler, ProductSurfaceCommandDeps } from "./shared.js";

function handleHelp(rest: string) {
  const section = splitArgs(rest)[0]?.toLowerCase();
  return { text: formatTokenPilotHelp(section) };
}

export function createHostActionHandlers(params: ProductSurfaceCommandDeps): Record<string, ProductSurfaceActionHandler> {
  const { bridge, configAdapter } = params;

  return {
    help: (_ctx, _currentConfig, rest) => handleHelp(rest),
    status: (_ctx, currentConfig) => ({ text: summarizeTokenPilotStatus(currentConfig, configAdapter) }),
    report: (ctx, currentConfig) =>
      bridge.handleReport
        ? bridge.handleReport(ctx, currentConfig)
        : { text: formatTokenPilotHelp() },
    doctor: (_ctx, currentConfig) =>
      bridge.handleDoctor
        ? bridge.handleDoctor(currentConfig)
        : { text: formatTokenPilotHelp() },
    visual: (_ctx, currentConfig) =>
      bridge.handleVisual
        ? bridge.handleVisual(currentConfig)
        : { text: formatTokenPilotHelp() },
  };
}
