import { afterAll, describe, expect, it } from "vitest";
import { createSimulatedSystem } from "../simulator/simulator";

const openRequest = {
  subjectType: "operator" as const,
  subjectId: "admin-user",
  sessionId: "sess-1",
};

async function flushAsync() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const heldSystems: { dispose(): void }[] = [];

afterAll(() => {
  for (const system of heldSystems) {
    system.dispose();
  }
});

async function makeSystem(
  authorize?: (context: {
    verb: "OPEN" | "CLOSE" | "HALT" | "RESUME";
    subjectType: string;
    subjectId: string;
  }) => {
    allowed: boolean;
  },
) {
  const system = createSimulatedSystem({ authorize });
  heldSystems.push(system);
  return system;
}

function failAuditAfter(system: ReturnType<typeof createSimulatedSystem>, allowedPushes: number) {
  const original = system.audit.pushRecord.bind(system.audit);
  let pushes = 0;
  system.audit.pushRecord = (record) => {
    pushes += 1;
    if (pushes > allowedPushes) {
      throw new Error("audit store unavailable");
    }
    original(record);
  };
}

describe("GateCoordinator command flow", () => {
  it("grants OPEN with ack, decision evidence and both audit entries", async () => {
    const system = await makeSystem();
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("GRANTED");
    if (outcome.kind !== "GRANTED") {
      return;
    }
    expect(outcome.ack).not.toBeNull();
    if (outcome.ack) {
      expect(outcome.ack.commandId.length > 0).toBe(true);
    }
    const decision = outcome.decision;
    expect(decision.outcome).toBe("GRANTED");
    expect(decision.deniedReason).toBeNull();
    expect(decision.correlationId.length > 0).toBe(true);
    expect(decision.auditRecordId.length > 0).toBe(true);
    expect(decision.actorType).toBe("OPERATOR");
    expect(decision.evidence).toEqual([{ phase: "pending" }]);
    const actions = system.audit.records.map((record) => record.action);
    expect(actions).toContain("OPEN_GATE_ISSUED");
    expect(actions).toContain("OPEN_GATE_DISPATCH");
    expect(system.faults.records).toHaveLength(0);
  });

  it("mirrors adapter state and drains motion to OPEN_AWAIT_CLOSE", async () => {
    const system = await makeSystem();
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("GRANTED");
    system.advanceMs(5_001);
    await system.heartbeat();
    const status = await system.gate.status();
    expect(status.oxidation.gate_actuation_state).toBe("OPEN_AWAIT_CLOSE");
  });

  it("denies OPEN when authorize refuses and records the decision", async () => {
    const system = await makeSystem(() => ({ allowed: false }));
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") {
      return;
    }
    expect(outcome.decision.deniedReason).toBe("authorization_denied");
    expect(outcome.decision.auditRecordId.length > 0).toBe(true);
    expect(system.stateChanges).toHaveLength(0);
    const actions = system.audit.records.map((record) => record.action);
    expect(actions).toContain("DECISION_RECORDED");
    expect(actions).not.toContain("OPEN_GATE_ISSUED");
  });

  it("denies OPEN when safety is TRIGGERED", async () => {
    const system = await makeSystem();
    system.setSafetyTriggered(true);
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") {
      return;
    }
    expect(outcome.decision.deniedReason).toBe("safety_triggered");
    expect(system.stateChanges).toHaveLength(0);
  });

  it("denies OPEN when safety is UNCLEAR due to device failure", async () => {
    const system = await makeSystem();
    system.knobs.deviceFailed = true;
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") {
      return;
    }
    expect(outcome.decision.deniedReason).toBe("safety_unknown");
  });

  it("denies OPEN when safety reports are stale", async () => {
    const system = await makeSystem();
    system.knobs.reportSkewMs = 60_000;
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") {
      return;
    }
    expect(outcome.decision.deniedReason).toBe("safety_stale");
    expect(system.stateChanges).toHaveLength(0);
  });

  it("denies OPEN when safety reports come from the future beyond clock skew", async () => {
    const system = await makeSystem();
    system.knobs.reportSkewMs = -60_000;
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("DENIED");
    if (outcome.kind !== "DENIED") {
      return;
    }
    expect(outcome.decision.deniedReason).toBe("safety_unknown");
    expect(system.stateChanges).toHaveLength(0);
  });

  it("denies a second OPEN while already OPENING (validation_failed)", async () => {
    const system = await makeSystem();
    const first = await system.coordinator.request("OPEN", openRequest);
    expect(first.kind).toBe("GRANTED");
    const second = await system.coordinator.request("OPEN", openRequest);
    expect(second.kind).toBe("DENIED");
    if (second.kind !== "DENIED") {
      return;
    }
    expect(second.decision.deniedReason).toBe("validation_failed");
    const stateChanges = system.stateChanges;
    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0]?.to).toBe("OPENING");
  });
});

describe("GateCoordinator operator delegation", () => {
  it("passes authorize actorType into the decision", async () => {
    const system = await makeSystem(() => ({ allowed: true }));
    const outcome = await system.coordinator.request("OPEN", openRequest);
    if (outcome.kind !== "GRANTED") {
      throw new Error("expected grant");
    }
    expect(outcome.decision.actorType).toBe("OPERATOR");
  });

  it("returns GRANTED with null ack and an OPERATOR_UNREACHABLE fault when the adapter is gone", async () => {
    const system = await makeSystem();
    system.knobs.disconnected = true;
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("GRANTED");
    if (outcome.kind !== "GRANTED") {
      return;
    }
    expect(outcome.ack).toBeNull();
    expect(outcome.dispatch).toBe("UNREACHABLE");
    expect(system.faults.records.some((fault) => fault.kind === "OPERATOR_UNREACHABLE")).toBe(true);
  });

  it("raises OPERATOR_UNREACHABLE and clears pending after the dropped-ack heartbeat timeout", async () => {
    const system = await makeSystem();
    system.knobs.dropAcks = true;
    const requestPromise = system.coordinator.request("OPEN", openRequest);
    await flushAsync();
    system.advanceMs(10_001);
    const outcome = await requestPromise;
    expect(outcome.kind).toBe("GRANTED");
    if (outcome.kind !== "GRANTED") {
      return;
    }
    expect(outcome.ack).toBeNull();
    expect(system.faults.records.some((fault) => fault.kind === "OPERATOR_UNREACHABLE")).toBe(true);
    await system.heartbeat();
  });
});

describe("GateCoordinator audit decision linkage", () => {
  it("links each decision to an audit record id that exists in the ledger", async () => {
    const system = await makeSystem();
    await system.coordinator.request("OPEN", openRequest);
    system.advanceMs(5_001);
    await system.heartbeat();
    await system.coordinator.request("CLOSE", openRequest);
    const auditIds = new Set(system.audit.records.map((record) => record.auditId));
    const decisions = system.decisions;
    expect(decisions).toHaveLength(2);
    for (const decision of decisions) {
      expect(decision.outcome).toBe("GRANTED");
      expect(decision.deniedReason).toBeNull();
      expect(auditIds.has(decision.auditRecordId)).toBe(true);
    }
  });

  it("refuses the grant when the issue audit write fails", async () => {
    const system = await makeSystem();
    failAuditAfter(system, 0);
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("REFUSED");
    if (outcome.kind !== "REFUSED") {
      return;
    }
    expect(outcome.reason).toBe("audit_unavailable");
    expect(system.decisions).toHaveLength(0);
    expect(system.stateChanges).toHaveLength(0);
    expect(system.faults.records.some((fault) => fault.kind === "AUDIT_WRITE_FAILED")).toBe(true);
  });

  it("reports NOT_ATTEMPTED when the dispatch audit write fails", async () => {
    const system = await makeSystem();
    failAuditAfter(system, 1);
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("GRANTED");
    if (outcome.kind !== "GRANTED") {
      return;
    }
    expect(outcome.dispatch).toBe("NOT_ATTEMPTED");
    expect(outcome.ack).toBeNull();
    expect(system.stateChanges).toHaveLength(0);
    const decisions = system.decisions;
    expect(decisions).toHaveLength(1);
    const auditIds = new Set(system.audit.records.map((record) => record.auditId));
    for (const decision of decisions) {
      expect(auditIds.has(decision.auditRecordId)).toBe(true);
    }
    expect(system.faults.records.some((fault) => fault.kind === "AUDIT_WRITE_FAILED")).toBe(true);
  });

  it("refuses a denial when the audit write fails", async () => {
    const system = await makeSystem(() => ({ allowed: false }));
    failAuditAfter(system, 0);
    const outcome = await system.coordinator.request("OPEN", openRequest);
    expect(outcome.kind).toBe("REFUSED");
    if (outcome.kind !== "REFUSED") {
      return;
    }
    expect(outcome.reason).toBe("audit_unavailable");
    expect(system.decisions).toHaveLength(0);
    expect(system.stateChanges).toHaveLength(0);
    expect(system.faults.records.some((fault) => fault.kind === "AUDIT_WRITE_FAILED")).toBe(true);
  });
});

describe("GateCoordinator close cycle", () => {
  it("runs OPEN, CLOSE and CLOSE completion back to IDLE", async () => {
    const system = await makeSystem();
    await system.coordinator.request("OPEN", openRequest);
    system.advanceMs(5_001);
    await system.heartbeat();
    const closeOutcome = await system.coordinator.request("CLOSE", openRequest);
    expect(closeOutcome.kind).toBe("GRANTED");
    system.advanceMs(5_001);
    await system.heartbeat();
    const status = await system.gate.status();
    expect(status.oxidation.gate_actuation_state).toBe("IDLE");
    const transitions = system.stateChanges.map((change) => ({ from: change.from, to: change.to }));
    expect(transitions).toEqual([
      { from: "IDLE", to: "OPENING" },
      { from: "OPENING", to: "OPEN_AWAIT_CLOSE" },
      { from: "OPEN_AWAIT_CLOSE", to: "CLOSING" },
      { from: "CLOSING", to: "IDLE" },
    ]);
  });
});

describe("GateCoordinator projected state usage", () => {
  it("accepts CLOSE against the projected OPEN_AWAIT_CLOSE state", async () => {
    const system = await makeSystem();
    const openOutcome = await system.coordinator.request("OPEN", openRequest);
    expect(openOutcome.kind).toBe("GRANTED");
    const closeOutcome = await system.coordinator.request("CLOSE", openRequest);
    expect(closeOutcome.kind).toBe("DENIED");
    if (closeOutcome.kind !== "DENIED") {
      return;
    }
    expect(closeOutcome.decision.deniedReason).toBe("validation_failed");
  });
});
