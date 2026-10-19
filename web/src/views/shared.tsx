import type { ReactNode } from "react";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";

/**
 * MockCard — every P1 screen wraps its content so the SIMULATED provenance
 * chip sits beside the card title, on every surface (plan C5 binding +
 * NEXT.md "simulated state never represented as live").
 */
export function MockCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={undefined}>
      <div className="lg-card__header-row">
        <h2 className="lg-card__title">{title}</h2>
        <StatusBadge spec={{ kind: "neutral", glyph: "◇", label: "SIMULATED" }} />
      </div>
      {children}
    </Card>
  );
}
