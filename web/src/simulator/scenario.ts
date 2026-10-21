import type { AccessDecision } from "../domain/decision";
import type { AuditRecord } from "../domain/audit";
import type { FaultRecord } from "../domain/fault";
import type { GateStateChange } from "../domain/gate";
import type { VisitorCredential } from "../domain/credential";
import {
  PlainHasherStub,
  evaluateCredentialSpend,
  issueVisitorCredential,
  revokeVisitorCredential,
  spendVisitorCredentialUse,
} from "../domain/credential";
import { utcIsoFromMs } from "../domain/primitives";
import type { SimKnobs, SimulatedSystem } from "./simulator";
import { createSimulatedSystem } from "./simulator";

export type ScenarioKnobName =
  | "dropAcks"
  | "disconnected"
  | "unhealthy"
  | "deviceFailed"
  | "safetyTriggered"
  | "cameraOffline"
  | "anprOffline";

export type ScenarioStep =
  | { kind: "wait"; ms: number }
  | { kind: "heartbeat" }
  | { kind: "request-open"; subjectId?: string; subjectType?: "credential" | "operator" }
  | { kind: "request-close"; subjectId?: string; subjectType?: "credential" | "operator" }
  | { kind: "set-knob"; knob: ScenarioKnobName; value: boolean }
  | { kind: "stale-safety-reports"; skewMs: number }
  | { kind: "snapshot" }
  | { kind: "anpr-connect" }
  | { kind: "anpr-ingest" }
  | { kind: "issue-credential"; pin?: string; validMs?: number; maxUses?: number | null }
  | { kind: "revoke-credential" }
  | { kind: "spend-credential" }
  | { kind: "drain-gate-motion" };

export interface ScenarioResult {
  readonly auditRecords: readonly AuditRecord[];
  readonly decisions: readonly AccessDecision[];
  readonly faults: readonly FaultRecord[];
  readonly stateChanges: readonly GateStateChange[];
  readonly snapshots: readonly string[];
  readonly credentialsIssued: readonly VisitorCredential[];
  readonly issues: readonly string[];
  readonly finalGateState: string;
}

export async function runScenario(steps: readonly ScenarioStep[]): Promise<ScenarioResult> {
  const system = createSimulatedSystem({ startNowMs: 1_000_000 });
  const hasher = new PlainHasherStub();
  const credentials: VisitorCredential[] = [];
  const issues: string[] = [];
  let lastIssued: VisitorCredential | null = null;

  const replaceCredential = (next: VisitorCredential): void => {
    credentials.pop();
    credentials.push(next);
    lastIssued = next;
  };

  const request = async (
    kind: "request-open" | "request-close",
    subjectType: "credential" | "operator",
    subjectId: string,
  ): Promise<void> => {
    const outcome =
      kind === "request-open"
        ? await system.coordinator.request("OPEN", { subjectType, subjectId, sessionId: null })
        : await system.coordinator.request("CLOSE", { subjectType, subjectId, sessionId: null });
    if (outcome.kind === "DENIED") {
      issues.push(`${kind}:denied:${outcome.decision.deniedReason}`);
    }
  };

  for (const step of steps) {
    switch (step.kind) {
      case "wait": {
        system.advanceMs(step.ms);
        break;
      }
      case "heartbeat": {
        await system.heartbeat();
        break;
      }
      case "request-open": {
        await request(
          "request-open",
          step.subjectType ?? "operator",
          step.subjectId ?? lastIssued?.entityId ?? "admin-user",
        );
        break;
      }
      case "request-close": {
        await request(
          "request-close",
          step.subjectType ?? "operator",
          step.subjectId ?? "admin-user",
        );
        break;
      }
      case "set-knob": {
        const knobs: SimKnobs = system.knobs;
        if (step.knob === "dropAcks") {
          knobs.dropAcks = step.value;
        } else if (step.knob === "disconnected") {
          knobs.disconnected = step.value;
        } else if (step.knob === "unhealthy") {
          knobs.unhealthy = step.value;
        } else if (step.knob === "deviceFailed") {
          knobs.deviceFailed = step.value;
        } else if (step.knob === "safetyTriggered") {
          system.setSafetyTriggered(step.value);
        } else if (step.knob === "cameraOffline") {
          knobs.cameraOffline = step.value;
        } else if (step.knob === "anprOffline") {
          knobs.anprOffline = step.value;
        }
        break;
      }
      case "stale-safety-reports": {
        system.knobs.reportSkewMs = step.skewMs;
        break;
      }
      case "snapshot": {
        const snapshot = await system.camera.snapshot({ trigger: "post-detection" });
        if (!snapshot.ok) {
          issues.push(`snapshot:${snapshot.error.kind}`);
        }
        break;
      }
      case "anpr-connect": {
        const connect = await system.anpr.connect("stub");
        if (!connect.ok) {
          issues.push(`anpr-connect:${connect.error.kind}`);
        }
        break;
      }
      case "anpr-ingest": {
        const ingest = await system.anpr.ingest({
          cameraStreamId: "sim-camera-stream-0",
          frameKey: utcIsoFromMs(system.clock.nowMs()),
        });
        if (!ingest.ok) {
          issues.push(`anpr-ingest:${ingest.error.kind}`);
        }
        break;
      }
      case "issue-credential": {
        const nowMs = system.clock.nowMs();
        const credInput = {
          id: system.nextId("cred"),
          siteId: "sim-site",
          validFromUtc: utcIsoFromMs(nowMs),
          validUntilUtc: utcIsoFromMs(nowMs + (step.validMs ?? 300_000)),
          maxUses: step.maxUses ?? 3,
          issuedByOperatorId: "sim-operator",
          activeAttemptsWindowConfigRef: null,
          pinPlain: step.pin ?? "246810",
          source: "simulated" as const,
        };
        const issued = issueVisitorCredential(credInput, hasher, nowMs);
        if (issued.ok) {
          credentials.push(issued.value);
          lastIssued = issued.value;
        } else {
          issues.push(`issue-credential:${issued.error.kind}`);
        }
        break;
      }
      case "revoke-credential": {
        const target = lastIssued;
        if (target === null) {
          issues.push("revoke-credential:none-issued");
          break;
        }
        const revoked = revokeVisitorCredential(target, system.clock.nowMs());
        if (revoked.ok) {
          replaceCredential(revoked.value);
        } else {
          issues.push(`revoke-credential:${revoked.error.kind}`);
        }
        break;
      }
      case "spend-credential": {
        const target = lastIssued;
        if (target === null) {
          issues.push("spend-credential:none-issued");
          break;
        }
        const eligible = evaluateCredentialSpend(target, system.clock.nowMs());
        if (!eligible.ok) {
          issues.push(`spend-credential:${eligible.error.kind}`);
          break;
        }
        const spent = spendVisitorCredentialUse(target);
        if (spent.ok) {
          replaceCredential(spent.value);
        } else {
          issues.push(`spend-credential:${spent.error.kind}`);
        }
        break;
      }
      case "drain-gate-motion": {
        await requestGateMotionDrain(system);
        break;
      }
      default: {
        issues.push("unhandled-step");
        break;
      }
    }
  }
  system.dispose();
  return {
    auditRecords: [...system.audit.records],
    decisions: [...system.decisions],
    faults: system.faults.records,
    stateChanges: [...system.stateChanges],
    snapshots: [...system.snapshots],
    credentialsIssued: [...credentials],
    issues,
    finalGateState: system.gate.state,
  };
}

async function requestGateMotionDrain(system: SimulatedSystem): Promise<void> {
  const motionMs = system.knobs.motionMs;
  system.advanceMs(motionMs + 1);
  await system.heartbeat();
}
