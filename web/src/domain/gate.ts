import type { EventSource, OperatingMode, Result, SafetyReportedState } from "./primitives";
import { err, ok } from "./primitives";

export type GateType = "sliding" | (string & {});

export const KNOWN_GATE_TYPES: readonly GateType[] = ["sliding"];

export interface Gate {
  readonly entityId: string;
  readonly entityType: "Gate";
  readonly siteId: string;
  readonly name: string;
  readonly type: GateType;
  readonly commissioningState: OperatingMode;
  readonly ratedSpecs: Readonly<Record<string, string>>;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface GateCreateInput {
  id: string;
  siteId: string;
  name: string;
  type: GateType;
  commissioningState: OperatingMode;
  ratedSpecs?: Record<string, string>;
  createdAtUtc: string;
}

export type GateValidationError = { kind: "name-empty" } | { kind: "site-id-missing" };

export function createGate(input: GateCreateInput): Result<Gate, GateValidationError> {
  const name = input.name.trim();
  if (name.length === 0) {
    return err({ kind: "name-empty" });
  }
  if (input.siteId.length === 0) {
    return err({ kind: "site-id-missing" });
  }
  const gate: Gate = Object.freeze({
    entityId: input.id,
    entityType: "Gate" as const,
    siteId: input.siteId,
    name,
    type: input.type,
    commissioningState: input.commissioningState,
    ratedSpecs: Object.freeze({ ...(input.ratedSpecs ?? {}) }),
    createdAtUtc: input.createdAtUtc,
    updatedAtUtc: input.createdAtUtc,
  });
  return ok(gate);
}

export type GateActuationState =
  "IDLE" | "OPENING" | "OPEN_AWAIT_CLOSE" | "CLOSING" | "HALTED_SAFETY_STOP" | "FAULT_UNKNOWN";

export type GateCommandVerb = "OPEN" | "CLOSE" | "HALT" | "RESUME";

export const ALL_GATE_COMMAND_VERBS: readonly GateCommandVerb[] = [
  "OPEN",
  "CLOSE",
  "HALT",
  "RESUME",
];

export const ALL_GATE_ACTUATION_STATES: readonly GateActuationState[] = [
  "IDLE",
  "OPENING",
  "OPEN_AWAIT_CLOSE",
  "CLOSING",
  "HALTED_SAFETY_STOP",
  "FAULT_UNKNOWN",
];

export type GateTransitionError =
  | { kind: "from-mismatch"; claimedFrom: GateActuationState; currentState: GateActuationState }
  | { kind: "invalid-state-transition"; command: GateCommandVerb; currentState: GateActuationState }
  | { kind: "safety-blocked"; reportedState: SafetyReportedState }
  | { kind: "halt-without-trigger"; reportedState: SafetyReportedState };

export type GateStateCause =
  | { causeKind: "command"; verb: GateCommandVerb }
  | { causeKind: "motion-complete"; verb: GateCommandVerb }
  | { causeKind: "safety-trigger" }
  | { causeKind: "adapter-fault" };

export interface GateStateChange {
  readonly type: "GateStateChange";
  readonly from: GateActuationState;
  readonly to: GateActuationState;
  readonly cause: GateStateCause;
  readonly source: EventSource;
  readonly occurredAtUtc: string;
}

const OPEN_ALLOWING: readonly GateActuationState[] = [
  "IDLE",
  "HALTED_SAFETY_STOP",
  "FAULT_UNKNOWN",
];
const RESUME_ALLOWING: readonly GateActuationState[] = ["HALTED_SAFETY_STOP", "FAULT_UNKNOWN"];

export interface GateTransitionInput {
  verb: GateCommandVerb;
  claimedFrom: GateActuationState;
  currentState: GateActuationState;
  safetyState: SafetyReportedState;
}

export function evaluateGateTransition(
  input: GateTransitionInput,
): Result<GateActuationState, GateTransitionError> {
  const claimedFrom = input.claimedFrom;
  const currentState = input.currentState;
  const verb = input.verb;
  const safety = input.safetyState;

  if (claimedFrom !== currentState) {
    return err({ kind: "from-mismatch", claimedFrom, currentState });
  }

  if (verb === "OPEN") {
    if (!OPEN_ALLOWING.includes(currentState)) {
      return err({ kind: "invalid-state-transition", command: verb, currentState });
    }
    if (safety !== "CLEAR") {
      return err({ kind: "safety-blocked", reportedState: safety });
    }
    return ok("OPENING");
  }

  if (verb === "RESUME") {
    if (!RESUME_ALLOWING.includes(currentState)) {
      return err({ kind: "invalid-state-transition", command: verb, currentState });
    }
    if (safety !== "CLEAR") {
      return err({ kind: "safety-blocked", reportedState: safety });
    }
    return ok("OPENING");
  }

  if (verb === "CLOSE") {
    if (currentState !== "OPEN_AWAIT_CLOSE") {
      return err({ kind: "invalid-state-transition", command: verb, currentState });
    }
    return ok("CLOSING");
  }

  if (verb === "HALT") {
    if (currentState !== "CLOSING") {
      return err({ kind: "invalid-state-transition", command: verb, currentState });
    }
    if (safety !== "TRIGGERED") {
      return err({ kind: "halt-without-trigger", reportedState: safety });
    }
    return ok("HALTED_SAFETY_STOP");
  }

  return err({ kind: "invalid-state-transition", command: verb, currentState });
}

export type GateMotionCompletion =
  | { kind: "no-motion" }
  | { kind: "transition"; next: GateActuationState; safetyGuard?: "requires-clear" };

export function evaluateMotionCompletion(
  currentState: GateActuationState,
  completedVerb: GateCommandVerb,
): GateMotionCompletion {
  if (completedVerb === "OPEN" || completedVerb === "RESUME") {
    if (currentState === "OPENING") {
      return { kind: "transition", next: "OPEN_AWAIT_CLOSE" };
    }
    return { kind: "no-motion" };
  }
  if (completedVerb === "CLOSE") {
    if (currentState === "CLOSING") {
      return { kind: "transition", next: "IDLE" };
    }
    return { kind: "no-motion" };
  }
  return { kind: "no-motion" };
}

export function evaluateSafetyStopWhileClosing(
  safetyState: SafetyReportedState,
): GateMotionCompletion {
  if (safetyState === "TRIGGERED" || safetyState === "UNCLEAR") {
    return { kind: "transition", next: "HALTED_SAFETY_STOP" };
  }
  return { kind: "transition", next: "IDLE" };
}

export function markGateFault(_currentState: GateActuationState): GateActuationState {
  return "FAULT_UNKNOWN";
}

export function isStateUsableForDispatch(state: GateActuationState): boolean {
  return state !== "FAULT_UNKNOWN";
}

export function makeGateStateChange(input: {
  from: GateActuationState;
  to: GateActuationState;
  cause: GateStateCause;
  source: EventSource;
  occurredAtUtc: string;
}): GateStateChange {
  return Object.freeze({
    type: "GateStateChange" as const,
    from: input.from,
    to: input.to,
    cause: input.cause,
    source: input.source,
    occurredAtUtc: input.occurredAtUtc,
  });
}

export class SeededLcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1_664_525) + 1_013_904_223) >>> 0;
    return this.state / 0x1_0000_0000;
  }

  nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    const idx = this.nextInt(items.length);
    const value = items[idx];
    if (value === undefined) {
      throw new Error("lcg-pick-empty");
    }
    return value;
  }
}
