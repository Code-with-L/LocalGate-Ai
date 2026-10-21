import type { Result } from "./primitives";
import { err, ok } from "./primitives";

export type DecisionOutcome = "GRANTED" | "DENIED";

export type DecisionActorType = "DISPLAYUSER" | "ANPR_GUEST" | "VISITOR_PIN" | "OPERATOR";

export type DecisionSubjectType = "credential" | "operator" | "anpr";

export type DecisionDeniedReason =
  | "authorization_denied"
  | "credential_invalid"
  | "safety_stale"
  | "safety_triggered"
  | "safety_unknown"
  | "validation_failed";

export type SnapshotEvidence =
  | { readonly phase: "pending" }
  | { readonly phase: "available"; readonly ref: string }
  | { readonly phase: "unavailable" };

export interface AccessDecision {
  readonly decisionId: string;
  readonly gateId: string;
  readonly sessionId: string | null;
  readonly actorType: DecisionActorType;
  readonly subjectType: DecisionSubjectType;
  readonly subjectId: string;
  readonly dispatchedAtServerUtc: string;
  readonly outcome: DecisionOutcome;
  readonly deniedReason: DecisionDeniedReason | null;
  readonly correlationId: string;
  readonly auditRecordId: string;
  readonly evidence: readonly SnapshotEvidence[];
}

export type DecisionValidationError =
  | { kind: "denied-reason-required" }
  | { kind: "denied-reason-forbidden" }
  | { kind: "missing-audit-reference" }
  | { kind: "subject-required" };

export interface AccessDecisionInput {
  readonly decisionId: string;
  readonly gateId: string;
  readonly sessionId: string | null;
  readonly actorType: DecisionActorType;
  readonly subjectType: DecisionSubjectType;
  readonly subjectId: string;
  readonly dispatchedAtServerUtc: string;
  readonly outcome: DecisionOutcome;
  readonly deniedReason: DecisionDeniedReason | null;
  readonly correlationId: string;
  readonly auditRecordId: string;
  readonly evidence?: readonly SnapshotEvidence[];
}

export function createAccessDecision(
  input: AccessDecisionInput,
): Result<AccessDecision, DecisionValidationError> {
  if (input.subjectId === "" || input.gateId === "") {
    return err({ kind: "subject-required" });
  }
  if (input.auditRecordId === "" || input.correlationId === "") {
    return err({ kind: "missing-audit-reference" });
  }
  if (input.outcome === "DENIED" && input.deniedReason === null) {
    return err({ kind: "denied-reason-required" });
  }
  if (input.outcome === "GRANTED" && input.deniedReason !== null) {
    return err({ kind: "denied-reason-forbidden" });
  }
  const decision: AccessDecision = Object.freeze({
    decisionId: input.decisionId,
    gateId: input.gateId,
    sessionId: input.sessionId,
    actorType: input.actorType,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    dispatchedAtServerUtc: input.dispatchedAtServerUtc,
    outcome: input.outcome,
    deniedReason: input.outcome === "DENIED" ? input.deniedReason : null,
    correlationId: input.correlationId,
    auditRecordId: input.auditRecordId,
    evidence: Object.freeze(input.evidence ?? [{ phase: "pending" as const }]),
  });
  return ok(decision);
}
