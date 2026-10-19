import type { ReactNode } from "react";
import type { BadgeSpec } from "./badge-specs";
import type { OperatingMode, ModuleState, Freshness } from "../mocks/simulated";
import { moduleStateBadge, freshnessBadge, operatingModeBadge } from "./badge-specs";

/**
 * StatusBadge — the single colored-state chip used everywhere.
 *
 * Colorblind safety contract: `kind` provides color/lightness (CSS), `glyph`
 * provides shape, `label` provides text. All three are rendered on every
 * instance; there is no icon-only or color-only variant of this component.
 */

export interface StatusBadgeProps {
  readonly spec: BadgeSpec;
  /** Optional extra context rendered before the label (e.g. a device name). */
  readonly children?: ReactNode;
}

export function StatusBadge({ spec, children }: StatusBadgeProps) {
  return (
    <span className={`lg-badge lg-badge--${spec.kind}`}>
      <span aria-hidden="true" className="lg-badge__glyph">
        {spec.glyph}
      </span>
      <span className="lg-badge__label">{spec.label}</span>
      {children != null && <span className="lg-badge__context">{children}</span>}
    </span>
  );
}

export function OperatingModeBadge({ mode }: { mode: OperatingMode }) {
  return <StatusBadge spec={operatingModeBadge(mode)} />;
}

export function ModuleStateBadge({ state }: { state: ModuleState }) {
  return <StatusBadge spec={moduleStateBadge(state)} />;
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  return <StatusBadge spec={freshnessBadge(freshness)} />;
}
