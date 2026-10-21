import type { EventSource, Result } from "./primitives";
import { err, msFromUtcIso, ok, utcIsoFromMs } from "./primitives";

export type CredentialEventSource = EventSource;

export interface Hasher {
  hash(plain: string): string;
}

export interface PinMatcher {
  verify(plain: string, hash: string): boolean;
}

export interface VisitorCredentialInput {
  id: string;
  siteId: string;
  validFromUtc: string;
  validUntilUtc: string;
  maxUses: number | null;
  issuedByOperatorId: string | null;
  activeAttemptsWindowConfigRef: string | null;
  pinPlain: string;
  source: EventSource;
}

export interface VisitorCredential {
  readonly entityId: string;
  readonly entityType: "VisitorCredential";
  readonly siteId: string;
  readonly createdAtUtc: string;
  readonly validFromUtc: string;
  readonly validUntilUtc: string | null;
  readonly maxUses: number | null;
  readonly usedCount: number;
  readonly isRevoked: boolean;
  readonly revokedAtUtc: string | null;
  readonly issuedByOperatorId: string | null;
  readonly activeAttemptsWindowConfigRef: string | null;
  readonly pinHash: string;
  readonly createdSource: EventSource;
}

export type CredentialValidationError =
  | { kind: "site-id-missing" }
  | { kind: "pin-weak-or-malformed" }
  | { kind: "validity-window-empty" }
  | { kind: "uses-budget-nonpositive" };

export type CredentialStatus = "CREATED" | "ACTIVE" | "EXPIRED" | "REVOKED";

export type CredentialSpendDenial =
  | { kind: "credential-revoked" }
  | { kind: "credential-expired" }
  | { kind: "credential-before-validity-window" }
  | { kind: "credential-uses-exhausted" };

const SIX_DIGITS_OR_MORE = /^[0-9]{6,}$/;

export function validatePinStrength(pin: string): Result<string, CredentialValidationError> {
  if (!SIX_DIGITS_OR_MORE.test(pin)) {
    return err({ kind: "pin-weak-or-malformed" });
  }
  return ok(pin);
}

export function issueVisitorCredential(
  input: VisitorCredentialInput,
  hasher: Hasher,
  nowMs: number,
): Result<VisitorCredential, CredentialValidationError> {
  if (input.siteId.trim().length === 0) {
    return err({ kind: "site-id-missing" });
  }
  const pinCheck = validatePinStrength(input.pinPlain);
  if (!pinCheck.ok) {
    return pinCheck;
  }
  const from = msFromUtcIso(input.validFromUtc);
  if (Number.isNaN(from)) {
    return err({ kind: "validity-window-empty" });
  }
  const until = msFromUtcIso(input.validUntilUtc);
  if (Number.isNaN(until) || until <= from) {
    return err({ kind: "validity-window-empty" });
  }
  if (input.maxUses !== null && !(Number.isInteger(input.maxUses) && input.maxUses >= 1)) {
    return err({ kind: "uses-budget-nonpositive" });
  }
  if (until < nowMs) {
    return err({ kind: "validity-window-empty" });
  }
  const credential: VisitorCredential = Object.freeze({
    entityId: input.id,
    entityType: "VisitorCredential" as const,
    siteId: input.siteId,
    createdAtUtc: utcIsoFromMs(nowMs),
    validFromUtc: input.validFromUtc,
    validUntilUtc: input.validUntilUtc,
    maxUses: input.maxUses,
    usedCount: 0,
    isRevoked: false,
    revokedAtUtc: null,
    issuedByOperatorId: input.issuedByOperatorId,
    activeAttemptsWindowConfigRef: input.activeAttemptsWindowConfigRef,
    pinHash: hasher.hash(input.pinPlain),
    createdSource: input.source,
  });
  return ok(credential);
}

export function evaluateCredentialStatus(
  credential: VisitorCredential,
  nowMs: number,
): CredentialStatus {
  if (credential.isRevoked) {
    return "REVOKED";
  }
  if (credential.validUntilUtc !== null) {
    const until = msFromUtcIso(credential.validUntilUtc);
    if (!Number.isNaN(until) && until <= nowMs) {
      return "EXPIRED";
    }
  }
  const from = msFromUtcIso(credential.validFromUtc);
  if (!Number.isNaN(from) && from > nowMs) {
    return "CREATED";
  }
  return "ACTIVE";
}

export function evaluateCredentialSpend(
  credential: VisitorCredential,
  nowMs: number,
): Result<null, CredentialSpendDenial> {
  if (credential.isRevoked) {
    return err({ kind: "credential-revoked" });
  }
  const status = evaluateCredentialStatus(credential, nowMs);
  if (status === "EXPIRED") {
    return err({ kind: "credential-expired" });
  }
  if (status === "CREATED") {
    return err({ kind: "credential-before-validity-window" });
  }
  if (credential.maxUses !== null && credential.usedCount >= credential.maxUses) {
    return err({ kind: "credential-uses-exhausted" });
  }
  return ok(null);
}

export function spendVisitorCredentialUse(
  credential: VisitorCredential,
): Result<VisitorCredential, { kind: "no-remaining-uses" }> {
  if (credential.maxUses !== null && credential.usedCount >= credential.maxUses) {
    return err({ kind: "no-remaining-uses" });
  }
  return ok(
    Object.freeze({
      ...credential,
      usedCount: credential.usedCount + 1,
    }),
  );
}

export function revokeVisitorCredential(
  credential: VisitorCredential,
  nowMs: number,
): Result<VisitorCredential, { kind: "already-revoked" }> {
  if (credential.isRevoked) {
    return err({ kind: "already-revoked" });
  }
  return ok(
    Object.freeze({
      ...credential,
      isRevoked: true,
      revokedAtUtc: utcIsoFromMs(nowMs),
    }),
  );
}

export function verifyVisitorCredentialPin(
  credential: VisitorCredential,
  pin: string,
  matcher: PinMatcher,
): boolean {
  return matcher.verify(pin, credential.pinHash);
}

export class PlainHasherStub implements Hasher, PinMatcher {
  hash(plain: string): string {
    return `plain-stub:${plain}`;
  }

  verify(plain: string, hash: string): boolean {
    return `plain-stub:${plain}` === hash;
  }
}
