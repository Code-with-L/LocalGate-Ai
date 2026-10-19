import type { BadgeKind } from "./badge-specs";

export interface InlineBadgeProps {
  readonly kind: BadgeKind;
  readonly label: string;
  /** Text content; defaults to a bullet glyph when not colour-alone. */
  readonly glyph?: string;
}

/**
 * InlineBadge — same colorblind-safety contract as StatusBadge (color +
 * glyph-if-coloured + text label) for arbitrary one-off labels. Used only
 * with `glyph` when kind is normal/warning/critical so the state is never
 * hue-only; neutral labels may omit it.
 */
export function InlineBadge({ kind, label, glyph }: InlineBadgeProps) {
  const shape =
    glyph ?? (kind === "normal" ? "●" : kind === "warning" ? "▲" : kind === "critical" ? "■" : "");
  return (
    <span className={`lg-badge lg-badge--${kind}`}>
      {shape !== "" && <span aria-hidden="true">{shape}</span>}
      <span>{label}</span>
    </span>
  );
}
