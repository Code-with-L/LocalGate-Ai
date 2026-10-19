/**
 * Badge mappings: how domain-ish inputs (module state, device freshness,
 * safety report) decompose into the three colorblind-safe badge kinds.
 *
 * Binding rule (tokens/README.md): a badge kind never relies on hue alone —
 * every badge renders a distinct shape glyph + a text label, and the CSS
 * class supplies color + lightness. Components may not bypass this mapping.
 */

export type BadgeKind = "normal" | "warning" | "critical" | "neutral";

export type { ModuleState, Freshness, OperatingMode, Simulated } from "../mocks/simulated";
import type { ModuleState, Freshness, OperatingMode } from "../mocks/simulated";

export interface BadgeSpec {
  readonly kind: BadgeKind;
  readonly glyph: string;
  readonly label: string;
}

export function moduleStateBadge(state: ModuleState): BadgeSpec {
  switch (state) {
    case "on":
      return { kind: "normal", glyph: "●", label: "ON" };
    case "off":
      return { kind: "neutral", glyph: "○", label: "OFF" };
    case "gate-in-motion":
      return { kind: "warning", glyph: "▲", label: "GATE IN MOTION" };
    case "e-stop":
      return { kind: "critical", glyph: "■", label: "E-STOP" };
    case "error":
      return { kind: "critical", glyph: "■", label: "ERROR" };
    case "unconfigured":
      return { kind: "neutral", glyph: "○", label: "UNCONFIGURED" };
  }
}

export function freshnessBadge(freshness: Freshness): BadgeSpec {
  switch (freshness) {
    case "fresh":
      return { kind: "normal", glyph: "●", label: "FRESH" };
    case "stale":
      return { kind: "warning", glyph: "▲", label: "STALE" };
    case "unknown":
      return { kind: "critical", glyph: "■", label: "UNKNOWN" };
  }
}

export function operatingModeBadge(mode: OperatingMode): BadgeSpec {
  switch (mode) {
    case "SIMULATED":
      // Purple is reserved exclusively for SIMULATED (tokens/README.md).
      return { kind: "neutral", glyph: "◇", label: "SIMULATED" };
    case "UNCONFIGURED":
      return { kind: "neutral", glyph: "○", label: "UNCONFIGURED" };
    case "LIVE":
      return { kind: "normal", glyph: "◆", label: "LIVE" };
  }
}
