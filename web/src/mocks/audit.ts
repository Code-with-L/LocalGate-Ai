import type { Simulated } from "./simulated";

export interface SimulatedAuditRecord {
  readonly id: string;
  readonly atUtc: string;
  readonly actor: string;
  readonly action: string;
  readonly object: string;
  readonly result: "success" | "denied" | "failed";
}

export const simulatedAudit: Simulated<readonly SimulatedAuditRecord[]> = {
  source: "simulated",
  data: [
    {
      id: "audit-1",
      atUtc: "2026-10-19T12:34:00Z",
      actor: "operator:Ada (sim)",
      action: "gate.open",
      object: "perimeter-gate",
      result: "denied",
    },
    {
      id: "audit-2",
      atUtc: "2026-10-19T12:33:12Z",
      actor: "simulator",
      action: "fault.record",
      object: "Photocell B (sim)",
      result: "success",
    },
    {
      id: "audit-3",
      atUtc: "2026-10-19T12:20:00Z",
      actor: "operator:Grace (sim)",
      action: "credential.create",
      object: "Guest homecoming (sim)",
      result: "success",
    },
  ],
};
