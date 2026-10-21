import type { EventSource, OperatingMode, Result, SafetyReportedState } from "./primitives";
import { err, msFromUtcIso, ok } from "./primitives";

export type SafetyDeviceType = "PHOTOCELL" | "SAFETY_EDGE" | (string & {});

export const KNOWN_SAFETY_DEVICE_TYPES: readonly SafetyDeviceType[] = ["PHOTOCELL", "SAFETY_EDGE"];

export const SAFETY_CLOCK_SKEW_TOLERANCE_MS = 3000;

export interface SafetyDevice {
  readonly entityId: string;
  readonly entityType: "SafetyDevice";
  readonly gateId: string;
  readonly deviceType: SafetyDeviceType;
  readonly mode: OperatingMode;
  readonly lastReportedAtUtc: string | null;
  readonly reportedState: SafetyReportedState;
  readonly stalenessThresholdRef: string;
  readonly source: EventSource;
}

export interface SafetyDeviceCreateInput {
  id: string;
  gateId: string;
  deviceType: SafetyDeviceType;
  mode: OperatingMode;
  lastReportedAtUtc: string | null;
  reportedState: SafetyReportedState;
  stalenessThresholdRef: string;
  source: EventSource;
}

export type SafetyDeviceValidationError =
  | { kind: "gate-id-missing" }
  | { kind: "staleness-threshold-missing" }
  | { kind: "reported-at-invalid"; lastReportedAtUtc: string }
  | { kind: "state-without-timestamp"; reportedState: SafetyReportedState }
  | { kind: "unconfigured-mode-requires-unknown-state"; reportedState: SafetyReportedState };

export function createSafetyDevice(
  input: SafetyDeviceCreateInput,
): Result<SafetyDevice, SafetyDeviceValidationError> {
  if (input.gateId.trim().length === 0) {
    return err({ kind: "gate-id-missing" });
  }
  if (input.stalenessThresholdRef.trim().length === 0) {
    return err({ kind: "staleness-threshold-missing" });
  }
  if (input.lastReportedAtUtc !== null && Number.isNaN(msFromUtcIso(input.lastReportedAtUtc))) {
    return err({ kind: "reported-at-invalid", lastReportedAtUtc: input.lastReportedAtUtc });
  }
  if (input.reportedState !== "UNKNOWN" && input.lastReportedAtUtc === null) {
    return err({ kind: "state-without-timestamp", reportedState: input.reportedState });
  }
  if (input.mode === "UNCONFIGURED" && input.reportedState !== "UNKNOWN") {
    return err({
      kind: "unconfigured-mode-requires-unknown-state",
      reportedState: input.reportedState,
    });
  }
  const device: SafetyDevice = Object.freeze({
    entityId: input.id,
    entityType: "SafetyDevice" as const,
    gateId: input.gateId,
    deviceType: input.deviceType,
    mode: input.mode,
    lastReportedAtUtc: input.lastReportedAtUtc,
    reportedState: input.reportedState,
    stalenessThresholdRef: input.stalenessThresholdRef,
    source: input.source,
  });
  return ok(device);
}

export interface SafetyDeviceStateChange {
  readonly type: "SafetyDeviceStateChange";
  readonly safetyDeviceId: string;
  readonly gateId: string;
  readonly from: SafetyReportedState;
  readonly to: SafetyReportedState;
  readonly source: EventSource;
  readonly occurredAtUtc: string;
}

export function makeSafetyDeviceStateChange(input: {
  safetyDeviceId: string;
  gateId: string;
  from: SafetyReportedState;
  to: SafetyReportedState;
  source: EventSource;
  occurredAtUtc: string;
}): SafetyDeviceStateChange {
  return Object.freeze({
    type: "SafetyDeviceStateChange" as const,
    safetyDeviceId: input.safetyDeviceId,
    gateId: input.gateId,
    from: input.from,
    to: input.to,
    source: input.source,
    occurredAtUtc: input.occurredAtUtc,
  });
}

export type SafetyReportError =
  | { kind: "safety-record-missing"; deviceId: string }
  | { kind: "safety-record-stale"; lastReportedAtUtc: string | null; thresholdMs: number }
  | { kind: "safety-threshold-invalid"; thresholdMs: number }
  | { kind: "safety-timestamp-invalid"; reportedAtUtc: string }
  | { kind: "safety-timestamp-future"; reportedAtUtc: string; skewToleranceMs: number }
  | { kind: "safety-timestamp-regression"; reportedAtUtc: string; lastReportedAtUtc: string }
  | { kind: "safety-mode-unconfigured"; deviceId: string };

export function evaluateSafetyReport(
  device: SafetyDevice | null,
  nowMs: number,
  thresholdMs: number,
): Result<SafetyDevice, SafetyReportError> {
  if (device === null) {
    return err({ kind: "safety-record-missing", deviceId: "" });
  }
  if (!Number.isFinite(thresholdMs) || thresholdMs < 0) {
    return err({ kind: "safety-threshold-invalid", thresholdMs });
  }
  const last = device.lastReportedAtUtc;
  if (last === null) {
    return err({ kind: "safety-record-stale", lastReportedAtUtc: null, thresholdMs });
  }
  const lastMs = msFromUtcIso(last);
  if (Number.isNaN(lastMs)) {
    return err({ kind: "safety-timestamp-invalid", reportedAtUtc: last });
  }
  if (lastMs - nowMs > SAFETY_CLOCK_SKEW_TOLERANCE_MS) {
    return err({
      kind: "safety-timestamp-future",
      reportedAtUtc: last,
      skewToleranceMs: SAFETY_CLOCK_SKEW_TOLERANCE_MS,
    });
  }
  if (nowMs - lastMs > thresholdMs) {
    return err({ kind: "safety-record-stale", lastReportedAtUtc: last, thresholdMs });
  }
  return ok(device);
}

export interface SafetyReportInput {
  state: SafetyReportedState;
  reportedAtUtc: string;
  source: EventSource;
}

export interface SafetyReportResult {
  readonly device: SafetyDevice;
  readonly change: SafetyDeviceStateChange | null;
}

export function recordSafetyReport(
  device: SafetyDevice | null,
  input: SafetyReportInput,
  nowMs: number,
  thresholdMs: number,
): Result<SafetyReportResult, SafetyReportError> {
  const evaluated = evaluateSafetyReport(device, nowMs, thresholdMs);
  if (!evaluated.ok) {
    return evaluated;
  }
  const current = evaluated.value;
  if (current.mode === "UNCONFIGURED") {
    return err({ kind: "safety-mode-unconfigured", deviceId: current.entityId });
  }
  const reportedMs = msFromUtcIso(input.reportedAtUtc);
  if (Number.isNaN(reportedMs)) {
    return err({ kind: "safety-timestamp-invalid", reportedAtUtc: input.reportedAtUtc });
  }
  if (reportedMs - nowMs > SAFETY_CLOCK_SKEW_TOLERANCE_MS) {
    return err({
      kind: "safety-timestamp-future",
      reportedAtUtc: input.reportedAtUtc,
      skewToleranceMs: SAFETY_CLOCK_SKEW_TOLERANCE_MS,
    });
  }
  const last = current.lastReportedAtUtc;
  if (last !== null && reportedMs < msFromUtcIso(last)) {
    return err({
      kind: "safety-timestamp-regression",
      reportedAtUtc: input.reportedAtUtc,
      lastReportedAtUtc: last,
    });
  }
  const next: SafetyDevice = Object.freeze({
    ...current,
    mode: current.mode,
    lastReportedAtUtc: input.reportedAtUtc,
    reportedState: input.state,
    source: input.source,
  });
  if (current.reportedState === input.state) {
    return ok({ device: next, change: null });
  }
  return ok({
    device: next,
    change: makeSafetyDeviceStateChange({
      safetyDeviceId: current.entityId,
      gateId: current.gateId,
      from: current.reportedState,
      to: input.state,
      source: input.source,
      occurredAtUtc: input.reportedAtUtc,
    }),
  });
}
