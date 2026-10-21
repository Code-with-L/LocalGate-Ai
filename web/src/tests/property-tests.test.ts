import { describe, expect, it } from "vitest";
import type { PlateDetectionEvent } from "../domain/detections";
import { appendDetection, createDetectionStore } from "../domain/detections";
import { appendAuditRecord, correctAuditRecord, createAuditStore } from "../domain/audit";
import type { AuditAction, AuditAppendInput } from "../domain/audit";
import type { AccessDecisionInput } from "../domain/decision";
import { createAccessDecision } from "../domain/decision";
import { SeededLcg } from "../domain/gate";
import { utcIsoFromMs } from "../domain/primitives";

const BASE_MS = 1_000_000;

function detection(id: string, firstSeenMs: number, plateConfidence: number): PlateDetectionEvent {
  return {
    id,
    cameraId: "cam-1",
    cameraStreamId: "cam-1-stream-0",
    firstSeenAtUtc: utcIsoFromMs(firstSeenMs),
    lastConfirmedAtUtc: null,
    plateRaw: "AB-1234",
    plateConfidence,
    detectionSource: "simulated",
    snapshotEvidenceRef: null,
  };
}

function auditInput(action: "OPEN_GATE_ISSUED"): AuditAppendInput {
  return {
    tsUtc: utcIsoFromMs(BASE_MS),
    actor: "admin-user",
    action,
    subjectRef: { entityType: "gate", entityId: "gate-1" },
    decisionRef: "dec-1",
    requestOrigin: "simulator",
    payloadDigest: "digest-stub",
    occurredAtDeviceSource: null,
  };
}

function decisionInput(overrides: Partial<AccessDecisionInput> = {}): AccessDecisionInput {
  return {
    decisionId: "dec-1",
    gateId: "gate-1",
    sessionId: null,
    actorType: "OPERATOR",
    subjectType: "operator",
    subjectId: "admin-user",
    dispatchedAtServerUtc: utcIsoFromMs(BASE_MS),
    outcome: "GRANTED",
    deniedReason: null,
    correlationId: "corr-1",
    auditRecordId: "audit-1",
    ...overrides,
  };
}

describe("SeededLcg determinism and bounds", () => {
  for (const seed of [42, 1337, 9001]) {
    it(`produces the same sequence for seed ${seed} across instances`, () => {
      const left = new SeededLcg(seed);
      const right = new SeededLcg(seed);
      for (let index = 0; index < 50; index += 1) {
        expect(left.next()).toBe(right.next());
      }
    });

    it(`stays within bounds for seed ${seed}`, () => {
      const lcg = new SeededLcg(seed);
      for (let index = 0; index < 200; index += 1) {
        const unit = lcg.next();
        expect(unit).toBeGreaterThanOrEqual(0);
        expect(unit).toBeLessThan(1);
        const boxed = lcg.nextInt(7);
        expect(boxed).toBeGreaterThanOrEqual(0);
        expect(boxed).toBeLessThan(7);
      }
      const source = ["a", "b", "c"] as const;
      for (let index = 0; index < 20; index += 1) {
        expect(source).toContain(lcg.pick(source));
      }
    });
  }
});

describe("Detection store append contract", () => {
  it("accepts monotonic unique appends and tracks lastAccepted", () => {
    const store = createDetectionStore();
    for (let index = 0; index < 10; index += 1) {
      const event = detection(`det-${index}`, BASE_MS + index * 1_000, 0.9);
      const appended = appendDetection(store, store.append, event);
      expect(appended.ok).toBe(true);
      expect(store.detections).toHaveLength(index + 1);
      expect(store.lastAcceptedFirstSeenAtUtc).toBe(event.firstSeenAtUtc);
    }
  });

  it("accepts equal timestamps but rejects earlier ones without mutating the store", () => {
    const store = createDetectionStore();
    const first = appendDetection(store, store.append, detection("det-a", BASE_MS, 0.9));
    expect(first.ok).toBe(true);
    const equal = appendDetection(store, store.append, detection("det-b", BASE_MS, 0.9));
    expect(equal.ok).toBe(true);
    const earlier = appendDetection(store, store.append, detection("det-c", BASE_MS - 1, 0.9));
    expect(earlier.ok).toBe(false);
    if (!earlier.ok) {
      expect(earlier.error).toEqual({
        kind: "out-of-order",
        firstSeenAtUtc: utcIsoFromMs(BASE_MS - 1),
        lastAcceptedFirstSeenAtUtc: utcIsoFromMs(BASE_MS),
      });
    }
    expect(store.detections).toHaveLength(2);
    expect(store.lastAcceptedFirstSeenAtUtc).toBe(utcIsoFromMs(BASE_MS));
  });

  it("rejects duplicate ids regardless of order", () => {
    const store = createDetectionStore();
    expect(appendDetection(store, store.append, detection("det-x", BASE_MS, 0.9)).ok).toBe(true);
    const duplicate = appendDetection(
      store,
      store.append,
      detection("det-x", BASE_MS + 5_000, 0.9),
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.kind).toBe("duplicate-detection-id");
    }
    expect(store.detections).toHaveLength(1);
  });

  it("rejects confidences outside [0, 1]", () => {
    const store = createDetectionStore();
    for (const confidence of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const rejected = appendDetection(
        store,
        store.append,
        detection(`det-${confidence}`, BASE_MS, confidence),
      );
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.error.kind).toBe("confidence-out-of-range");
      }
    }
    expect(store.detections).toHaveLength(0);
  });

  it("freezes appended records", () => {
    const store = createDetectionStore();
    const record = appendDetection(store, store.append, detection("det-f", BASE_MS, 0.9));
    expect(record.ok).toBe(true);
    if (record.ok) {
      expect(Object.isFrozen(record.value)).toBe(true);
    }
    expect(Object.isFrozen(store.detections[0]!)).toBe(true);
  });
});

describe("Audit record contract", () => {
  it("freezes appended records and assigns sequential ids", () => {
    const store = createAuditStore("t");
    const first = appendAuditRecord(store, auditInput("OPEN_GATE_ISSUED"));
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.auditId).toBe("t-0001");
      expect(first.value.correctionOf).toBeNull();
      expect(Object.isFrozen(first.value)).toBe(true);
      const mutate = first.value as { actor?: string };
      expect(() => {
        mutate.actor = "spoof";
      }).toThrow();
    }
    expect(store.records).toHaveLength(1);
  });

  it("rejects unknown actions with the action echoed", () => {
    const store = createAuditStore("t");
    const rejected = appendAuditRecord(store, {
      ...auditInput("OPEN_GATE_ISSUED"),
      action: "NOT_A_REAL_ACTION" as AuditAction,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).toEqual({ kind: "unknown-audit-action", action: "NOT_A_REAL_ACTION" });
    }
    expect(store.records).toHaveLength(0);
  });

  it("rejects missing decision references and empty subjects", () => {
    const store = createAuditStore("t");
    const noRef = appendAuditRecord(store, { ...auditInput("OPEN_GATE_ISSUED"), decisionRef: "" });
    expect(noRef.ok).toBe(false);
    const noSubject = appendAuditRecord(store, {
      ...auditInput("OPEN_GATE_ISSUED"),
      subjectRef: { entityType: "", entityId: "" },
    });
    expect(noSubject.ok).toBe(false);
    if (!noRef.ok) {
      expect(noRef.error.kind).toBe("missing-audit-reference");
    }
    if (!noSubject.ok) {
      expect(noSubject.error.kind).toBe("subject-required");
    }
    expect(store.records).toHaveLength(0);
  });

  it("links corrections to their originals and refuses unknown originals", () => {
    const store = createAuditStore("t");
    const original = appendAuditRecord(store, auditInput("OPEN_GATE_ISSUED"));
    expect(original.ok).toBe(true);
    const correction = correctAuditRecord(store, "t-0001", {
      ...auditInput("OPEN_GATE_ISSUED"),
      actor: "admin-2",
    });
    expect(correction.ok).toBe(true);
    if (correction.ok) {
      expect(correction.value.correctionOf).toBe("t-0001");
    }
    const unknown = correctAuditRecord(store, "t-9999", auditInput("OPEN_GATE_ISSUED"));
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error).toEqual({ kind: "correction-original-not-found", auditId: "t-9999" });
    }
    expect(store.records).toHaveLength(2);
  });
});

describe("Access decision contract", () => {
  it("freezes decisions and defaults evidence to pending", () => {
    const decision = createAccessDecision(decisionInput());
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(Object.isFrozen(decision.value)).toBe(true);
      expect(decision.value.deniedReason).toBeNull();
      expect(decision.value.evidence).toEqual([{ phase: "pending" }]);
      expect(Object.isFrozen(decision.value.evidence)).toBe(true);
    }
  });

  it("requires a deniedReason for DENIED outcomes", () => {
    const decision = createAccessDecision(decisionInput({ outcome: "DENIED", deniedReason: null }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.error).toEqual({ kind: "denied-reason-required" });
    }
  });

  it("forbids a deniedReason on GRANTED outcomes", () => {
    const decision = createAccessDecision(decisionInput({ deniedReason: "safety_triggered" }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.error).toEqual({ kind: "denied-reason-forbidden" });
    }
  });

  it("rejects missing audit correlations and empty subjects", () => {
    const noAudit = createAccessDecision(decisionInput({ auditRecordId: "" }));
    expect(noAudit.ok).toBe(false);
    const noCorrelation = createAccessDecision(decisionInput({ correlationId: "" }));
    expect(noCorrelation.ok).toBe(false);
    const noSubject = createAccessDecision(decisionInput({ subjectId: "" }));
    expect(noSubject.ok).toBe(false);
    if (!noAudit.ok) {
      expect(noAudit.error.kind).toBe("missing-audit-reference");
    }
    if (!noSubject.ok) {
      expect(noSubject.error.kind).toBe("subject-required");
    }
  });
});
