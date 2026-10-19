import type { Simulated, ModuleState, Freshness } from "./simulated";

export interface SimulatedGateState {
  readonly name: string;
  readonly moduleState: ModuleState;
  readonly lastChangedAtUtc: string;
  readonly safetyDevices: readonly SimulatedSafetyDevice[];
}

export interface SimulatedSafetyDevice {
  readonly id: string;
  readonly name: string;
  readonly reportState: "clear" | "obstructed";
  readonly freshness: Freshness;
  readonly lastReportedAtUtc: string;
}

export interface SimulatedGateEvent {
  readonly id: string;
  readonly atUtc: string;
  readonly actor: string;
  readonly summary: string;
}

/** Gatehead-style real-time telemetry counts for the dashboard chart mock. */
export interface SimulatedTelemetryPoint {
  readonly minuteUtc: string;
  readonly commands: number;
}

export const simulatedGate: Simulated<SimulatedGateState> = {
  source: "simulated",
  data: {
    name: "Perimeter Gate (placeholder)",
    moduleState: "gate-in-motion",
    lastChangedAtUtc: "2026-10-19T12:34:00Z",
    safetyDevices: [
      {
        id: "safety-1",
        name: "Photocell A (sim)",
        reportState: "clear",
        freshness: "fresh",
        lastReportedAtUtc: "2026-10-19T12:33:58Z",
      },
      {
        id: "safety-2",
        name: "Photocell B (sim)",
        reportState: "obstructed",
        freshness: "fresh",
        lastReportedAtUtc: "2026-10-19T12:33:58Z",
      },
      {
        id: "safety-3",
        name: "Edge sensor (sim)",
        reportState: "clear",
        freshness: "stale",
        lastReportedAtUtc: "2026-10-19T11:02:10Z",
      },
      {
        id: "safety-4",
        name: "Loop C (sim)",
        reportState: "clear",
        freshness: "unknown",
        lastReportedAtUtc: "2026-10-19T00:00:00Z",
      },
    ],
  },
};

export const simulatedGateEvents: Simulated<readonly SimulatedGateEvent[]> = {
  source: "simulated",
  data: [
    {
      id: "evt-1",
      atUtc: "2026-10-19T12:34:00Z",
      actor: "Simulator",
      summary: "Gate opening command issued (simulated)",
    },
    {
      id: "evt-2",
      atUtc: "2026-10-19T12:31:20Z",
      actor: "Simulator",
      summary: "Access decision accepted for PLT- Placeholder (simulated)",
    },
    {
      id: "evt-3",
      atUtc: "2026-10-19T12:29:05Z",
      actor: "Simulator",
      summary: "Photocell A obstruction cleared (simulated)",
    },
  ],
};

export const simulatedTelemetry: Simulated<readonly SimulatedTelemetryPoint[]> = {
  source: "simulated",
  data: [
    { minuteUtc: "12:24", commands: 2 },
    { minuteUtc: "12:25", commands: 1 },
    { minuteUtc: "12:26", commands: 0 },
    { minuteUtc: "12:27", commands: 3 },
    { minuteUtc: "12:28", commands: 1 },
    { minuteUtc: "12:29", commands: 0 },
    { minuteUtc: "12:30", commands: 2 },
  ],
};
