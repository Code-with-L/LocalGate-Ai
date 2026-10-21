import type { Result } from "./primitives";
import { err, ok, utcIsoFromMs } from "./primitives";

export type OperatorRole = "ADMIN" | "OPERATOR";

export const ALL_OPERATOR_ROLES: readonly OperatorRole[] = ["ADMIN", "OPERATOR"];

export type OperatorLifecycle = "ACTIVE" | "SUSPENDED";

export const ALL_OPERATOR_LIFECYCLES: readonly OperatorLifecycle[] = ["ACTIVE", "SUSPENDED"];

export interface Operator {
  readonly entityId: string;
  readonly entityType: "Operator";
  readonly name: string;
  readonly role: OperatorRole;
  readonly createdAtUtc: string;
  readonly lastLoginAtUtc: string | null;
  readonly passkeyHash: string;
  readonly passkeyRotatedAtUtc: string;
  readonly rotationPolicyRef: string;
  readonly lifecycle: OperatorLifecycle;
}

export interface OperatorCreateInput {
  id: string;
  name: string;
  role: OperatorRole;
  createdAtUtc: string;
  passkeyHash: string;
  rotationPolicyRef: string;
}

export type OperatorValidationError =
  { kind: "name-empty" } | { kind: "passkey-hash-empty" } | { kind: "rotation-policy-missing" };

export type OperatorTransitionError =
  | { kind: "already-suspended" }
  | { kind: "already-active" }
  | { kind: "operator-suspended" }
  | { kind: "passkey-hash-empty" };

export function createOperator(
  input: OperatorCreateInput,
): Result<Operator, OperatorValidationError> {
  const name = input.name.trim();
  if (name.length === 0) {
    return err({ kind: "name-empty" });
  }
  if (input.passkeyHash.length === 0) {
    return err({ kind: "passkey-hash-empty" });
  }
  if (input.rotationPolicyRef.length === 0) {
    return err({ kind: "rotation-policy-missing" });
  }
  const operator: Operator = Object.freeze({
    entityId: input.id,
    entityType: "Operator" as const,
    name,
    role: input.role,
    createdAtUtc: input.createdAtUtc,
    lastLoginAtUtc: null,
    passkeyHash: input.passkeyHash,
    passkeyRotatedAtUtc: input.createdAtUtc,
    rotationPolicyRef: input.rotationPolicyRef,
    lifecycle: "ACTIVE" as const,
  });
  return ok(operator);
}

export function isOperatorActive(operator: Operator): boolean {
  return operator.lifecycle === "ACTIVE";
}

export function suspendOperator(operator: Operator): Result<Operator, OperatorTransitionError> {
  if (!isOperatorActive(operator)) {
    return err({ kind: "already-suspended" });
  }
  return ok(Object.freeze({ ...operator, lifecycle: "SUSPENDED" as const }));
}

export function reactivateOperator(operator: Operator): Result<Operator, OperatorTransitionError> {
  if (isOperatorActive(operator)) {
    return err({ kind: "already-active" });
  }
  return ok(Object.freeze({ ...operator, lifecycle: "ACTIVE" as const }));
}

export function recordOperatorLogin(
  operator: Operator,
  nowMs: number,
): Result<Operator, OperatorTransitionError> {
  if (!isOperatorActive(operator)) {
    return err({ kind: "operator-suspended" });
  }
  return ok(Object.freeze({ ...operator, lastLoginAtUtc: utcIsoFromMs(nowMs) }));
}

export function rotateOperatorPasskey(
  operator: Operator,
  passkeyHash: string,
  nowMs: number,
): Result<Operator, OperatorTransitionError> {
  if (passkeyHash.length === 0) {
    return err({ kind: "passkey-hash-empty" });
  }
  return ok(
    Object.freeze({
      ...operator,
      passkeyHash,
      passkeyRotatedAtUtc: utcIsoFromMs(nowMs),
    }),
  );
}
