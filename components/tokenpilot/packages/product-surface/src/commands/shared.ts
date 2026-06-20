import type {
  TokenPilotProductCommandContext,
  TokenPilotProductCommandResult,
  TokenPilotProductSurfaceConfigAdapter,
  TokenPilotProductSurfaceHostBridge,
} from "@tokenpilot/host-adapter";

export type ProductSurfaceActionHandler = (
  ctx: TokenPilotProductCommandContext,
  currentConfig: Record<string, unknown>,
  rest: string,
) => Promise<TokenPilotProductCommandResult> | TokenPilotProductCommandResult;

export type ProductSurfaceCommandDeps = {
  bridge: TokenPilotProductSurfaceHostBridge;
  configAdapter: TokenPilotProductSurfaceConfigAdapter;
};

export async function writeUpdatedConfig(
  bridge: TokenPilotProductSurfaceHostBridge,
  currentConfig: Record<string, unknown>,
  mutate: (nextConfig: Record<string, unknown>) => string,
): Promise<TokenPilotProductCommandResult> {
  const nextConfig = structuredClone(currentConfig);
  const message = mutate(nextConfig);
  await bridge.writeConfig(nextConfig);
  return { text: message };
}
