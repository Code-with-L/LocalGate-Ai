import { describe, expect, it } from "vitest";
import type { ScenarioResult, ScenarioStep } from "../simulator/scenario";
import { runScenario } from "../simulator/scenario";
import { ANPR_INGEST_LIMIT } from "../gatehead/contract";
import { createSimulatedSystem } from "../simulator/simulator";

const drain = { kind: "drain-gate-motion" } as const;
const ingest = { kind: "anpr-ingest" as const } as ScenarioStep;

async function run(steps: readonly ScenarioStep[]): Promise<ScenarioResult> {
  return runScenario(steps);
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SimScenario whole gate cycle", () => {
  it("runs OPEN, drains, CLOSE and drains back to IDLE", async () => {
    const result = await run([{ kind: "request-open" }, drain, { kind: "request-close" }, drain]);
    expect(result.issues).toEqual([]);
    expect(result.faults).toEqual([]);
    expect(result.finalGateState).toBe("IDLE");
    expect(result.stateChanges.map((change) => change.to)).toEqual([
      "OPENING",
      "OPEN_AWAIT_CLOSE",
      "CLOSING",
      "IDLE",
    ]);
    expect(result.decisions).toHaveLength(2);
    for (const decision of result.decisions) {
      expect(decision.outcome).toBe("GRANTED");
      expect(decision.deniedReason).toBeNull();
    }
    const auditActions = result.auditRecords.map((record) => record.action);
    expect(auditActions.filter((action) => action === "OPEN_GATE_ISSUED")).toHaveLength(2);
    expect(auditActions.filter((action) => action === "OPEN_GATE_DISPATCH")).toHaveLength(2);
  });

  it("needs motion drain before the close command is accepted", async () => {
    const result = await run([{ kind: "request-open" }, { kind: "request-close" }, drain, drain]);
    expect(result.issues).toEqual(["request-close:denied:validation_failed"]);
    expect(result.stateChanges.map((change) => change.to)).toEqual(["OPENING", "OPEN_AWAIT_CLOSE"]);
    expect(result.finalGateState).toBe("OPEN_AWAIT_CLOSE");
  });
});

describe("SimScenario safety guards", () => {
  it("denies OPEN when safety reports are stale", async () => {
    const result = await run([
      { kind: "stale-safety-reports", skewMs: 60_000 },
      { kind: "request-open" },
    ]);
    expect(result.issues).toEqual(["request-open:denied:safety_stale"]);
    expect(result.stateChanges).toEqual([]);
    expect(result.decisions[0]?.deniedReason).toBe("safety_stale");
  });

  it("denies OPEN while safety is triggered and grants after clearing", async () => {
    const result = await run([
      { kind: "set-knob", knob: "safetyTriggered", value: true },
      { kind: "request-open" },
      { kind: "set-knob", knob: "safetyTriggered", value: false },
      { kind: "request-open" },
    ]);
    expect(result.issues).toEqual(["request-open:denied:safety_triggered"]);
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions[0]?.deniedReason).toBe("safety_triggered");
    expect(result.decisions[1]?.deniedReason).toBeNull();
    expect(result.stateChanges.map((change) => change.to)).toEqual(["OPENING"]);
    expect(result.finalGateState).toBe("OPENING");
  });
});

describe("SimScenario camera and ANPR contracts", () => {
  it("captures snapshots with sim refs", async () => {
    const result = await run([{ kind: "snapshot" }, { kind: "snapshot" }]);
    expect(result.issues).toEqual([]);
    expect(result.snapshots).toEqual(["sim://snapshot/1", "sim://snapshot/2"]);
  });

  it("reports the camera as UNAVAILABLE while the cameraOffline knob is on", async () => {
    const result = await run([
      { kind: "set-knob", knob: "cameraOffline", value: true },
      { kind: "snapshot" },
    ]);
    expect(result.issues).toEqual(["snapshot:UNAVAILABLE"]);
    expect(result.snapshots).toEqual([]);
  });

  it("reports PROVIDER_REFUSED while the anprOffline knob is on", async () => {
    const result = await run([
      { kind: "set-knob", knob: "anprOffline", value: true },
      { kind: "anpr-connect" },
    ]);
    expect(result.issues).toEqual(["anpr-connect:PROVIDER_REFUSED"]);
  });

  it("enforces the static ingest limit after ANPR_INGEST_LIMIT successes", async () => {
    const steps: ScenarioStep[] = [
      { kind: "anpr-connect" },
      ...Array.from({ length: ANPR_INGEST_LIMIT }, () => ingest),
      ingest,
    ];
    const result = await run(steps);
    expect(result.issues).toEqual([`anpr-ingest:INGEST_LIMIT_EXCEEDED`]);
  });

  it("reports NOT_CONNECTED for ingest before connect", async () => {
    const result = await run([ingest]);
    expect(result.issues).toEqual(["anpr-ingest:NOT_CONNECTED"]);
  });
});

describe("SimScenario credential contract", () => {
  it("records weak pin then later revocation denials", async () => {
    const result = await run([
      { kind: "issue-credential", pin: "12" },
      { kind: "issue-credential" },
      { kind: "spend-credential" },
      { kind: "revoke-credential" },
      { kind: "spend-credential" },
    ]);
    expect(result.issues).toEqual([
      "issue-credential:pin-weak-or-malformed",
      "spend-credential:credential-revoked",
    ]);
    expect(result.credentialsIssued).toHaveLength(1);
    expect(result.credentialsIssued[0]?.usedCount).toBe(1);
    expect(result.credentialsIssued[0]?.isRevoked).toBe(true);
  });

  it("rejects a second revoke with already-revoked", async () => {
    const result = await run([
      { kind: "issue-credential" },
      { kind: "revoke-credential" },
      { kind: "revoke-credential" },
    ]);
    expect(result.issues).toEqual(["revoke-credential:already-revoked"]);
    expect(result.credentialsIssued).toHaveLength(1);
  });

  it("rejects spending without any issued credential", async () => {
    const result = await run([{ kind: "spend-credential" }, { kind: "revoke-credential" }]);
    expect(result.issues).toEqual([
      "spend-credential:none-issued",
      "revoke-credential:none-issued",
    ]);
  });
});

describe("SimScenario adapter teardown contract", () => {
  it("grants OPEN with a null ack and raises OPERATOR_UNREACHABLE when disconnected", async () => {
    const result = await run([
      { kind: "set-knob", knob: "disconnected", value: true },
      { kind: "request-open" },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.deniedReason).toBeNull();
    const faultKinds = result.faults.map((fault) => fault.kind);
    expect(faultKinds).toContain("OPERATOR_UNREACHABLE");
  });

  it("raises OPERATOR_UNREACHABLE only after the dispatch timeout with dropped acks", async () => {
    const system = createSimulatedSystem({ startNowMs: 1_000_000 });
    try {
      system.knobs.dropAcks = true;
      const pending = system.coordinator.request("OPEN", {
        subjectType: "operator",
        subjectId: "admin-user",
        sessionId: null,
      });
      await flushAsync();
      expect(system.faults.records.map((fault) => fault.kind)).not.toContain(
        "OPERATOR_UNREACHABLE",
      );
      system.advanceMs(10_001);
      const outcome = await pending;
      expect(outcome.kind).toBe("GRANTED");
      expect(outcome.kind === "GRANTED" ? outcome.ack : null).toBeNull();
      expect(system.faults.records.map((fault) => fault.kind)).toContain("OPERATOR_UNREACHABLE");
    } finally {
      system.dispose();
    }
  });
});
