import type {
  DeviceStatus,
  DomainObservable,
  DomainSubscription,
  Result,
} from "../domain/primitives";
import { createDomainObservable, err, ok, utcIsoFromMs } from "../domain/primitives";
import { AdjustableSimClock } from "../domain/clock";
import type { AccessDecision } from "../domain/decision";
import type { AuditStore } from "../domain/audit";
import { createAuditStore } from "../domain/audit";
import type { FaultLedger } from "../domain/fault";
import { createFaultLedger } from "../domain/fault";
import type {
  GateStateChange,
  GateCommandVerb,
  GateTransitionError,
  GateActuationState,
} from "../domain/gate";
import {
  evaluateGateTransition,
  evaluateMotionCompletion,
  evaluateSafetyStopWhileClosing,
  makeGateStateChange,
} from "../domain/gate";
import { GateCoordinator } from "../domain/coordinator";
import type {
  GateCommand,
  GateCommandOpts,
  GateOperatorAck,
  GateOperatorAdapter,
  GateOperatorCapabilityReport,
  GateOperatorError,
  AnprConnectError,
  AnprError,
  AnprProvider,
  AnprSession,
  CameraAdapter,
  CameraStatus,
  CameraStreamId,
  FrameRef,
  OperatorStatus,
  PlateCandidate,
  SafetyDeviceAdapter,
  SafetyDeviceKind,
  SafetyEdgeEvent,
  SafetyDeviceStatus,
  SnapshotError,
  SnapshotOutput,
  SnapshotRef,
  CameraSnapshotOpts,
} from "../gatehead/contract";
import { ANPR_INGEST_LIMIT } from "../gatehead/contract";

export interface SimKnobs {
  dropAcks: boolean;
  disconnected: boolean;
  unhealthy: boolean;
  deviceFailed: boolean;
  reportSkewMs: number;
  safetyTriggered: boolean;
  cameraOffline: boolean;
  anprOffline: boolean;
  motionMs: number;
}

export function createSimKnobs(): SimKnobs {
  return {
    dropAcks: false,
    disconnected: false,
    unhealthy: false,
    deviceFailed: false,
    reportSkewMs: 0,
    safetyTriggered: false,
    cameraOffline: false,
    anprOffline: false,
    motionMs: 5000,
  };
}

interface PendingSimCommand {
  readonly commandId: string;
  readonly verb: GateCommandVerb;
  readonly issuedAtMs: number;
  readonly resolve: (result: Result<GateOperatorAck, GateOperatorError>) => void;
}

function operatorPosition(state: GateActuationState): "OPEN" | "CLOSED" | "IN_MOTION" {
  if (state === "OPEN_AWAIT_CLOSE") {
    return "OPEN";
  }
  if (state === "IDLE") {
    return "CLOSED";
  }
  return "IN_MOTION";
}

export class SimulatedGateOperator implements GateOperatorAdapter {
  readonly kind = "GateOperator" as const;
  readonly adapter_contract_version = "GATEHEAD/v1" as const;
  readonly gateId: string;
  readonly capabilities: GateOperatorCapabilityReport = {
    open: true,
    close: true,
    halt: true,
    position_report: "COARSE",
  };

  private readonly clock: AdjustableSimClock;
  private readonly knobs: SimKnobs;
  private readonly nextId: (prefix: string) => string;
  private readonly safetyProvider: () => {
    reported: "CLEAR" | "TRIGGERED" | "UNCLEAR" | "UNKNOWN";
  };
  private readonly dispatchTimeoutMs: number;
  private readonly stateChangesSink: GateStateChange[];

  private machineState: GateActuationState = "IDLE";
  private motion: { verb: GateCommandVerb | "RESUME"; deadlineMs: number } | null = null;
  private readonly pendingSimCommands: PendingSimCommand[] = [];
  private readonly statusSubject = createDomainObservable<OperatorStatus>();

  constructor(input: {
    gateId: string;
    clock: AdjustableSimClock;
    knobs: SimKnobs;
    nextId: (prefix: string) => string;
    safetyProvider: () => { reported: "CLEAR" | "TRIGGERED" | "UNCLEAR" | "UNKNOWN" };
    dispatchTimeoutMs: number;
    stateChangesSink: GateStateChange[];
  }) {
    this.gateId = input.gateId;
    this.clock = input.clock;
    this.knobs = input.knobs;
    this.nextId = input.nextId;
    this.safetyProvider = input.safetyProvider;
    this.dispatchTimeoutMs = input.dispatchTimeoutMs;
    this.stateChangesSink = input.stateChangesSink;
  }

  get state(): GateActuationState {
    return this.machineState;
  }

  status(): Promise<OperatorStatus> {
    return Promise.resolve(this.buildStatus());
  }

  stateExpose(): DomainObservable<OperatorStatus> {
    return this.statusSubject.observable;
  }

  async command(
    cmd: GateCommand,
    opts?: GateCommandOpts,
  ): Promise<Result<GateOperatorAck, GateOperatorError>> {
    const now = this.clock.nowMs();
    if (this.knobs.dropAcks) {
      const commandId = this.nextId("cmd");
      return new Promise<Result<GateOperatorAck, GateOperatorError>>((resolve) => {
        this.pendingSimCommands.push({
          commandId,
          verb: cmd.type,
          issuedAtMs: now,
          resolve,
        });
      });
    }
    if (this.knobs.disconnected || this.knobs.unhealthy) {
      return err({ kind: "OPERATOR_UNREACHABLE" });
    }
    return this.execute(cmd.type, opts);
  }

  private async execute(
    verb: GateCommandVerb,
    opts?: GateCommandOpts,
  ): Promise<Result<GateOperatorAck, GateOperatorError>> {
    const now = this.clock.nowMs();
    const readyState = opts?.readyState ?? "IDLE";
    if (this.machineState === "FAULT_UNKNOWN") {
      if (verb !== "OPEN" && verb !== "RESUME") {
        return err({ kind: "OPERATOR_UNREACHABLE" });
      }
      const safety = this.safetyProvider().reported;
      if (safety !== "CLEAR") {
        return err({ kind: "STATE_CLAIM_MISMATCH" });
      }
      const previous = this.machineState;
      this.machineState = "OPENING";
      this.emitState(previous, "OPENING", { causeKind: "command", verb });
      this.motion = { verb, deadlineMs: now + this.knobs.motionMs };
      return ok({ commandId: this.nextId("cmd"), acknowledgedAtUtc: utcIsoFromMs(now) });
    }
    const transition = evaluateGateTransition({
      verb,
      claimedFrom: readyState,
      currentState: this.machineState,
      safetyState: this.safetyProvider().reported,
    });
    if (!transition.ok) {
      return err(this.mapTransitionError(transition.error));
    }
    const previous = this.machineState;
    this.machineState = transition.value;
    this.emitState(previous, transition.value, { causeKind: "command", verb });
    if (verb === "OPEN" || verb === "RESUME" || verb === "CLOSE") {
      this.motion = { verb, deadlineMs: now + this.knobs.motionMs };
    }
    return ok({ commandId: this.nextId("cmd"), acknowledgedAtUtc: utcIsoFromMs(now) });
  }

  private mapTransitionError(error: GateTransitionError): GateOperatorError {
    if (error.kind === "halt-without-trigger" || error.kind === "safety-blocked") {
      return { kind: "COMMAND_UNSUPPORTED" };
    }
    return { kind: "STATE_CLAIM_MISMATCH" };
  }

  private emitState(
    from: GateActuationState,
    to: GateActuationState,
    cause: Parameters<typeof makeGateStateChange>[0]["cause"],
  ): void {
    const change = makeGateStateChange({
      from,
      to,
      cause,
      source: "simulated",
      occurredAtUtc: utcIsoFromMs(this.clock.nowMs()),
    });
    this.stateChangesSink.push(change);
    this.statusSubject.emit(this.buildStatus());
  }

  private buildStatus(): OperatorStatus {
    const now = this.clock.nowMs();
    return {
      mode: "SIMULATED",
      health: this.knobs.unhealthy ? "UNHEALTHY" : "HEALTHY",
      connectivity: this.knobs.disconnected ? "DISCONNECTED" : "CONNECTED",
      config_validity: "VALID",
      last_reported_at: utcIsoFromMs(now),
      oxidation: {
        gate_actuation_state: this.machineState,
        reported_position: operatorPosition(this.machineState),
      },
    };
  }

  resolveTimeouts(nowMs: number): void {
    const stillPending: PendingSimCommand[] = [];
    for (const command of this.pendingSimCommands) {
      if (nowMs - command.issuedAtMs >= this.dispatchTimeoutMs) {
        command.resolve(err({ kind: "OPERATOR_UNREACHABLE" }));
      } else {
        stillPending.push(command);
      }
    }
    this.pendingSimCommands.length = 0;
    this.pendingSimCommands.push(...stillPending);
  }

  markOperatorFaulted(): void {
    if (this.machineState === "FAULT_UNKNOWN") {
      return;
    }
    const previous = this.machineState;
    this.machineState = "FAULT_UNKNOWN";
    this.motion = null;
    this.emitState(previous, "FAULT_UNKNOWN", { causeKind: "adapter-fault" });
  }

  markSafetyStopWhileClosing(): void {
    if (this.machineState !== "CLOSING") {
      return;
    }
    const previous = this.machineState;
    this.machineState = "HALTED_SAFETY_STOP";
    this.motion = null;
    this.emitState(previous, "HALTED_SAFETY_STOP", { causeKind: "safety-trigger" });
  }

  completeMotion(nowMs: number): void {
    const motion = this.motion;
    if (motion === null || nowMs < motion.deadlineMs) {
      return;
    }
    this.motion = null;
    if (motion.verb === "CLOSE") {
      if (this.machineState !== "CLOSING") {
        return;
      }
      const safety = this.safetyProvider().reported;
      const safetyStop = evaluateSafetyStopWhileClosing(safety);
      if (safetyStop.kind !== "transition") {
        return;
      }
      const previous = this.machineState;
      this.machineState = safetyStop.next;
      const cause =
        safetyStop.next === "HALTED_SAFETY_STOP"
          ? ({ causeKind: "safety-trigger" } as const)
          : ({ causeKind: "motion-complete", verb: motion.verb } as const);
      this.emitState(previous, safetyStop.next, cause);
      return;
    }
    const completion = evaluateMotionCompletion(this.machineState, motion.verb);
    if (completion.kind !== "transition") {
      return;
    }
    const previous = this.machineState;
    this.machineState = completion.next;
    this.emitState(previous, completion.next, { causeKind: "motion-complete", verb: motion.verb });
  }

  tick(nowMs: number): void {
    this.resolveTimeouts(nowMs);
    this.completeMotion(nowMs);
  }

  subscribeStatus(observer: (value: OperatorStatus) => void): DomainSubscription {
    return this.statusSubject.observable.subscribe(observer);
  }
}

export class SimulatedSafetyDevice implements SafetyDeviceAdapter {
  readonly kind = "SafetyDevice" as const;
  readonly device_type: SafetyDeviceKind = "PHOTOCELL";
  readonly adapter_contract_version = "GATEHEAD/v1" as const;

  private readonly clock: AdjustableSimClock;
  private readonly knobs: SimKnobs;
  private readonly edges = createDomainObservable<SafetyEdgeEvent>();

  constructor(clock: AdjustableSimClock, knobs: SimKnobs) {
    this.clock = clock;
    this.knobs = knobs;
  }

  reportCurrent(): { reported: "CLEAR" | "TRIGGERED" | "UNCLEAR" | "UNKNOWN" } {
    if (this.knobs.deviceFailed) {
      return { reported: "UNKNOWN" };
    }
    return { reported: this.knobs.safetyTriggered ? "TRIGGERED" : "CLEAR" };
  }

  status(): Promise<SafetyDeviceStatus> {
    const now = this.clock.nowMs();
    const status: SafetyDeviceStatus = {
      mode: "SIMULATED",
      health: this.knobs.deviceFailed ? "UNHEALTHY" : "HEALTHY",
      connectivity: "CONNECTED",
      config_validity: this.knobs.deviceFailed ? "INVALID" : "VALID",
      last_reported_at: utcIsoFromMs(now - this.knobs.reportSkewMs),
      oxidation: {
        reported_state: this.knobs.deviceFailed
          ? "UNKNOWN"
          : this.knobs.safetyTriggered
            ? "TRIGGERED"
            : "CLEAR",
      },
    };
    return Promise.resolve(status);
  }

  events(): DomainObservable<SafetyEdgeEvent> {
    return this.edges.observable;
  }

  emitEdge(kind: SafetyEdgeEvent["kind"]): SafetyEdgeEvent {
    const edge: SafetyEdgeEvent = {
      deviceType: this.device_type,
      kind,
      occurredAtUtc: utcIsoFromMs(this.clock.nowMs()),
      source: "simulated",
    };
    this.edges.emit(edge);
    return edge;
  }
}

export class SimulatedCamera implements CameraAdapter {
  readonly kind = "Camera" as const;
  readonly adapter_contract_version = "GATEHEAD/v1" as const;
  readonly cameraId: string;

  private readonly clock: AdjustableSimClock;
  private readonly knobs: SimKnobs;
  private counter = 0;
  private readonly snapshotSink: string[] | null;

  constructor(input: {
    cameraId: string;
    clock: AdjustableSimClock;
    knobs: SimKnobs;
    snapshotSink: string[] | null;
  }) {
    this.cameraId = input.cameraId;
    this.clock = input.clock;
    this.knobs = input.knobs;
    this.snapshotSink = input.snapshotSink;
  }

  status(): Promise<CameraStatus> {
    const now = this.clock.nowMs();
    const stream: CameraStreamId = `${this.cameraId}-stream-0`;
    const status: DeviceStatus<{ streams: CameraStreamId[] }> = {
      mode: "SIMULATED",
      health: this.knobs.cameraOffline ? "UNHEALTHY" : "HEALTHY",
      connectivity: this.knobs.cameraOffline ? "DISCONNECTED" : "CONNECTED",
      config_validity: "VALID",
      last_reported_at: utcIsoFromMs(now),
      oxidation: { streams: [stream] },
    };
    return Promise.resolve(status);
  }

  async snapshot(_opts?: CameraSnapshotOpts): Promise<Result<SnapshotOutput, SnapshotError>> {
    if (this.knobs.cameraOffline) {
      return err({ kind: "UNAVAILABLE", reason: "camera-offline" });
    }
    this.counter += 1;
    const ref = `sim://snapshot/${this.counter}`;
    this.snapshotSink?.push(ref);
    return ok({ phase: "available", ref });
  }

  async takeSnapshot(): Promise<SnapshotRef> {
    const result = await this.snapshot({ trigger: "post-command" });
    return result.ok && result.value.phase === "available"
      ? { phase: "available", ref: result.value.ref }
      : { phase: "unavailable" };
  }
}

export class SimulatedAnprProvider implements AnprProvider {
  readonly kind = "AnprProvider" as const;
  readonly adapter_contract_version = "GATEHEAD/v1" as const;

  private readonly knobs: SimKnobs;
  private connected = false;
  private ingested = 0;

  constructor(knobs: SimKnobs) {
    this.knobs = knobs;
  }

  async connect(providerConfig: string): Promise<Result<AnprSession, AnprConnectError>> {
    void providerConfig;
    if (this.knobs.anprOffline) {
      return err({ kind: "PROVIDER_REFUSED" });
    }
    this.connected = true;
    return ok({ providerName: "stub-anpr" });
  }

  async ingest(frameRef: FrameRef): Promise<Result<PlateCandidate[], AnprError>> {
    if (!this.connected) {
      return err({ kind: "NOT_CONNECTED" });
    }
    if (this.ingested >= ANPR_INGEST_LIMIT) {
      return err({ kind: "INGEST_LIMIT_EXCEEDED", limit: ANPR_INGEST_LIMIT });
    }
    this.ingested += 1;
    return ok([
      {
        plateRaw: "SIM-PLATE-01",
        confidence: 0.92,
        frameRefId: frameRef.frameKey,
      },
    ]);
  }
}

export interface SimulatedSystem {
  readonly clock: AdjustableSimClock;
  readonly knobs: SimKnobs;
  readonly gate: SimulatedGateOperator;
  readonly safety: SimulatedSafetyDevice;
  readonly camera: SimulatedCamera;
  readonly anpr: SimulatedAnprProvider;
  readonly coordinator: GateCoordinator;
  readonly audit: AuditStore;
  readonly decisions: AccessDecision[];
  readonly faults: FaultLedger;
  readonly stateChanges: GateStateChange[];
  readonly snapshots: string[];
  readonly nextId: (prefix: string) => string;
  setSafetyTriggered(value: boolean): void;
  advanceMs(deltaMs: number): void;
  heartbeat(): Promise<void>;
  dispose(): void;
}

export function createSimulatedSystem(config?: {
  gateId?: string;
  operatorId?: string;
  startNowMs?: number;
  stalenessThresholdMs?: number;
  dispatchTimeoutMs?: number;
  motionMs?: number;
  authorize?: (context: { verb: GateCommandVerb; subjectType: string; subjectId: string }) => {
    allowed: boolean;
  };
}): SimulatedSystem {
  const clock = new AdjustableSimClock(config?.startNowMs ?? 0);
  const knobs = createSimKnobs();
  if (config?.motionMs !== undefined) {
    knobs.motionMs = config.motionMs;
  }
  let idCounter = 0;
  const nextId = (prefix: string): string => {
    idCounter += 1;
    return `${prefix}-${String(idCounter).padStart(4, "0")}`;
  };
  const gateId = config?.gateId ?? "sim-gate";
  const operatorId = config?.operatorId ?? "sim-operator";
  const dispatchTimeoutMs = config?.dispatchTimeoutMs ?? 10_000;
  const stalenessThresholdMs = config?.stalenessThresholdMs ?? 60_000;
  const stateChanges: GateStateChange[] = [];
  const snapshots: string[] = [];
  const safety = new SimulatedSafetyDevice(clock, knobs);
  const gate = new SimulatedGateOperator({
    gateId,
    clock: clock,
    knobs,
    nextId,
    safetyProvider: () => safety.reportCurrent(),
    dispatchTimeoutMs,
    stateChangesSink: stateChanges,
  });
  const camera = new SimulatedCamera({
    cameraId: "sim-camera",
    clock: clock,
    knobs,
    snapshotSink: snapshots,
  });
  const anpr = new SimulatedAnprProvider(knobs);
  const audit = createAuditStore("sim");
  const decisions: AccessDecision[] = [];
  const faults = createFaultLedger();
  const coordinator = new GateCoordinator(
    {
      adapter: gate,
      safety,
      clock: clock,
      audit,
      decisions,
      faults,
      nextId,
      authorize: isAuthorizedByDefault(config?.authorize),
      operatorId,
    },
    { gateId, stalenessThresholdMs, dispatchTimeoutMs },
  );
  const markFaulted = (): void => {
    if (knobs.disconnected || knobs.unhealthy) {
      gate.markOperatorFaulted();
    }
  };
  const system: SimulatedSystem = {
    clock: clock,
    knobs,
    gate,
    safety,
    camera,
    anpr,
    coordinator,
    audit,
    decisions,
    faults,
    stateChanges,
    snapshots,
    nextId,
    setSafetyTriggered(value: boolean): void {
      knobs.safetyTriggered = value;
      if (value) {
        safety.emitEdge("SAFETY_TRIGGERED");
        if (gate.state === "CLOSING") {
          gate.markSafetyStopWhileClosing();
        }
      } else {
        safety.emitEdge("SAFETY_CLEARED");
      }
    },
    advanceMs(deltaMs: number): void {
      const advanced = clock.advanceMs(deltaMs);
      if (!advanced.ok) {
        throw new Error(`clock-advance-failed:${advanced.error.kind}`);
      }
      const now = clock.nowMs();
      gate.resolveTimeouts(now);
      markFaulted();
      gate.completeMotion(now);
    },
    heartbeat(): Promise<void> {
      return coordinator.heartbeat();
    },
    dispose(): void {
      coordinator.dispose();
    },
  };
  return system;
}

function isAuthorizedByDefault(
  authorize?: (context: { verb: GateCommandVerb; subjectType: string; subjectId: string }) => {
    allowed: boolean;
  },
): (ctx: {
  verb: GateCommandVerb;
  subjectType: "credential" | "operator" | "anpr";
  subjectId: string;
}) => { allowed: boolean } {
  if (authorize !== undefined) {
    return authorize;
  }
  return () => ({ allowed: true });
}
