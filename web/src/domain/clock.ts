import type { DomainClock, Result } from "./primitives";
import { err, ok } from "./primitives";

export type ClockAdvanceError = { kind: "time-regression"; attemptedMs: number; currentMs: number };

export class AdjustableSimClock implements DomainClock {
  private currentMs: number;

  constructor(startNowMs = 0) {
    this.currentMs = startNowMs;
  }

  nowMs(): number {
    return this.currentMs;
  }

  setNowMs(ms: number): Result<number, ClockAdvanceError> {
    if (ms < this.currentMs) {
      return err({ kind: "time-regression", attemptedMs: ms, currentMs: this.currentMs });
    }
    this.currentMs = ms;
    return ok(ms);
  }

  advanceMs(deltaMs: number): Result<number, ClockAdvanceError> {
    if (deltaMs < 0) {
      return err({
        kind: "time-regression",
        attemptedMs: this.currentMs + deltaMs,
        currentMs: this.currentMs,
      });
    }
    const next = this.currentMs + deltaMs;
    this.currentMs = next;
    return ok(next);
  }

  advanceToMs(toMs: number): Result<number, ClockAdvanceError> {
    if (toMs < this.currentMs) {
      return err({ kind: "time-regression", attemptedMs: toMs, currentMs: this.currentMs });
    }
    this.currentMs = toMs;
    return ok(toMs);
  }
}

export class StaticTestClock implements DomainClock {
  private currentMs: number;

  constructor(startNowMs = 0) {
    this.currentMs = startNowMs;
  }

  nowMs(): number {
    return this.currentMs;
  }

  setNowMs(ms: number): void {
    this.currentMs = ms;
  }
}
