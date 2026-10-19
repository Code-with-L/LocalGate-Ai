import type { Simulated } from "./simulated";

export interface SimulatedAccessDecision {
  readonly id: string;
  readonly atUtc: string;
  readonly subject: string;
  readonly decision: "allow" | "deny" | "uncertain";
  readonly reason: string;
}

export interface SimulatedVisitorCredential {
  readonly id: string;
  readonly visitor: string;
  readonly credentialKind: "access_code" | "plate";
  readonly validFromUtc: string;
  readonly validToUtc: string;
  readonly status: "active" | "expiring-soon" | "expired" | "revoked";
}

export const simulatedAccessDecisions: Simulated<readonly SimulatedAccessDecision[]> = {
  source: "simulated",
  data: [
    {
      id: "dec-1",
      atUtc: "2026-10-19T12:31:00Z",
      subject: "Plate Placeholder abc-99",
      decision: "allow",
      reason: "Visitor credential active (simulated)",
    },
    {
      id: "dec-2",
      atUtc: "2026-10-19T12:30:12Z",
      subject: "Access code ####-2",
      decision: "deny",
      reason: "Credential expired (simulated)",
    },
    {
      id: "dec-3",
      atUtc: "2026-10-19T12:05:44Z",
      subject: "Plate Placeholder",
      decision: "uncertain",
      reason: "Detection confidence below threshold (simulated)",
    },
  ],
};

export const simulatedCredentials: Simulated<readonly SimulatedVisitorCredential[]> = {
  source: "simulated",
  data: [
    {
      id: "cred-1",
      visitor: "Guest homecoming (sim)",
      credentialKind: "access_code",
      validFromUtc: "2026-10-19T08:00:00Z",
      validToUtc: "2026-10-19T18:00:00Z",
      status: "active",
    },
    {
      id: "cred-2",
      visitor: "Delivery window (sim)",
      credentialKind: "access_code",
      validFromUtc: "2026-10-19T09:00:00Z",
      validToUtc: "2026-10-20T09:00:00Z",
      status: "active",
    },
    {
      id: "cred-3",
      visitor: "Contractor visit (sim)",
      credentialKind: "plate",
      validFromUtc: "2026-09-01T00:00:00Z",
      validToUtc: "2026-09-30T23:59:59Z",
      status: "expired",
    },
    {
      id: "cred-4",
      visitor: "Neighbor trial (sim)",
      credentialKind: "access_code",
      validFromUtc: "2026-10-20T00:00:00Z",
      validToUtc: "2026-10-20T23:59:59Z",
      status: "revoked",
    },
  ],
};
