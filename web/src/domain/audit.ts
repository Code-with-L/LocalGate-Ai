import type { Result } from "./primitives";
import { err, ok } from "./primitives";

export type AuditAction =
  | "LOGIN_ATTEMPT"
  | "OPEN_GATE_ISSUED"
  | "OPEN_GATE_DISPATCH"
  | "SNAPSHOT_SAVED"
  | "CREDENTIAL_CREATED"
  | "DECISION_RECORDED"
  | "SESSION_OPENED"
  | "SESSION_CLOSED"
  | "FAULT_RAISED"
  | "GATE_STATE_CHANGED"
  | "IMPORT_APPLIED";

export const KNOWN_AUDIT_ACTIONS: readonly AuditAction[] = [
  "LOGIN_ATTEMPT",
  "OPEN_GATE_ISSUED",
  "OPEN_GATE_DISPATCH",
  "SNAPSHOT_SAVED",
  "CREDENTIAL_CREATED",
  "DECISION_RECORDED",
  "SESSION_OPENED",
  "SESSION_CLOSED",
  "FAULT_RAISED",
  "GATE_STATE_CHANGED",
  "IMPORT_APPLIED",
];

export type AuditRequestOrigin = "dashboard_ui" | "rest_api" | "simulator";

export interface AuditAppendInput {
  readonly tsUtc: string;
  readonly actor: string;
  readonly action: AuditAction;
  readonly subjectRef: { readonly entityType: string; readonly entityId: string };
  readonly decisionRef: string | null;
  readonly requestOrigin: AuditRequestOrigin;
  readonly payloadDigest: string;
  readonly occurredAtDeviceSource: string | null;
}

export interface AuditRecord extends AuditAppendInput {
  readonly auditId: string;
  readonly correctionOf: string | null;
}

export type AuditError =
  | { kind: "unknown-audit-action"; action: string }
  | { kind: "missing-audit-reference" }
  | { kind: "subject-required" }
  | { kind: "correction-original-not-found"; auditId: string };

export interface AuditStore {
  readonly records: readonly AuditRecord[];
  nextAuditId(): string;
  pushRecord(record: AuditRecord): void;
}

export function createAuditStore(idPrefix: string): AuditStore {
  const recs: AuditRecord[] = [];
  let counter = 0;
  return {
    get records() {
      return [...recs];
    },
    nextAuditId() {
      counter += 1;
      return `${idPrefix}-${String(counter).padStart(4, "0")}`;
    },
    pushRecord(record: AuditRecord): void {
      recs.push(record);
    },
  };
}

function validateAppendInput(input: AuditAppendInput): Result<null, AuditError> {
  if (!(KNOWN_AUDIT_ACTIONS as readonly string[]).includes(input.action)) {
    return err({ kind: "unknown-audit-action", action: input.action });
  }
  if (input.decisionRef === "") {
    return err({ kind: "missing-audit-reference" });
  }
  if (input.subjectRef.entityType === "" || input.subjectRef.entityId === "") {
    return err({ kind: "subject-required" });
  }
  return ok(null);
}

export function appendAuditRecord(
  store: AuditStore,
  input: AuditAppendInput,
): Result<AuditRecord, AuditError> {
  const validation = validateAppendInput(input);
  if (!validation.ok) {
    return validation;
  }
  const record: AuditRecord = Object.freeze({
    ...input,
    auditId: store.nextAuditId(),
    correctionOf: null,
  });
  store.pushRecord(record);
  return ok(record);
}

export function correctAuditRecord(
  store: AuditStore,
  originalAuditId: string,
  replacement: AuditAppendInput,
): Result<AuditRecord, AuditError> {
  const validation = validateAppendInput(replacement);
  if (!validation.ok) {
    return validation;
  }
  const original = store.records.find((record) => record.auditId === originalAuditId);
  if (original === undefined) {
    return err({ kind: "correction-original-not-found", auditId: originalAuditId });
  }
  const correction: AuditRecord = Object.freeze({
    ...replacement,
    auditId: store.nextAuditId(),
    correctionOf: originalAuditId,
  });
  store.pushRecord(correction);
  return ok(correction);
}
