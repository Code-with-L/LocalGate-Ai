import { useCallback, useEffect, useRef, useState } from "react";
import type { Freshness } from "../mocks/simulated";

/**
 * HoldToConfirmButton — plan Amd 2.1 UI element, P1 logic shell.
 *
 * Binding safety contract (NEXT.md §2 "Forbidden"):
 *  1. Safety-status acceptance: the button requires the caller to pass the
 *     freshness of every interlocking safety device relevant to the action.
 *     If any device is NOT "fresh", holding is rejected outright — stale and
 *     unknown are equally unusable. This mirrors the D5 rule the P2 backend
 *     will enforce; the UI never getting here is a UX affordance, not the
 *     enforcement point.
 *  2. No dispatch: this component never issues network, IPC, or side-effect
 *     calls of any kind. It reports completion ONLY via `onConfirmed`, which
 *     P1 views leave unimplemented (they log to the console in dev builds).
 *     Unit tests enforce both properties.
 *  3. Hold semantics: press-and-hold for HOLD_MS (token --lg-duration-hold,
 *     value duplicated here as a constant because JS cannot read CSS custom
 *     properties without coupling); release early cancels; reduced-motion
 *     preference collapses the duration via the token.
 */

const HOLD_MS = 1200; // mirrors tokens.css --lg-duration-hold

export interface SafetyStatus {
  readonly name: string;
  readonly freshness: Freshness;
}

export interface HoldToConfirmButtonProps {
  readonly label: string;
  /** Freshness of every safety device gating this action — must all be fresh. */
  readonly safetyStatus: readonly SafetyStatus[];
  readonly onConfirmed: () => void;
}

function rejectedReason(status: readonly SafetyStatus[]): string | null {
  if (status.length === 0) {
    return "No safety status supplied — action unavailable.";
  }
  const blocking = status.filter((d) => d.freshness !== "fresh");
  if (blocking.length === 0) return null;
  return `Safety status not usable: ${blocking
    .map((d) => `${d.name} (${d.freshness})`)
    .join(", ")}`;
}

export function HoldToConfirmButton({
  label,
  safetyStatus,
  onConfirmed,
}: HoldToConfirmButtonProps) {
  const rejection = rejectedReason(safetyStatus);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startedAtRef.current = null;
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    if (rejection != null || rafRef.current != null) return;
    startedAtRef.current = performance.now();
    const step = (now: number) => {
      const startedAt = startedAtRef.current;
      if (startedAt == null) return;
      const elapsed = now - startedAt;
      if (elapsed >= HOLD_MS) {
        stop();
        onConfirmed();
        return;
      }
      setProgress(elapsed / HOLD_MS);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [rejection, onConfirmed, stop]);

  const disabled = rejection != null;
  return (
    <div className="lg-hold">
      <button
        type="button"
        className="lg-hold__button"
        disabled={disabled}
        aria-describedby={rejection != null ? "lg-hold-reason" : undefined}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") start();
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key === " ") stop();
        }}
      >
        <span className="lg-hold__fill" style={{ width: `${progress * 100}%` }} />
        <span className="lg-hold__label">
          {disabled ? "UNAVAILABLE" : `HOLD TO CONFIRM — ${label}`}
        </span>
      </button>
      {rejection != null && (
        <p id="lg-hold-reason" role="note" className="lg-hold__reason">
          {rejection}
        </p>
      )}
    </div>
  );
}
