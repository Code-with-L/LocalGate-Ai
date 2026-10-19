import type { Simulated } from "./simulated";

export interface SimulatedOperator {
  readonly id: string;
  readonly displayName: string;
  readonly authMethod: "local_passphrase";
  readonly role: "owner" | "admin" | "operator" | "reviewer";
  readonly status: "active" | "disabled";
}

export interface SimulatedActivityEntry {
  readonly id: string;
  readonly atUtc: string;
  readonly visitor: string;
  readonly kind: "arrival" | "departure" | "denied-entry";
  readonly gateOutcome: "opened" | "stayed-closed";
}

export const simulatedOperators: Simulated<readonly SimulatedOperator[]> = {
  source: "simulated",
  data: [
    {
      id: "op-1",
      displayName: "Ada Placeholder (sim)",
      authMethod: "local_passphrase",
      role: "admin",
      status: "active",
    },
    {
      id: "op-2",
      displayName: "Grace Placeholder (sim)",
      authMethod: "local_passphrase",
      role: "operator",
      status: "active",
    },
  ],
};

export const simulatedActivity: Simulated<readonly SimulatedActivityEntry[]> = {
  source: "simulated",
  data: [
    {
      id: "act-1",
      atUtc: "2026-10-19T12:34:00Z",
      visitor: "Guest homecoming (sim)",
      kind: "arrival",
      gateOutcome: "opened",
    },
    {
      id: "act-2",
      atUtc: "2026-10-19T12:18:00Z",
      visitor: "Delivery window (sim)",
      kind: "denied-entry",
      gateOutcome: "stayed-closed",
    },
  ],
};
