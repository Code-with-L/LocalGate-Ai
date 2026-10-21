import type { EventSource } from "./primitives";

export type FaultKind =
  "OPERATOR_UNREACHABLE" | "SAFETY_TRIGGER" | "ANPR_INFER_FAIL" | "SCHEDULE_MISS" | (string & {});

export type FaultSeverity = "INFO" | "WARN" | "CRITICAL";

export interface FaultRecord {
  readonly faultId: string;
  readonly gateId: string | null;
  readonly cameraId: string | null;
  readonly safetyDeviceId: string | null;
  readonly raisedAtUtc: string;
  readonly resolvedAtUtc: string | null;
  readonly kind: string;
  readonly severity: FaultSeverity;
  readonly source: EventSource;
  readonly correlationId: string | null;
  readonly evidenceDigest: string | null;
}

export interface FaultLedger {
  get records(): readonly FaultRecord[];
  raise(record: FaultRecord): void;
}

export type KnownFaultKind =
  "OPERATOR_UNREACHABLE" | "SAFETY_TRIGGER" | "ANPR_INFER_FAIL" | "SCHEDULE_MISS";

export const KNOWN_FAULT_KINDS: readonly KnownFaultKind[] = [
  "OPERATOR_UNREACHABLE",
  "SAFETY_TRIGGER",
  "ANPR_INFER_FAIL",
  "SCHEDULE_MISS",
];

export interface FaultCreateInput {
  faultId: string;
  gateId: string | null;
  cameraId: string | null;
  safetyDeviceId: string | null;
  raisedAtUtc: string;
  kind: string;
  severity: FaultSeverity;
  source: EventSource;
  correlationId: string | null;
  evidenceDigest?: string | null;
}

export function createFaultRecord(input: FaultCreateInput): FaultRecord {
  return Object.freeze({
    faultId: input.faultId,
    gateId: input.gateId,
    cameraId: input.cameraId,
    safetyDeviceId: input.safetyDeviceId,
    raisedAtUtc: input.raisedAtUtc,
    kind: input.kind,
    severity: input.severity,
    resolvedAtUtc: null,
    source: input.source,
    correlationId: input.correlationId,
    evidenceDigest: input.evidenceDigest ?? null,
  });
}

export function createFaultLedger(): FaultLedger {
  const recs: FaultRecord[] = [];
  return {
    get records() {
      return [...recs];
    },
    raise(record: FaultRecord): void {
      recs.push(Object.freeze(record));
    },
  };
}
