import type { OperatingMode } from "../mocks/simulated";

/** Placeholder/global app surface config view — intentionally not SiteConfig. */
export interface AppSurfaceConfig {
  readonly currentOperatingMode: OperatingMode;
  readonly buildPhase: string;
}

export const simulatedAppSurface: readonly AppSurfaceConfig[] = [
  { currentOperatingMode: "SIMULATED", buildPhase: "P1 visual scaffold" },
];
