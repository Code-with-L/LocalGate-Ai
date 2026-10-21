import { describe, expect, it } from "vitest";
import {
  ALL_GATE_ACTUATION_STATES,
  ALL_GATE_COMMAND_VERBS,
  evaluateGateTransition,
  evaluateMotionCompletion,
  evaluateSafetyStopWhileClosing,
  isStateUsableForDispatch,
  makeGateStateChange,
  markGateFault,
  SeededLcg,
} from "../domain/gate";
import type { GateActuationState, GateCommandVerb } from "../domain/gate";
import type { SafetyReportedState } from "../domain/primitives";
import { utcIsoFromMs } from "../domain/primitives";

type TransitionInput = Parameters<typeof evaluateGateTransition>[0];

function transitionOf(
  verb: GateCommandVerb,
  claimedFrom: GateActuationState,
  currentState: GateActuationState,
  safetyState: TransitionInput["safetyState"],
) {
  return evaluateGateTransition({ verb, claimedFrom, currentState, safetyState });
}

describe("evaluateGateTransition", () => {
  it("opens from IDLE when safety is CLEAR", () => {
    const result = transitionOf("OPEN", "IDLE", "IDLE", "CLEAR");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("OPENING");
    }
  });

  it("rejects OPEN from OPEN_AWAIT_CLOSE", () => {
    const result = transitionOf("OPEN", "OPEN_AWAIT_CLOSE", "OPEN_AWAIT_CLOSE", "CLEAR");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        kind: "invalid-state-transition",
        command: "OPEN",
        currentState: "OPEN_AWAIT_CLOSE",
      });
    }
  });

  it("rejects OPEN when safety is TRIGGERED", () => {
    const result = transitionOf("OPEN", "IDLE", "IDLE", "TRIGGERED");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: "safety-blocked", reportedState: "TRIGGERED" });
    }
  });

  it("rejects OPEN when safety is UNCLEAR", () => {
    const result = transitionOf("OPEN", "IDLE", "IDLE", "UNCLEAR");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: "safety-blocked", reportedState: "UNCLEAR" });
    }
  });

  it("resumes from HALTED_SAFETY_STOP and FAULT_UNKNOWN when safety is CLEAR", () => {
    for (const from of ["HALTED_SAFETY_STOP", "FAULT_UNKNOWN"] as const) {
      const result = transitionOf("RESUME", from, from, "CLEAR");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("OPENING");
      }
    }
  });

  it("rejects RESUME from IDLE", () => {
    const result = transitionOf("RESUME", "IDLE", "IDLE", "CLEAR");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        kind: "invalid-state-transition",
        command: "RESUME",
        currentState: "IDLE",
      });
    }
  });

  it("closes only from OPEN_AWAIT_CLOSE", () => {
    const valid = transitionOf("CLOSE", "OPEN_AWAIT_CLOSE", "OPEN_AWAIT_CLOSE", "CLEAR");
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value).toBe("CLOSING");
    }
    const idle = transitionOf("CLOSE", "IDLE", "IDLE", "CLEAR");
    expect(idle.ok).toBe(false);
    if (!idle.ok) {
      expect(idle.error.kind).toBe("invalid-state-transition");
    }
    const closingDuplicate = transitionOf("CLOSE", "CLOSING", "CLOSING", "CLEAR");
    expect(closingDuplicate.ok).toBe(false);
    if (!closingDuplicate.ok) {
      expect(closingDuplicate.error).toEqual({
        kind: "invalid-state-transition",
        command: "CLOSE",
        currentState: "CLOSING",
      });
    }
  });

  it("halts only CLOSING state with safety TRIGGERED", () => {
    const valid = transitionOf("HALT", "CLOSING", "CLOSING", "TRIGGERED");
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value).toBe("HALTED_SAFETY_STOP");
    }
    const withoutTrigger = transitionOf("HALT", "CLOSING", "CLOSING", "CLEAR");
    expect(withoutTrigger.ok).toBe(false);
    if (!withoutTrigger.ok) {
      expect(withoutTrigger.error).toEqual({
        kind: "halt-without-trigger",
        reportedState: "CLEAR",
      });
    }
    const wrongState = transitionOf("HALT", "IDLE", "IDLE", "TRIGGERED");
    expect(wrongState.ok).toBe(false);
    if (!wrongState.ok) {
      expect(wrongState.error).toEqual({
        kind: "invalid-state-transition",
        command: "HALT",
        currentState: "IDLE",
      });
    }
  });

  it("rejects mismatched claimedFrom", () => {
    const result = transitionOf("OPEN", "IDLE", "OPENING", "CLEAR");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        kind: "from-mismatch",
        claimedFrom: "IDLE",
        currentState: "OPENING",
      });
    }
  });
});

describe("evaluateMotionCompletion", () => {
  it("advances OPEN and RESUME to OPEN_AWAIT_CLOSE only from OPENING", () => {
    const openAdvancing = evaluateMotionCompletion("OPENING", "OPEN");
    expect(openAdvancing.kind).toBe("transition");
    if (openAdvancing.kind === "transition") {
      expect(openAdvancing.next).toBe("OPEN_AWAIT_CLOSE");
    }

    const resumeAdvancing = evaluateMotionCompletion("OPENING", "RESUME");
    expect(resumeAdvancing.kind).toBe("transition");
    if (resumeAdvancing.kind === "transition") {
      expect(resumeAdvancing.next).toBe("OPEN_AWAIT_CLOSE");
    }
  });

  it("advances CLOSE to IDLE only from CLOSING", () => {
    const closeAdvancing = evaluateMotionCompletion("CLOSING", "CLOSE");
    expect(closeAdvancing.kind).toBe("transition");
    if (closeAdvancing.kind === "transition") {
      expect(closeAdvancing.next).toBe("IDLE");
    }
  });

  it("returns no-motion for late or non-motion verbs", () => {
    expect(evaluateMotionCompletion("OPEN_AWAIT_CLOSE", "OPEN").kind).toBe("no-motion");
    expect(evaluateMotionCompletion("CLOSING", "OPEN").kind).toBe("no-motion");
    expect(evaluateMotionCompletion("IDLE", "CLOSE").kind).toBe("no-motion");
    expect(evaluateMotionCompletion("OPENING", "HALT").kind).toBe("no-motion");
    expect(evaluateMotionCompletion("IDLE", "RESUME").kind).toBe("no-motion");
  });
});

describe("evaluateSafetyStopWhileClosing", () => {
  it("halts on TRIGGERED and UNCLEAR and clears to IDLE otherwise", () => {
    const triggered = evaluateSafetyStopWhileClosing("TRIGGERED");
    expect(triggered.kind).toBe("transition");
    if (triggered.kind === "transition") {
      expect(triggered.next).toBe("HALTED_SAFETY_STOP");
    }
    const unclear = evaluateSafetyStopWhileClosing("UNCLEAR");
    expect(unclear.kind).toBe("transition");
    if (unclear.kind === "transition") {
      expect(unclear.next).toBe("HALTED_SAFETY_STOP");
    }
    const clear = evaluateSafetyStopWhileClosing("CLEAR");
    expect(clear.kind).toBe("transition");
    if (clear.kind === "transition") {
      expect(clear.next).toBe("IDLE");
    }
    const unknown: SafetyReportedState = "UNKNOWN";
    const unknownStop = evaluateSafetyStopWhileClosing(unknown);
    expect(unknownStop.kind).toBe("transition");
    if (unknownStop.kind === "transition") {
      expect(unknownStop.next).toBe("IDLE");
    }
  });
});

describe("markGateFault and isStateUsableForDispatch", () => {
  it("marks any claimed state as FAULT_UNKNOWN", () => {
    for (const current of ALL_GATE_ACTUATION_STATES) {
      expect(markGateFault(current)).toBe("FAULT_UNKNOWN");
    }
  });

  it("reports FAULT_UNKNOWN as unusable while HALTED_SAFETY_STOP stays dispatchable", () => {
    const okStates = ALL_GATE_ACTUATION_STATES.filter((state) => state !== "FAULT_UNKNOWN");
    for (const state of okStates) {
      expect(isStateUsableForDispatch(state)).toBe(true);
    }
    expect(isStateUsableForDispatch("FAULT_UNKNOWN")).toBe(false);
    expect(isStateUsableForDispatch("HALTED_SAFETY_STOP")).toBe(true);
  });
});

describe("makeGateStateChange", () => {
  it("produces frozen changes with the supplied fields", () => {
    const change = makeGateStateChange({
      from: "IDLE",
      to: "OPENING",
      cause: { causeKind: "command", verb: "OPEN" },
      source: "simulated",
      occurredAtUtc: utcIsoFromMs(1_000_000),
    });
    expect(change.type).toBe("GateStateChange");
    expect(change.from).toBe("IDLE");
    expect(change.to).toBe("OPENING");
    expect(change.cause.causeKind).toBe("command");
    if (change.cause.causeKind === "command") {
      expect(change.cause.verb).toBe("OPEN");
    }
    expect(change.source).toBe("simulated");
    expect(change.occurredAtUtc).toBe(utcIsoFromMs(1_000_000));
    expect(Object.isFrozen(change)).toBe(true);
  });

  it("supports motion-complete and safety-trigger causes", () => {
    const motion = makeGateStateChange({
      from: "OPENING",
      to: "OPEN_AWAIT_CLOSE",
      cause: { causeKind: "motion-complete", verb: "OPEN" },
      source: "simulated",
      occurredAtUtc: utcIsoFromMs(2_000_000),
    });
    expect(motion.cause.causeKind).toBe("motion-complete");
    const safety = makeGateStateChange({
      from: "CLOSING",
      to: "HALTED_SAFETY_STOP",
      cause: { causeKind: "safety-trigger" },
      source: "simulated",
      occurredAtUtc: utcIsoFromMs(3_000_000),
    });
    expect(safety.cause.causeKind).toBe("safety-trigger");
    expect(safety.cause).toEqual({ causeKind: "safety-trigger" });
  });
});

describe("SeededLcg", () => {
  it("is deterministic per seed", () => {
    const first = new SeededLcg(42);
    const second = new SeededLcg(42);
    const firstRun = [first.next(), first.next(), first.next()];
    const secondRun = [second.next(), second.next(), second.next()];
    expect(firstRun).toEqual(secondRun);
  });

  it("produces values in [0, 1)", () => {
    const lcg = new SeededLcg(1);
    for (let index = 0; index < 200; index += 1) {
      const value = lcg.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("bounds nextInt and pick", () => {
    const lcg = new SeededLcg(7);
    for (let index = 0; index < 100; index += 1) {
      const value = lcg.nextInt(5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(lcg.pick(ALL_GATE_COMMAND_VERBS)).toBe("OPEN");
  });
});
