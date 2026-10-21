import { describe, expect, it } from "vitest";
import type { VisitorCredential } from "../domain/credential";
import {
  PlainHasherStub,
  evaluateCredentialSpend,
  evaluateCredentialStatus,
  issueVisitorCredential,
  revokeVisitorCredential,
  spendVisitorCredentialUse,
  validatePinStrength,
  verifyVisitorCredentialPin,
} from "../domain/credential";
import { utcIsoFromMs } from "../domain/primitives";

const baseMs = 1_000_000;

function makeInput(
  overrides: Partial<{
    id: string;
    siteId: string;
    validFromUtc: string;
    validUntilUtc: string;
    maxUses: number | null;
    issuedByOperatorId: string | null;
    activeAttemptsWindowConfigRef: string | null;
    pinPlain: string;
    source: "simulated" | "live" | "imported";
  }> = {},
) {
  return {
    id: "cred-1",
    siteId: "site-1",
    validFromUtc: utcIsoFromMs(baseMs),
    validUntilUtc: utcIsoFromMs(baseMs + 300_000),
    maxUses: 3,
    issuedByOperatorId: "op-1",
    activeAttemptsWindowConfigRef: null,
    pinPlain: "246810",
    source: "simulated" as const,
    ...overrides,
  };
}

describe("validatePinStrength", () => {
  it("accepts six or more numeric digits", () => {
    const okSix = validatePinStrength("246810");
    expect(okSix.ok).toBe(true);
    if (okSix.ok) {
      expect(okSix.value).toBe("246810");
    }
    const okLong = validatePinStrength("1234567890");
    expect(okLong.ok).toBe(true);
  });

  it("rejects fewer than six digits and non-digits", () => {
    const fiveDigits = validatePinStrength("12345");
    expect(fiveDigits.ok).toBe(false);
    if (!fiveDigits.ok) {
      expect(fiveDigits.error.kind).toBe("pin-weak-or-malformed");
    }
    const letters = validatePinStrength("abcdef");
    expect(letters.ok).toBe(false);
    if (!letters.ok) {
      expect(letters.error.kind).toBe("pin-weak-or-malformed");
    }
    const empty = validatePinStrength("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.kind).toBe("pin-weak-or-malformed");
    }
  });
});

describe("issueVisitorCredential", () => {
  it("issues a frozen credential with a hashed pin and zero uses", () => {
    const result = issueVisitorCredential(makeInput(), new PlainHasherStub(), baseMs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const credential: VisitorCredential = result.value;
      expect(credential.pinHash).toBe("plain-stub:246810");
      expect(credential.usedCount).toBe(0);
      expect(credential.isRevoked).toBe(false);
      expect(credential.maxUses).toBe(3);
      expect(credential.revokedAtUtc).toBeNull();
      expect(credential.issuedByOperatorId).toBe("op-1");
      expect(credential.siteId).toBe("site-1");
      expect(credential.createdAtUtc).toBe(utcIsoFromMs(baseMs));
      expect(credential.activeAttemptsWindowConfigRef).toBeNull();
      expect(Object.isFrozen(credential)).toBe(true);
    }
  });

  it("rejects a credential without a site", () => {
    const result = issueVisitorCredential(
      makeInput({ siteId: "  " }),
      new PlainHasherStub(),
      baseMs,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("site-id-missing");
    }
  });

  it("allows null maxUses for unlimited use", () => {
    const result = issueVisitorCredential(
      makeInput({ maxUses: null }),
      new PlainHasherStub(),
      baseMs,
    );
    if (result.ok) {
      expect(result.value.maxUses).toBeNull();
    }
  });

  it("rejects weak pins", () => {
    const result = issueVisitorCredential(
      makeInput({ pinPlain: "12" }),
      new PlainHasherStub(),
      baseMs,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("pin-weak-or-malformed");
    }
  });

  it("rejects an empty validity window", () => {
    const equalWindow = issueVisitorCredential(
      makeInput({ validUntilUtc: utcIsoFromMs(baseMs) }),
      new PlainHasherStub(),
      baseMs,
    );
    expect(equalWindow.ok).toBe(false);
    if (!equalWindow.ok) {
      expect(equalWindow.error.kind).toBe("validity-window-empty");
    }
    const pastWindow = issueVisitorCredential(
      makeInput({
        validFromUtc: utcIsoFromMs(baseMs + 400_000),
        validUntilUtc: utcIsoFromMs(baseMs + 100_000),
      }),
      new PlainHasherStub(),
      baseMs,
    );
    expect(pastWindow.ok).toBe(false);
    if (!pastWindow.ok) {
      expect(pastWindow.error.kind).toBe("validity-window-empty");
    }
  });

  it("rejects an already-expired window", () => {
    const result = issueVisitorCredential(
      makeInput({ validUntilUtc: utcIsoFromMs(baseMs - 1000) }),
      new PlainHasherStub(),
      baseMs,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validity-window-empty");
    }
  });

  it("rejects non-positive use budgets", () => {
    const zero = issueVisitorCredential(makeInput({ maxUses: 0 }), new PlainHasherStub(), baseMs);
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error.kind).toBe("uses-budget-nonpositive");
    }
    const negative = issueVisitorCredential(
      makeInput({ maxUses: -1 }),
      new PlainHasherStub(),
      baseMs,
    );
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.error.kind).toBe("uses-budget-nonpositive");
    }
  });
});

describe("evaluateCredentialStatus", () => {
  function activeCredential(maxUses: number | null = null): VisitorCredential {
    const result = issueVisitorCredential(makeInput({ maxUses }), new PlainHasherStub(), baseMs);
    if (!result.ok) {
      throw new Error("fixture-issue-failed");
    }
    return result.value;
  }

  it("reports CREATED before the validity window", () => {
    expect(evaluateCredentialStatus(activeCredential(), baseMs - 1)).toBe("CREATED");
  });

  it("reports ACTIVE inside the window", () => {
    expect(evaluateCredentialStatus(activeCredential(), baseMs)).toBe("ACTIVE");
    expect(evaluateCredentialStatus(activeCredential(), baseMs + 299_999)).toBe("ACTIVE");
  });

  it("reports EXPIRED at and after validUntil", () => {
    expect(evaluateCredentialStatus(activeCredential(), baseMs + 300_000)).toBe("EXPIRED");
    expect(evaluateCredentialStatus(activeCredential(), baseMs + 300_001)).toBe("EXPIRED");
  });

  it("reports REVOKED with precedence over every time-based status", () => {
    const revoked = revokeVisitorCredential(activeCredential(), baseMs + 10);
    if (!revoked.ok) {
      throw new Error("fixture-revoke-failed");
    }
    expect(evaluateCredentialStatus(revoked.value, baseMs - 1)).toBe("REVOKED");
    expect(evaluateCredentialStatus(revoked.value, baseMs + 300_000)).toBe("REVOKED");
  });
});

describe("evaluateCredentialSpend", () => {
  function spendable(maxUses: number | null): VisitorCredential {
    const result = issueVisitorCredential(makeInput({ maxUses }), new PlainHasherStub(), baseMs);
    if (!result.ok) {
      throw new Error("fixture-issue-failed");
    }
    return result.value;
  }

  it("allows an active credential with remaining uses", () => {
    expect(evaluateCredentialSpend(spendable(3), baseMs + 1).ok).toBe(true);
    expect(evaluateCredentialSpend(spendable(null), baseMs + 1).ok).toBe(true);
  });

  it("denies revoked credentials first", () => {
    const revoked = revokeVisitorCredential(spendable(3), baseMs + 5);
    if (!revoked.ok) {
      throw new Error("fixture-revoke-failed");
    }
    const denials = [
      evaluateCredentialSpend(revoked.value, baseMs - 1),
      evaluateCredentialSpend(revoked.value, baseMs + 5),
      evaluateCredentialSpend(revoked.value, baseMs + 400_000),
    ];
    for (const denial of denials) {
      expect(denial.ok).toBe(false);
      if (!denial.ok) {
        expect(denial.error.kind).toBe("credential-revoked");
      }
    }
  });

  it("denies expired and not-yet-valid credentials", () => {
    const expiredDenial = evaluateCredentialSpend(spendable(3), baseMs + 300_000);
    expect(expiredDenial.ok).toBe(false);
    if (!expiredDenial.ok) {
      expect(expiredDenial.error.kind).toBe("credential-expired");
    }
    const earlyDenial = evaluateCredentialSpend(spendable(3), baseMs - 1);
    expect(earlyDenial.ok).toBe(false);
    if (!earlyDenial.ok) {
      expect(earlyDenial.error.kind).toBe("credential-before-validity-window");
    }
  });

  it("denies credentials whose uses are exhausted", () => {
    let current = spendable(2);
    for (let index = 0; index < 2; index += 1) {
      expect(evaluateCredentialSpend(current, baseMs + 1).ok).toBe(true);
      const spent = spendVisitorCredentialUse(current);
      if (!spent.ok) {
        throw new Error("fixture-spend-failed");
      }
      current = spent.value;
    }
    const exhausted = evaluateCredentialSpend(current, baseMs + 1);
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) {
      expect(exhausted.error.kind).toBe("credential-uses-exhausted");
    }
  });
});

describe("spendVisitorCredentialUse and revokeVisitorCredential", () => {
  function issued(maxUses: number | null = 3): VisitorCredential {
    const result = issueVisitorCredential(makeInput({ maxUses }), new PlainHasherStub(), baseMs);
    if (!result.ok) {
      throw new Error("fixture-issue-failed");
    }
    return result.value;
  }

  it("increments usedCount without mutating the original", () => {
    const original = issued(3);
    const spent = spendVisitorCredentialUse(original);
    expect(spent.ok).toBe(true);
    if (spent.ok) {
      expect(spent.value.usedCount).toBe(1);
      expect(original.usedCount).toBe(0);
      expect(Object.isFrozen(spent.value)).toBe(true);
    }
  });

  it("rejects spending past the use budget", () => {
    let current = issued(1);
    const grant = spendVisitorCredentialUse(current);
    expect(grant.ok).toBe(true);
    if (grant.ok) {
      current = grant.value;
    }
    const denial = spendVisitorCredentialUse(current);
    expect(denial.ok).toBe(false);
    if (!denial.ok) {
      expect(denial.error.kind).toBe("no-remaining-uses");
    }
  });

  it("revokes once and rejects a second revoke", () => {
    const first = revokeVisitorCredential(issued(), baseMs + 10);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.isRevoked).toBe(true);
      expect(first.value.revokedAtUtc).toBe(utcIsoFromMs(baseMs + 10));
      expect(Object.isFrozen(first.value)).toBe(true);
    }
    expect(issued().isRevoked).toBe(false);
  });

  it("rejects a second revoke of the same credential", () => {
    const target = issued();
    const first = revokeVisitorCredential(target, baseMs + 10);
    if (!first.ok) {
      throw new Error("fixture-revoke-failed");
    }
    const second = revokeVisitorCredential(first.value, baseMs + 20);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.kind).toBe("already-revoked");
    }
  });
});

describe("verifyVisitorCredentialPin", () => {
  it("verifies only the matching plain pin against the stored hash", () => {
    const issuedResult = issueVisitorCredential(
      makeInput({ pinPlain: "246810" }),
      new PlainHasherStub(),
      baseMs,
    );
    if (!issuedResult.ok) {
      throw new Error("fixture-issue-failed");
    }
    const matcher = new PlainHasherStub();
    expect(verifyVisitorCredentialPin(issuedResult.value, "246810", matcher)).toBe(true);
    expect(verifyVisitorCredentialPin(issuedResult.value, "111111", matcher)).toBe(false);
  });
});
