import type { Simulated, Freshness } from "./simulated";

export interface SimulatedDeviceAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind: "gate" | "camera" | "safety";
  readonly freshness: Freshness;
  readonly state: "connected" | "degraded" | "unconfigured";
}

export const simulatedDevices: Simulated<readonly SimulatedDeviceAdapter[]> = {
  source: "simulated",
  data: [
    {
      id: "gate-1",
      name: "Sliding gate adapter (sim)",
      kind: "gate",
      freshness: "fresh",
      state: "connected",
    },
    {
      id: "safety-1",
      name: "Safety loop adapter (sim)",
      kind: "safety",
      freshness: "stale",
      state: "degraded",
    },
    {
      id: "cam-1",
      name: "Plate camera adapter (sim)",
      kind: "camera",
      freshness: "unknown",
      state: "unconfigured",
    },
  ],
};

export interface SimulatedSiteConfig {
  readonly siteName: string;
  readonly timezone: string;
  readonly retentionDays: number;
}

export const simulatedSiteConfig: Simulated<SimulatedSiteConfig> = {
  source: "simulated",
  data: {
    siteName: "Placeholder home (sim)",
    timezone: "Europe/Placeholder",
    retentionDays: 30,
  },
};
