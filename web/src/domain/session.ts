import type { EventSource, Result } from "./primitives";
import { err, msFromUtcIso, ok, utcIsoFromMs } from "./primitives";

export type GateSessionContext = "dashboard" | "visitor_pin" | "anpr_pass";

export type GateSessionEndReason =
  "explicit-end" | "timeout" | "gate-decay" | "superseded" | "system-shutdown";

export interface GateSession {
  readonly sessionId: string;
  readonly context: GateSessionContext;
  readonly source: EventSource;
  readonly visitorCredentialId: string | null;
  readonly operatorId: string | null;
  readonly startedAtUtc: string;
  readonly endedAtUtc: string | null;
  readonly endedReason: GateSessionEndReason | null;
  readonly lastActivityUtc: string;
}

export type GateSessionError =
  | { kind: "session-already-open"; sessionId: string }
  | { kind: "session-already-ended" }
  | { kind: "session-actor-missing" };

export interface SessionStore {
  readonly openSessions: Map<string, GateSession>;
  readonly terminalSessions: GateSession[];
}

export const DEFAULT_SESSION_TIMEOUT_MS = 10 * 60 * 1000;

export interface SessionOpenInput {
  context: GateSessionContext;
  source: EventSource;
  visitorCredentialId: string | null;
  operatorId: string | null;
}

export function createSessionStore(): SessionStore {
  return {
    openSessions: new Map<string, GateSession>(),
    terminalSessions: [],
  };
}

export function sessionClaimKey(input: SessionOpenInput): string {
  return (
    input.visitorCredentialId ??
    (input.operatorId !== null ? `operator:${input.operatorId}` : "anonymous")
  );
}

export function openGateSession(
  store: SessionStore,
  input: SessionOpenInput,
  nowMs: number,
  sessionId: string,
): Result<GateSession, GateSessionError> {
  const key = sessionClaimKey(input);
  const existing = store.openSessions.get(key);
  if (existing !== undefined) {
    return err({ kind: "session-already-open", sessionId: existing.sessionId });
  }
  const session: GateSession = Object.freeze({
    sessionId,
    context: input.context,
    source: input.source,
    visitorCredentialId: input.visitorCredentialId,
    operatorId: input.operatorId,
    startedAtUtc: utcIsoFromMs(nowMs),
    endedAtUtc: null,
    endedReason: null,
    lastActivityUtc: utcIsoFromMs(nowMs),
  });
  store.openSessions.set(key, session);
  return ok(session);
}

export function touchGateSession(
  session: GateSession,
  nowMs: number,
): Result<GateSession, GateSessionError> {
  if (session.endedAtUtc !== null) {
    return err({ kind: "session-already-ended" });
  }
  return ok(Object.freeze({ ...session, lastActivityUtc: utcIsoFromMs(nowMs) }));
}

export function endSession(
  store: SessionStore,
  session: GateSession,
  reason: GateSessionEndReason,
  nowMs: number,
): Result<GateSession, GateSessionError> {
  if (session.endedAtUtc !== null) {
    return err({ kind: "session-already-ended" });
  }
  const key = sessionKeyFromSession(session);
  const held = store.openSessions.get(key);
  if (held === undefined || held.sessionId !== session.sessionId) {
    return err({ kind: "session-already-ended" });
  }
  const ended: GateSession = Object.freeze({
    ...session,
    endedAtUtc: utcIsoFromMs(nowMs),
    endedReason: reason,
  });
  if (store.openSessions.delete(key)) {
    store.terminalSessions.push(ended);
    return ok(ended);
  }
  return err({ kind: "session-already-ended" });
}

export function listTerminalSessions(store: SessionStore): readonly GateSession[] {
  return [...store.terminalSessions];
}

function sessionKeyFromSession(session: GateSession): string {
  return (
    session.visitorCredentialId ??
    (session.operatorId !== null ? `operator:${session.operatorId}` : "anonymous")
  );
}

export interface SessionTimeoutOutcome {
  kind: "not-due" | "expired";
  session: GateSession | null;
}

export function applySessionTimeout(
  store: SessionStore,
  session: GateSession,
  nowMs: number,
  timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS,
): SessionTimeoutOutcome {
  if (session.endedAtUtc !== null) {
    return { kind: "not-due", session };
  }
  const lastPenalty = msFromUtcIso(session.lastActivityUtc);
  if (!Number.isNaN(lastPenalty) && nowMs - lastPenalty < timeoutMs) {
    return { kind: "not-due", session: null };
  }
  const ended = endSession(store, session, "timeout", nowMs);
  if (ended.ok) {
    return { kind: "expired", session: ended.value };
  }
  return { kind: "not-due", session: null };
}
