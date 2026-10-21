import type { AccessDecision, DecisionActorType, DecisionSubjectType } from "./decision";
import { createAccessDecision } from "./decision";
import type { DomainClock, DomainSubscription, Result, SafetyReportedState } from "./primitives";
import { djb2Digest, err, msFromUtcIso, ok, utcIsoFromMs } from "./primitives";
import type { AuditAction, AuditRecord, AuditStore } from "./audit";
import { appendAuditRecord } from "./audit";
import type { FaultLedger } from "./fault";
import { createFaultRecord } from "./fault";
import { evaluateGateTransition } from "./gate";
import type { GateActuationState, GateCommandVerb, GateTransitionError } from "./gate";
import { SAFETY_CLOCK_SKEW_TOLERANCE_MS } from "./safety-device";
import type {
  GateOperatorAdapter,
  GateOperatorAck,
  GateOperatorError,
  SafetyDeviceAdapter,
} from "../gatehead/contract";

export interface AuthorizationContext {
  verb: GateCommandVerb;
  subjectType: DecisionSubjectType;
  subjectId: string;
}

export interface AuthorizationOutcome {
  allowed: boolean;
  actorType?: DecisionActorType;
}

export interface GateCoordinatorConfig {
  gateId: string;
  stalenessThresholdMs: number;
  dispatchTimeoutMs: number;
}

export interface GateCoordinatorDeps {
  adapter: GateOperatorAdapter;
  safety: SafetyDeviceAdapter | null;
  clock: DomainClock;
  audit: AuditStore;
  decisions: AccessDecision[];
  faults: FaultLedger;
  nextId: (prefix: string) => string;
  authorize: (ctx: AuthorizationContext) => AuthorizationOutcome;
  operatorId: string;
}

export type DispatchStatus = "ACKED" | "UNREACHABLE" | "NOT_ATTEMPTED";

export type CoordinatorRefusalReason = "audit_unavailable";

export type CoordinatorOutcome =
  | { kind: "DENIED"; decision: AccessDecision }
  | { kind: "REFUSED"; reason: CoordinatorRefusalReason }
  | {
      kind: "GRANTED";
      dispatch: DispatchStatus;
      ack: GateOperatorAck | null;
      decision: AccessDecision;
    };

export interface PendingDispatch {
  readonly commandId: string;
  readonly verb: GateCommandVerb;
  readonly issuedAtMs: number;
  readonly decisionId: string;
}

export class GateCoordinator {
  private readonly adapter: GateOperatorAdapter;
  private readonly safety: SafetyDeviceAdapter | null;
  private readonly clock: DomainClock;
  private readonly audit: AuditStore;
  private readonly decisions: AccessDecision[];
  private readonly faults: FaultLedger;
  private readonly nextId: (prefix: string) => string;
  private readonly authorizeFn: (ctx: AuthorizationContext) => AuthorizationOutcome;
  private readonly operatorId: string;
  private readonly config: GateCoordinatorConfig;

  private projectedState: GateActuationState = "IDLE";
  private pending: PendingDispatch | null = null;
  private unreachableRaised = false;
  private stateSubscription: DomainSubscription | null = null;
  private safetySubscription: DomainSubscription | null = null;
  private disposed = false;

  constructor(deps: GateCoordinatorDeps, config: GateCoordinatorConfig) {
    this.adapter = deps.adapter;
    this.safety = deps.safety;
    this.clock = deps.clock;
    this.audit = deps.audit;
    this.decisions = deps.decisions;
    this.faults = deps.faults;
    this.nextId = deps.nextId;
    this.authorizeFn = deps.authorize;
    this.operatorId = deps.operatorId;
    this.config = config;
    this.stateSubscription = this.adapter.stateExpose().subscribe((status) => {
      this.projectedState = status.oxidation.gate_actuation_state;
    });
    if (this.safety !== null) {
      this.safetySubscription = this.safety.events().subscribe((edge) => {
        if (edge.kind === "SAFETY_TRIGGERED") {
          this.raiseFault({
            kind: "SAFETY_TRIGGER",
            severity: this.projectedState === "CLOSING" ? "CRITICAL" : "WARN",
            safetyDeviceId: null,
            correlationId: null,
          });
        }
      });
    }
  }

  get state(): GateActuationState {
    return this.projectedState;
  }

  get currentPending(): PendingDispatch | null {
    return this.pending;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stateSubscription?.unsubscribe();
    this.safetySubscription?.unsubscribe();
    this.stateSubscription = null;
    this.safetySubscription = null;
  }

  async heartbeat(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const now = this.clock.nowMs();
    const status = await this.adapter.status();
    this.projectedState = status.oxidation.gate_actuation_state;
    const unhealthy = status.connectivity === "DISCONNECTED" || status.health === "UNHEALTHY";
    if (unhealthy) {
      if (!this.unreachableRaised) {
        this.unreachableRaised = true;
        this.raiseFault({
          kind: "OPERATOR_UNREACHABLE",
          severity: "CRITICAL",
          safetyDeviceId: null,
          correlationId: this.pending?.commandId ?? null,
        });
      }
      this.pending = null;
    } else {
      this.unreachableRaised = false;
    }
    if (
      this.pending !== null &&
      !unhealthy &&
      now - this.pending.issuedAtMs >= this.config.dispatchTimeoutMs
    ) {
      const timedOut = this.pending;
      this.pending = null;
      this.raiseFault({
        kind: "OPERATOR_UNREACHABLE",
        severity: "CRITICAL",
        safetyDeviceId: null,
        correlationId: timedOut.commandId,
      });
    }
  }

  async request(
    verb: GateCommandVerb,
    input: {
      subjectType: DecisionSubjectType;
      subjectId: string;
      sessionId: string | null;
      actorType?: DecisionActorType;
    },
  ): Promise<CoordinatorOutcome> {
    if (this.disposed) {
      throw new Error("coordinator-disposed");
    }
    const nowMs = this.clock.nowMs();
    const auth = this.authorizeFn({
      verb,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    });
    if (!auth.allowed) {
      return this.deny(input, "authorization_denied", nowMs, auth.actorType);
    }
    const safetyResult = await this.readSafety();
    if (!safetyResult.ok) {
      return this.deny(input, safetyResult.error, nowMs, auth.actorType);
    }
    const precheck = evaluateGateTransition({
      verb,
      claimedFrom: this.projectedState,
      currentState: this.projectedState,
      safetyState: "CLEAR",
    });
    if (!precheck.ok) {
      return this.deny(input, this.mapMachineError(precheck.error), nowMs, auth.actorType);
    }
    const decisionId = this.nextId("decision");
    const correlation = this.nextId("corr");
    const auditIssued = this.appendAuditSafe("OPEN_GATE_ISSUED", decisionId, correlation);
    if (!auditIssued.ok) {
      this.raiseFault({
        kind: "AUDIT_WRITE_FAILED",
        severity: "CRITICAL",
        safetyDeviceId: null,
        correlationId: correlation,
      });
      return { kind: "REFUSED", reason: "audit_unavailable" };
    }
    const dispatchAtMs = this.clock.nowMs();
    const decision = this.createDecision(
      input,
      "GRANTED",
      null,
      dispatchAtMs,
      decisionId,
      correlation,
      auditIssued.value.auditId,
    );
    this.decisions.push(decision);
    const auditDispatch = this.appendAuditSafe("OPEN_GATE_DISPATCH", decisionId, correlation);
    if (!auditDispatch.ok) {
      this.raiseFault({
        kind: "AUDIT_WRITE_FAILED",
        severity: "CRITICAL",
        safetyDeviceId: null,
        correlationId: correlation,
      });
      return { kind: "GRANTED", dispatch: "NOT_ATTEMPTED", ack: null, decision };
    }
    const commandId = this.nextId("cmd");
    this.pending = { commandId, verb, issuedAtMs: dispatchAtMs, decisionId };
    const sample = await this.readSample(verb);
    if (!sample.ok) {
      this.raiseFault({
        kind:
          sample.error.kind === "OPERATOR_UNREACHABLE"
            ? "OPERATOR_UNREACHABLE"
            : "STATE_CLAIM_MISMATCH",
        severity: sample.error.kind === "OPERATOR_UNREACHABLE" ? "CRITICAL" : "WARN",
        safetyDeviceId: null,
        correlationId: commandId,
      });
      return { kind: "GRANTED", dispatch: "UNREACHABLE", ack: null, decision };
    }
    this.pending = null;
    return { kind: "GRANTED", dispatch: "ACKED", ack: sample.value, decision };
  }

  private async readSample(
    verb: GateCommandVerb,
  ): Promise<Result<GateOperatorAck, GateOperatorError>> {
    return this.adapter.command({ type: verb }, { readyState: this.projectedState });
  }

  private async readSafety(): Promise<
    Result<SafetyReportedState, "safety_stale" | "safety_triggered" | "safety_unknown">
  > {
    const safety = this.safety;
    if (safety === null) {
      return { ok: false, error: "safety_unknown" };
    }
    const status: Awaited<ReturnType<SafetyDeviceAdapter["status"]>> = await safety.status();
    if (
      status.connectivity !== "CONNECTED" ||
      status.health === "UNHEALTHY" ||
      status.config_validity !== "VALID"
    ) {
      return { ok: false, error: "safety_unknown" };
    }
    const reportedMs = msFromUtcIso(status.last_reported_at);
    const nowMs = this.clock.nowMs();
    if (Number.isNaN(reportedMs)) {
      return { ok: false, error: "safety_stale" };
    }
    if (reportedMs - nowMs > SAFETY_CLOCK_SKEW_TOLERANCE_MS) {
      return { ok: false, error: "safety_unknown" };
    }
    if (nowMs - reportedMs >= this.config.stalenessThresholdMs) {
      return { ok: false, error: "safety_stale" };
    }
    if (status.oxidation.reported_state !== "CLEAR") {
      if (status.oxidation.reported_state === "TRIGGERED") {
        return { ok: false, error: "safety_triggered" };
      }
      return { ok: false, error: "safety_unknown" };
    }
    return { ok: true, value: "CLEAR" };
  }

  private mapMachineError(_error: GateTransitionError): "validation_failed" {
    return "validation_failed";
  }

  private deny(
    input: {
      subjectType: DecisionSubjectType;
      subjectId: string;
      sessionId: string | null;
      actorType?: DecisionActorType;
    },
    reason:
      | "authorization_denied"
      | "safety_stale"
      | "safety_triggered"
      | "safety_unknown"
      | "validation_failed",
    nowMs: number,
    actorType?: DecisionActorType,
  ): CoordinatorOutcome {
    const decisionId = this.nextId("decision");
    const correlation = this.nextId("corr");
    const audit = this.appendAuditSafe("DECISION_RECORDED", decisionId, correlation);
    if (!audit.ok) {
      this.raiseFault({
        kind: "AUDIT_WRITE_FAILED",
        severity: "CRITICAL",
        safetyDeviceId: null,
        correlationId: null,
      });
      return { kind: "REFUSED", reason: "audit_unavailable" };
    }
    const decision = this.createDecision(
      { ...input, actorType: input.actorType ?? actorType },
      "DENIED",
      reason,
      nowMs,
      decisionId,
      correlation,
      audit.value.auditId,
    );
    this.decisions.push(decision);
    return { kind: "DENIED", decision };
  }

  private createDecision(
    input: {
      subjectType: DecisionSubjectType;
      subjectId: string;
      sessionId: string | null;
      actorType?: DecisionActorType;
    },
    outcome: "GRANTED" | "DENIED",
    deniedReason:
      | "authorization_denied"
      | "safety_stale"
      | "safety_triggered"
      | "safety_unknown"
      | "validation_failed"
      | null,
    nowMs: number,
    decisionId: string,
    correlation: string,
    auditRecordId: string,
  ): AccessDecision {
    const created = createAccessDecision({
      decisionId,
      gateId: this.config.gateId,
      sessionId: input.sessionId,
      actorType: input.actorType ?? "OPERATOR",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      dispatchedAtServerUtc: utcIsoFromMs(nowMs),
      outcome,
      deniedReason,
      correlationId: correlation,
      auditRecordId,
      evidence: [{ phase: "pending" }],
    });
    if (!created.ok) {
      throw new Error(`decision-invalid:${created.error.kind}`);
    }
    return created.value;
  }

  private appendAuditSafe(
    action: AuditAction,
    decisionId: string,
    correlation: string,
  ): Result<AuditRecord, "audit_unavailable"> {
    try {
      const result = this.appendAudit(action, decisionId, correlation);
      if (!result.ok || result.value.auditId.length === 0) {
        return err("audit_unavailable");
      }
      return ok(result.value);
    } catch {
      return err("audit_unavailable");
    }
  }

  private appendAudit(
    action: AuditAction,
    decisionId: string,
    correlation: string,
  ): ReturnType<typeof appendAuditRecord> {
    return appendAuditRecord(this.audit, {
      tsUtc: utcIsoFromMs(this.clock.nowMs()),
      actor: this.operatorId,
      action,
      subjectRef: { entityType: "gate", entityId: this.config.gateId },
      decisionRef: decisionId,
      requestOrigin: "simulator",
      payloadDigest: djb2Digest(`${action}:${decisionId}:${correlation}`),
      occurredAtDeviceSource: "simulated",
    });
  }

  private raiseFault(input: {
    kind: string;
    severity: "INFO" | "WARN" | "CRITICAL";
    safetyDeviceId: string | null;
    correlationId: string | null;
  }): void {
    this.faults.raise(
      createFaultRecord({
        faultId: this.nextId("fault"),
        gateId: this.config.gateId,
        cameraId: null,
        safetyDeviceId: input.safetyDeviceId,
        raisedAtUtc: utcIsoFromMs(this.clock.nowMs()),
        kind: input.kind,
        severity: input.severity,
        source: "simulated",
        correlationId: input.correlationId,
      }),
    );
  }
}
