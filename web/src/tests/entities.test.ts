import { describe, expect, it } from "vitest";
import { KNOWN_GATE_TYPES, createGate } from "../domain/gate";
import {
  KNOWN_GATE_SIDES,
  bindSnapshotToStream,
  createCamera,
  createCameraStreamStore,
  isStreamOpen,
} from "../domain/camera";
import type { CameraStreamOpenInput } from "../domain/camera";
import {
  PLATE_NORMALIZATION_VERSION,
  createPlateAuthorizationFromDetection,
  isPlateAuthorizationActive,
  normalizePlate,
  plateMatchesAuthorization,
  revokePlateAuthorization,
} from "../domain/plate-authorization";
import type { PlateAuthorizationInput } from "../domain/plate-authorization";
import type { PlateDetectionRecord } from "../domain/detections";
import {
  SAFETY_CLOCK_SKEW_TOLERANCE_MS,
  createSafetyDevice,
  evaluateSafetyReport,
  recordSafetyReport,
} from "../domain/safety-device";
import type { SafetyDeviceCreateInput } from "../domain/safety-device";
import {
  ALL_OPERATOR_LIFECYCLES,
  ALL_OPERATOR_ROLES,
  createOperator,
  isOperatorActive,
  reactivateOperator,
  recordOperatorLogin,
  rotateOperatorPasskey,
  suspendOperator,
} from "../domain/operator";
import { createSite, siteHasGate, siteOwnsGate } from "../domain/site";
import { utcIsoFromMs } from "../domain/primitives";
import type { DeviceStatus, OperatingMode } from "../domain/primitives";

function statusOf(mode: OperatingMode): DeviceStatus<Record<string, string>> {
  return {
    mode,
    health: "HEALTHY",
    connectivity: mode === "LIVE" ? "CONNECTED" : "UNKNOWN",
    config_validity: "VALID",
    last_reported_at: utcIsoFromMs(0),
    oxidation: {},
  };
}

function detectionOf(overrides: Partial<PlateDetectionRecord> = {}): PlateDetectionRecord {
  return {
    id: "det-1",
    cameraId: "cam-1",
    cameraStreamId: null,
    firstSeenAtUtc: utcIsoFromMs(0),
    lastConfirmedAtUtc: null,
    plateRaw: "AB-12 CD",
    plateConfidence: 0.9,
    detectionSource: "simulated",
    snapshotEvidenceRef: null,
    ...overrides,
  };
}

function authorizationInputOf(
  overrides: Partial<PlateAuthorizationInput> = {},
): PlateAuthorizationInput {
  return {
    id: "auth-1",
    siteId: "site-1",
    visitorCredentialId: null,
    createdByOperatorId: "op-1",
    createdSource: "simulated",
    createdAtUtc: utcIsoFromMs(0),
    ...overrides,
  };
}

function safetyDeviceOf(overrides: Partial<SafetyDeviceCreateInput> = {}): SafetyDeviceCreateInput {
  return {
    id: "safety-1",
    gateId: "gate-1",
    deviceType: "PHOTOCELL",
    mode: "SIMULATED",
    lastReportedAtUtc: utcIsoFromMs(1_000),
    reportedState: "CLEAR",
    stalenessThresholdRef: "safety/threshold/60s",
    source: "simulated",
    ...overrides,
  };
}

function streamInputOf(overrides: Partial<CameraStreamOpenInput> = {}): CameraStreamOpenInput {
  return {
    id: "stream-1",
    cameraId: "cam-1",
    startedAtUtc: utcIsoFromMs(0),
    source: "simulated",
    codecInfo: null,
    ...overrides,
  };
}

describe("Site", () => {
  it("creates a site and trims its name", () => {
    const result = createSite({
      id: "site-1",
      name: "  North Yard  ",
      createdAtUtc: utcIsoFromMs(0),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("North Yard");
      expect(result.value.entityType).toBe("Site");
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it("rejects a blank site name", () => {
    const result = createSite({ id: "site-1", name: "   ", createdAtUtc: utcIsoFromMs(0) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("name-empty");
    }
  });

  it("reports gate ownership and requires at least one gate", () => {
    const result = createSite({ id: "site-1", name: "Yard", createdAtUtc: utcIsoFromMs(0) });
    if (!result.ok) {
      throw new Error("site-creation-failed");
    }
    const site = result.value;
    expect(siteOwnsGate(site, "site-1")).toBe(true);
    expect(siteOwnsGate(site, "site-2")).toBe(false);
    expect(siteHasGate(site, [])).toBe(false);
    expect(siteHasGate(site, ["site-2"])).toBe(false);
    expect(siteHasGate(site, ["site-2", "site-1"])).toBe(true);
    expect(siteOwnsGate(site, site.entityId)).toBe(true);
  });
});

describe("Operator", () => {
  it("exposes canonical roles and lifecycles", () => {
    expect(ALL_OPERATOR_ROLES).toEqual(["ADMIN", "OPERATOR"]);
    expect(ALL_OPERATOR_LIFECYCLES).toEqual(["ACTIVE", "SUSPENDED"]);
  });

  it("creates an active operator", () => {
    const result = createOperator({
      id: "op-1",
      name: " Dana ",
      role: "OPERATOR",
      createdAtUtc: utcIsoFromMs(0),
      passkeyHash: "hash-1",
      rotationPolicyRef: "policy/90d",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Dana");
      expect(isOperatorActive(result.value)).toBe(true);
      expect(result.value.passkeyRotatedAtUtc).toBe(result.value.createdAtUtc);
      expect(result.value.lastLoginAtUtc).toBeNull();
    }
  });

  it("rejects incomplete operator input", () => {
    const base = {
      id: "op-1",
      name: "Dana",
      role: "OPERATOR" as const,
      createdAtUtc: utcIsoFromMs(0),
      passkeyHash: "hash-1",
      rotationPolicyRef: "policy/90d",
    };
    const blanks = [
      createOperator({ ...base, name: "  " }),
      createOperator({ ...base, passkeyHash: "" }),
      createOperator({ ...base, rotationPolicyRef: "" }),
    ];
    for (const result of blanks) {
      expect(result.ok).toBe(false);
    }
    if (!blanks[0]?.ok) {
      expect(blanks[0]?.error.kind).toBe("name-empty");
    }
    if (!blanks[1]?.ok) {
      expect(blanks[1]?.error.kind).toBe("passkey-hash-empty");
    }
    if (!blanks[2]?.ok) {
      expect(blanks[2]?.error.kind).toBe("rotation-policy-missing");
    }
  });

  it("suspends, blocks login, and reactivates", () => {
    const created = createOperator({
      id: "op-1",
      name: "Dana",
      role: "ADMIN",
      createdAtUtc: utcIsoFromMs(0),
      passkeyHash: "hash-1",
      rotationPolicyRef: "policy/90d",
    });
    if (!created.ok) {
      throw new Error("operator-creation-failed");
    }
    const suspended = suspendOperator(created.value);
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) {
      return;
    }
    expect(isOperatorActive(suspended.value)).toBe(false);
    expect(suspendOperator(suspended.value).ok).toBe(false);

    const blockedLogin = recordOperatorLogin(suspended.value, 5_000);
    expect(blockedLogin.ok).toBe(false);
    if (!blockedLogin.ok) {
      expect(blockedLogin.error.kind).toBe("operator-suspended");
    }

    const reactivated = reactivateOperator(suspended.value);
    expect(reactivated.ok).toBe(true);
    if (reactivated.ok) {
      expect(reactivateOperator(reactivated.value).ok).toBe(false);
      expect(isOperatorActive(reactivated.value)).toBe(true);
    }
  });

  it("records logins and rotates passkeys with server timestamps", () => {
    const created = createOperator({
      id: "op-1",
      name: "Dana",
      role: "ADMIN",
      createdAtUtc: utcIsoFromMs(0),
      passkeyHash: "hash-1",
      rotationPolicyRef: "policy/90d",
    });
    if (!created.ok) {
      throw new Error("operator-creation-failed");
    }
    const loggedIn = recordOperatorLogin(created.value, 12_345);
    expect(loggedIn.ok).toBe(true);
    if (loggedIn.ok) {
      expect(loggedIn.value.lastLoginAtUtc).toBe(utcIsoFromMs(12_345));
    }

    const rotated = rotateOperatorPasskey(created.value, "hash-2", 20_000);
    expect(rotated.ok).toBe(true);
    if (rotated.ok) {
      expect(rotated.value.passkeyHash).toBe("hash-2");
      expect(rotated.value.passkeyRotatedAtUtc).toBe(utcIsoFromMs(20_000));
    }

    const emptyRotation = rotateOperatorPasskey(created.value, "", 20_000);
    expect(emptyRotation.ok).toBe(false);
    if (!emptyRotation.ok) {
      expect(emptyRotation.error.kind).toBe("passkey-hash-empty");
    }
  });
});

describe("Camera", () => {
  it("exposes known gate sides", () => {
    expect(KNOWN_GATE_SIDES).toEqual(["PASSENGER", "DRIVER", "PEDESTRIAN"]);
  });

  it("creates a simulated camera without a connection profile", () => {
    const result = createCamera({
      id: "cam-1",
      siteId: "site-1",
      label: " Lane 1 ",
      gateSide: "PASSENGER",
      streamConfigRef: "cfg/lane-1",
      mode: "SIMULATED",
      connectionProfile: null,
      status: statusOf("SIMULATED"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.label).toBe("Lane 1");
      expect(result.value.entityType).toBe("Camera");
    }
  });

  it("creates a live camera with a connection profile", () => {
    const result = createCamera({
      id: "cam-1",
      siteId: "site-1",
      label: "Lane 1",
      gateSide: "DRIVER",
      streamConfigRef: "cfg/lane-1",
      mode: "LIVE",
      connectionProfile: "rtsp://camera/lane-1",
      status: statusOf("LIVE"),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects mode and profile combinations that cannot be real", () => {
    const base = {
      id: "cam-1",
      siteId: "site-1",
      label: "Lane 1",
      gateSide: "DRIVER" as const,
      streamConfigRef: "cfg/lane-1",
    };
    const liveWithoutProfile = createCamera({
      ...base,
      mode: "LIVE",
      connectionProfile: null,
      status: statusOf("LIVE"),
    });
    expect(liveWithoutProfile.ok).toBe(false);
    if (!liveWithoutProfile.ok) {
      expect(liveWithoutProfile.error.kind).toBe("live-mode-requires-connection-profile");
    }

    const simulatedWithProfile = createCamera({
      ...base,
      mode: "SIMULATED",
      connectionProfile: "rtsp://camera/lane-1",
      status: statusOf("SIMULATED"),
    });
    expect(simulatedWithProfile.ok).toBe(false);
    if (!simulatedWithProfile.ok) {
      expect(simulatedWithProfile.error.kind).toBe("connection-profile-without-live-mode");
    }
  });

  it("rejects a status snapshot whose mode disagrees with the camera", () => {
    const result = createCamera({
      id: "cam-1",
      siteId: "site-1",
      label: "Lane 1",
      gateSide: "DRIVER",
      streamConfigRef: "cfg/lane-1",
      mode: "SIMULATED",
      connectionProfile: null,
      status: statusOf("LIVE"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("status-mode-mismatch");
    }
  });

  it("rejects a blank label and a missing stream config", () => {
    const base = {
      id: "cam-1",
      siteId: "site-1",
      label: "Lane 1",
      gateSide: "DRIVER" as const,
      streamConfigRef: "cfg/lane-1",
      mode: "SIMULATED" as const,
      connectionProfile: null,
      status: statusOf("SIMULATED"),
    };
    const blankLabel = createCamera({ ...base, label: "  " });
    expect(blankLabel.ok).toBe(false);
    if (!blankLabel.ok) {
      expect(blankLabel.error.kind).toBe("label-empty");
    }
    const missingConfig = createCamera({ ...base, streamConfigRef: "" });
    expect(missingConfig.ok).toBe(false);
    if (!missingConfig.ok) {
      expect(missingConfig.error.kind).toBe("stream-config-missing");
    }
  });
});

describe("CameraStreamStore", () => {
  it("opens one stream per camera and closes it once", () => {
    const store = createCameraStreamStore();
    const opened = store.open(streamInputOf());
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    expect(isStreamOpen(opened.value)).toBe(true);
    expect(store.findOpenStream("cam-1")?.entityId).toBe("stream-1");

    const duplicate = store.open(streamInputOf());
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.kind).toBe("duplicate-stream-id");
    }

    const secondForCamera = store.open(streamInputOf({ id: "stream-2" }));
    expect(secondForCamera.ok).toBe(false);
    if (!secondForCamera.ok) {
      expect(secondForCamera.error.kind).toBe("camera-already-has-open-stream");
    }

    const closed = store.close("stream-1", utcIsoFromMs(5_000));
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.endedAtUtc).toBe(utcIsoFromMs(5_000));
    }
    expect(store.findOpenStream("cam-1")).toBeNull();

    const doubleClose = store.close("stream-1", utcIsoFromMs(6_000));
    expect(doubleClose.ok).toBe(false);
    if (!doubleClose.ok) {
      expect(doubleClose.error.kind).toBe("stream-already-closed");
    }

    const unknownClose = store.close("stream-missing", utcIsoFromMs(6_000));
    expect(unknownClose.ok).toBe(false);
    if (!unknownClose.ok) {
      expect(unknownClose.error.kind).toBe("stream-not-found");
    }
  });

  it("opens a replacement stream after a close", () => {
    const store = createCameraStreamStore();
    const first = store.open(streamInputOf());
    expect(first.ok).toBe(true);
    const closed = store.close("stream-1", utcIsoFromMs(5_000));
    expect(closed.ok).toBe(true);
    const second = store.open(streamInputOf({ id: "stream-2", startedAtUtc: utcIsoFromMs(6_000) }));
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(store.findOpenStream("cam-1")?.entityId).toBe("stream-2");
    }
  });

  it("binds a snapshot only to an open stream of the same camera", () => {
    const store = createCameraStreamStore();
    const opened = store.open(streamInputOf());
    expect(opened.ok).toBe(true);

    const bound = bindSnapshotToStream(store, "cam-1", "stream-1");
    expect(bound.ok).toBe(true);

    const mismatched = bindSnapshotToStream(store, "cam-2", "stream-1");
    expect(mismatched.ok).toBe(false);
    if (!mismatched.ok) {
      expect(mismatched.error.kind).toBe("stream-camera-mismatch");
    }

    const missing = bindSnapshotToStream(store, "cam-1", "stream-missing");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.kind).toBe("stream-not-found");
    }

    const closed = store.close("stream-1", utcIsoFromMs(5_000));
    expect(closed.ok).toBe(true);
    const afterClose = bindSnapshotToStream(store, "cam-1", "stream-1");
    expect(afterClose.ok).toBe(false);
    if (!afterClose.ok) {
      expect(afterClose.error.kind).toBe("stream-already-closed");
    }
  });

  it("exposes a defensive copy of its streams", () => {
    const store = createCameraStreamStore();
    const opened = store.open(streamInputOf());
    expect(opened.ok).toBe(true);
    const copy = store.streams;
    expect(copy.length).toBe(1);
    (copy as unknown as unknown[]).length = 0;
    expect(store.streams.length).toBe(1);
  });
});

describe("PlateAuthorization", () => {
  it("normalizes plates idempotently", () => {
    expect(normalizePlate("ab-12 cd")).toBe("AB12CD");
    expect(normalizePlate("AB12CD")).toBe("AB12CD");
    expect(normalizePlate(normalizePlate(" ab.12/cd "))).toBe("AB12CD");
    expect(normalizePlate("---")).toBe("");
  });

  it("creates an authorization from a confident detection", () => {
    const result = createPlateAuthorizationFromDetection(detectionOf(), authorizationInputOf());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plateNormalized).toBe("AB12CD");
      expect(result.value.normalizationVersion).toBe(PLATE_NORMALIZATION_VERSION);
      expect(result.value.sourceDetectionId).toBe("det-1");
      expect(result.value.revokedAtUtc).toBeNull();
      expect(isPlateAuthorizationActive(result.value)).toBe(true);
    }
  });

  it("rejects detections without a plate, below threshold, or unrecognizable", () => {
    const missingPlate = createPlateAuthorizationFromDetection(
      detectionOf({ plateRaw: null }),
      authorizationInputOf(),
    );
    expect(missingPlate.ok).toBe(false);
    if (!missingPlate.ok) {
      expect(missingPlate.error.kind).toBe("detection-plate-missing");
    }

    const lowConfidence = createPlateAuthorizationFromDetection(
      detectionOf({ plateConfidence: 0.2 }),
      authorizationInputOf(),
    );
    expect(lowConfidence.ok).toBe(false);
    if (!lowConfidence.ok) {
      expect(lowConfidence.error.kind).toBe("detection-below-confidence-threshold");
    }

    const unrecognizable = createPlateAuthorizationFromDetection(
      detectionOf({ plateRaw: "---" }),
      authorizationInputOf(),
    );
    expect(unrecognizable.ok).toBe(false);
    if (!unrecognizable.ok) {
      expect(unrecognizable.error.kind).toBe("plate-unrecognizable");
    }
  });

  it("matches only active authorizations for the same normalized plate", () => {
    const created = createPlateAuthorizationFromDetection(detectionOf(), authorizationInputOf());
    if (!created.ok) {
      throw new Error("plate-authorization-creation-failed");
    }
    expect(plateMatchesAuthorization(created.value, "AB12CD")).toBe(true);
    expect(plateMatchesAuthorization(created.value, "ZZ99ZZ")).toBe(false);

    const revoked = revokePlateAuthorization(created.value, 10_000);
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(isPlateAuthorizationActive(revoked.value)).toBe(false);
      expect(plateMatchesAuthorization(revoked.value, "AB12CD")).toBe(false);
    }
  });

  it("refuses double revocation and revocation before creation", () => {
    const created = createPlateAuthorizationFromDetection(
      detectionOf(),
      authorizationInputOf({ createdAtUtc: utcIsoFromMs(10_000) }),
    );
    if (!created.ok) {
      throw new Error("plate-authorization-creation-failed");
    }
    const early = revokePlateAuthorization(created.value, 5_000);
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.error.kind).toBe("revoked-before-created");
    }

    const revoked = revokePlateAuthorization(created.value, 20_000);
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      const again = revokePlateAuthorization(revoked.value, 30_000);
      expect(again.ok).toBe(false);
      if (!again.ok) {
        expect(again.error.kind).toBe("already-revoked");
      }
    }
  });
});

describe("SafetyDevice", () => {
  it("creates a reporting safety device", () => {
    const result = createSafetyDevice(safetyDeviceOf());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityType).toBe("SafetyDevice");
      expect(result.value.reportedState).toBe("CLEAR");
    }
  });

  it("rejects invalid safety device definitions", () => {
    const blankGate = createSafetyDevice(safetyDeviceOf({ gateId: "  " }));
    expect(blankGate.ok).toBe(false);
    if (!blankGate.ok) {
      expect(blankGate.error.kind).toBe("gate-id-missing");
    }

    const blankThreshold = createSafetyDevice(safetyDeviceOf({ stalenessThresholdRef: " " }));
    expect(blankThreshold.ok).toBe(false);
    if (!blankThreshold.ok) {
      expect(blankThreshold.error.kind).toBe("staleness-threshold-missing");
    }

    const invalidTimestamp = createSafetyDevice(
      safetyDeviceOf({ lastReportedAtUtc: "not-a-timestamp" }),
    );
    expect(invalidTimestamp.ok).toBe(false);
    if (!invalidTimestamp.ok) {
      expect(invalidTimestamp.error.kind).toBe("reported-at-invalid");
    }

    const stateWithoutTimestamp = createSafetyDevice(
      safetyDeviceOf({ reportedState: "TRIGGERED", lastReportedAtUtc: null }),
    );
    expect(stateWithoutTimestamp.ok).toBe(false);
    if (!stateWithoutTimestamp.ok) {
      expect(stateWithoutTimestamp.error.kind).toBe("state-without-timestamp");
    }

    const unconfiguredWithState = createSafetyDevice(
      safetyDeviceOf({ mode: "UNCONFIGURED", reportedState: "CLEAR" }),
    );
    expect(unconfiguredWithState.ok).toBe(false);
    if (!unconfiguredWithState.ok) {
      expect(unconfiguredWithState.error.kind).toBe("unconfigured-mode-requires-unknown-state");
    }
  });

  it("treats a missing or stale record as unsafe for dispatch", () => {
    const missing = evaluateSafetyReport(null, 1_000, 60_000);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.kind).toBe("safety-record-missing");
    }

    const created = createSafetyDevice(safetyDeviceOf({ lastReportedAtUtc: utcIsoFromMs(0) }));
    if (!created.ok) {
      throw new Error("safety-device-creation-failed");
    }
    const stale = evaluateSafetyReport(created.value, 70_000, 60_000);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.kind).toBe("safety-record-stale");
    }

    const fresh = evaluateSafetyReport(created.value, 30_000, 60_000);
    expect(fresh.ok).toBe(true);

    const invalidThreshold = evaluateSafetyReport(created.value, 30_000, -1);
    expect(invalidThreshold.ok).toBe(false);
    if (!invalidThreshold.ok) {
      expect(invalidThreshold.error.kind).toBe("safety-threshold-invalid");
    }
  });

  it("treats a future-dated record beyond clock skew as unknown", () => {
    const reportedAtMs = 100_000;
    const created = createSafetyDevice(
      safetyDeviceOf({ lastReportedAtUtc: utcIsoFromMs(reportedAtMs) }),
    );
    if (!created.ok) {
      throw new Error("safety-device-creation-failed");
    }

    const withinSkew = evaluateSafetyReport(
      created.value,
      reportedAtMs - SAFETY_CLOCK_SKEW_TOLERANCE_MS,
      60_000,
    );
    expect(withinSkew.ok).toBe(true);

    const beyondSkew = evaluateSafetyReport(
      created.value,
      reportedAtMs - SAFETY_CLOCK_SKEW_TOLERANCE_MS - 1,
      60_000,
    );
    expect(beyondSkew.ok).toBe(false);
    if (!beyondSkew.ok) {
      expect(beyondSkew.error.kind).toBe("safety-timestamp-future");
    }
  });

  it("rejects recording a future-dated report beyond clock skew", () => {
    const nowMs = 100_000;
    const created = createSafetyDevice(safetyDeviceOf({ lastReportedAtUtc: utcIsoFromMs(nowMs) }));
    if (!created.ok) {
      throw new Error("safety-device-creation-failed");
    }

    const recorded = recordSafetyReport(
      created.value,
      {
        state: "TRIGGERED",
        reportedAtUtc: utcIsoFromMs(nowMs + SAFETY_CLOCK_SKEW_TOLERANCE_MS + 1),
        source: "live",
      },
      nowMs,
      60_000,
    );
    expect(recorded.ok).toBe(false);
    if (!recorded.ok) {
      expect(recorded.error.kind).toBe("safety-timestamp-future");
    }
    expect(created.value.reportedState).toBe("CLEAR");
  });

  it("records state changes and suppresses unchanged reports", () => {
    const created = createSafetyDevice(safetyDeviceOf({ lastReportedAtUtc: utcIsoFromMs(1_000) }));
    if (!created.ok) {
      throw new Error("safety-device-creation-failed");
    }

    const triggered = recordSafetyReport(
      created.value,
      { state: "TRIGGERED", reportedAtUtc: utcIsoFromMs(2_000), source: "live" },
      2_000,
      60_000,
    );
    expect(triggered.ok).toBe(true);
    if (triggered.ok) {
      expect(triggered.value.device.reportedState).toBe("TRIGGERED");
      expect(triggered.value.device.source).toBe("live");
      expect(triggered.value.change?.from).toBe("CLEAR");
      expect(triggered.value.change?.to).toBe("TRIGGERED");
    }

    const repeated = recordSafetyReport(
      created.value,
      { state: "CLEAR", reportedAtUtc: utcIsoFromMs(2_000), source: "simulated" },
      2_000,
      60_000,
    );
    expect(repeated.ok).toBe(true);
    if (repeated.ok) {
      expect(repeated.value.change).toBeNull();
    }
  });

  it("rejects unconfigured mode and timestamp regression", () => {
    const unconfigured = createSafetyDevice(
      safetyDeviceOf({
        mode: "UNCONFIGURED",
        reportedState: "UNKNOWN",
        lastReportedAtUtc: utcIsoFromMs(1_000),
      }),
    );
    expect(unconfigured.ok).toBe(true);
    if (unconfigured.ok) {
      const rejected = recordSafetyReport(
        unconfigured.value,
        { state: "CLEAR", reportedAtUtc: utcIsoFromMs(2_000), source: "simulated" },
        2_000,
        60_000,
      );
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.error.kind).toBe("safety-mode-unconfigured");
      }
    }

    const created = createSafetyDevice(safetyDeviceOf({ lastReportedAtUtc: utcIsoFromMs(5_000) }));
    if (!created.ok) {
      throw new Error("safety-device-creation-failed");
    }
    const regression = recordSafetyReport(
      created.value,
      { state: "TRIGGERED", reportedAtUtc: utcIsoFromMs(4_000), source: "simulated" },
      6_000,
      60_000,
    );
    expect(regression.ok).toBe(false);
    if (!regression.ok) {
      expect(regression.error.kind).toBe("safety-timestamp-regression");
    }
  });
});

describe("Gate entity", () => {
  it("exposes known gate types", () => {
    expect(KNOWN_GATE_TYPES).toEqual(["sliding"]);
  });

  it("creates a commissioned gate with frozen rated specs", () => {
    const result = createGate({
      id: "gate-1",
      siteId: "site-1",
      name: "  Main Gate ",
      type: "sliding",
      commissioningState: "SIMULATED",
      ratedSpecs: { width_m: "6" },
      createdAtUtc: utcIsoFromMs(0),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Main Gate");
      expect(result.value.entityType).toBe("Gate");
      expect(result.value.commissioningState).toBe("SIMULATED");
      expect(result.value.ratedSpecs.width_m).toBe("6");
      expect(Object.isFrozen(result.value.ratedSpecs)).toBe(true);
      expect(result.value.updatedAtUtc).toBe(result.value.createdAtUtc);
    }
  });

  it("defaults rated specs to an empty frozen record", () => {
    const result = createGate({
      id: "gate-1",
      siteId: "site-1",
      name: "Main Gate",
      type: "sliding",
      commissioningState: "UNCONFIGURED",
      createdAtUtc: utcIsoFromMs(0),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ratedSpecs).toEqual({});
      expect(Object.isFrozen(result.value.ratedSpecs)).toBe(true);
    }
  });

  it("rejects a blank name and a missing site", () => {
    const base = {
      id: "gate-1",
      siteId: "site-1",
      name: "Main Gate",
      type: "sliding" as const,
      commissioningState: "SIMULATED" as const,
      createdAtUtc: utcIsoFromMs(0),
    };
    const blankName = createGate({ ...base, name: "   " });
    expect(blankName.ok).toBe(false);
    if (!blankName.ok) {
      expect(blankName.error.kind).toBe("name-empty");
    }
    const missingSite = createGate({ ...base, siteId: "" });
    expect(missingSite.ok).toBe(false);
    if (!missingSite.ok) {
      expect(missingSite.error.kind).toBe("site-id-missing");
    }
  });

  it("accepts extension gate types", () => {
    const result = createGate({
      id: "gate-1",
      siteId: "site-1",
      name: "Boom Gate",
      type: "boom",
      commissioningState: "SIMULATED",
      createdAtUtc: utcIsoFromMs(0),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("boom");
    }
  });
});
