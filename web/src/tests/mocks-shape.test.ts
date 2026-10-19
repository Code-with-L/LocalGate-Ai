import { describe, expect, it } from "vitest";
import * as mocks from "../mocks";
import type {
  SimulatedAccessDecision,
  SimulatedSiteConfig,
  SimulatedAuditRecord,
  SimulatedCameraStream,
  SimulatedDetection,
  SimulatedDeviceAdapter,
  SimulatedGateEvent,
  SimulatedGateState,
  SimulatedActivityEntry,
  SimulatedOperator,
  SimulatedTelemetryPoint,
  SimulatedVisitorCredential,
} from "../mocks";

// Simulator-view mocking stays absent per binding rule (registry header).

/**
 * Mock-wrapper-shape tests — the `Simulated<T>` provenance contract.
 * Every mock must be wrapped with source: "simulated" so no screen can
 * render invented state as live.
 */

function expectSingleWrap(value: unknown): void {
  const record = value as Record<string, unknown>;
  expect(record.source).toBe("simulated");
  expect(record.data).toBeDefined();
}

describe("Simulated<T> wrapper contract", () => {
  const singleObjectMocks: Record<string, unknown> = {
    simulatedGate: mocks.simulatedGate,
    simulatedSiteConfig: mocks.simulatedSiteConfig,
  };

  for (const [name, mock] of Object.entries(singleObjectMocks)) {
    it(`${name} is a single-object Simulated wrapper`, () => {
      expectSingleWrap(mock);
      expect(Array.isArray((mock as { data: unknown }).data)).toBe(false);
    });
  }

  const collectionMocks: Record<string, unknown> = {
    simulatedGateEvents: mocks.simulatedGateEvents,
    simulatedTelemetry: mocks.simulatedTelemetry,
    simulatedAccessDecisions: mocks.simulatedAccessDecisions,
    simulatedCredentials: mocks.simulatedCredentials,
    simulatedCameras: mocks.simulatedCameras,
    simulatedDetections: mocks.simulatedDetections,
    simulatedAudit: mocks.simulatedAudit,
    simulatedOperators: mocks.simulatedOperators,
    simulatedActivity: mocks.simulatedActivity,
    simulatedDevices: mocks.simulatedDevices,
  };

  for (const [name, mock] of Object.entries(collectionMocks)) {
    it(`${name} is a Simulated wrapper over a non-empty array`, () => {
      expectSingleWrap(mock);
      const data = (mock as { data: readonly unknown[] }).data;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });
  }

  it("simulatedGate exposes gate state with safety device freshness", () => {
    const gate = mocks.simulatedGate.data as SimulatedGateState;
    expect(gate.name).toBeTruthy();
    expect(gate.safetyDevices.length).toBeGreaterThan(0);
    for (const device of gate.safetyDevices) {
      expect(["fresh", "stale", "unknown"]).toContain(device.freshness);
      expect(["clear", "obstructed"]).toContain(device.reportState);
    }
  });

  it("simulatedSiteConfig exposes site name, timezone and retention days", () => {
    const config = mocks.simulatedSiteConfig.data as SimulatedSiteConfig;
    expect(Object.keys(config)).toEqual(
      expect.arrayContaining(["siteName", "timezone", "retentionDays"]),
    );
  });

  it("simulatedTelemetry points expose chartable series fields", () => {
    for (const point of mocks.simulatedTelemetry.data as readonly SimulatedTelemetryPoint[]) {
      expect(point.minuteUtc).toBeTruthy();
      expect(typeof point.commands).toBe("number");
    }
  });
});

describe("Mock type fidelity (view column fields)", () => {
  it("gate events expose id/atUtc/actor/summary", () => {
    for (const event of mocks.simulatedGateEvents.data as readonly SimulatedGateEvent[]) {
      expect(event.id).toBeTruthy();
      expect(event.atUtc).toBeTruthy();
      expect(event.actor).toBeTruthy();
      expect(event.summary).toBeTruthy();
    }
  });

  it("activity entries expose visitor/kind/gateOutcome", () => {
    for (const entry of mocks.simulatedActivity.data as readonly SimulatedActivityEntry[]) {
      expect(entry.id).toBeTruthy();
      expect(entry.atUtc).toBeTruthy();
      for (const field of [entry.visitor, entry.kind, entry.gateOutcome]) {
        expect(field).toBeTruthy();
      }
    }
  });

  it("operators expose displayName/role/authMethod/status", () => {
    for (const op of mocks.simulatedOperators.data as readonly SimulatedOperator[]) {
      expect(op.displayName).toBeTruthy();
      expect(["owner", "admin", "operator", "reviewer"]).toContain(op.role);
      expect(op.authMethod).toBeTruthy();
      expect(["active", "disabled"]).toContain(op.status);
    }
  });

  it("device adapters expose name/kind/state/freshness", () => {
    for (const device of mocks.simulatedDevices.data as readonly SimulatedDeviceAdapter[]) {
      expect(device.name).toBeTruthy();
      expect(["gate", "camera", "safety"]).toContain(device.kind);
      expect(["connected", "degraded", "unconfigured"]).toContain(device.state);
      expect(["fresh", "stale", "unknown"]).toContain(device.freshness);
    }
  });

  it("access decisions expose subject + allow/deny/uncertain decisions", () => {
    for (const decision of mocks.simulatedAccessDecisions
      .data as readonly SimulatedAccessDecision[]) {
      expect(decision.subject).toBeTruthy();
      expect(["allow", "deny", "uncertain"]).toContain(decision.decision);
      expect(decision.reason).toBeTruthy();
    }
  });

  it("credentials, cameras, detections and audit entries match declared shapes", () => {
    for (const credential of mocks.simulatedCredentials
      .data as readonly SimulatedVisitorCredential[]) {
      expect(credential.visitor).toBeTruthy();
      expect(["access_code", "plate"]).toContain(credential.credentialKind);
      expect(["active", "expiring-soon", "expired", "revoked"]).toContain(credential.status);
    }
    for (const camera of mocks.simulatedCameras.data as readonly SimulatedCameraStream[]) {
      expect(camera.name).toBeTruthy();
      expect(["plate", "scene"]).toContain(camera.streamKind);
      expect(["SIMULATED", "UNCONFIGURED"]).toContain(camera.mode);
    }
    for (const detection of mocks.simulatedDetections.data as readonly SimulatedDetection[]) {
      expect(detection.plateText).toBeTruthy();
      expect(detection.confidence).toBeGreaterThanOrEqual(0);
      expect(["match", "no-match", "not-tried"]).toContain(detection.matchedCredential);
    }
    for (const record of mocks.simulatedAudit.data as readonly SimulatedAuditRecord[]) {
      expect(record.actor).toBeTruthy();
      expect(record.action).toBeTruthy();
      expect(["success", "denied", "failed"]).toContain(record.result);
    }
  });
});
