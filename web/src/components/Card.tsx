import type { ReactNode } from "react";

export interface CardProps {
  readonly title?: string;
  readonly children: ReactNode;
}

/** Card — the standard content surface. Consumes tokens; never hardcodes. */
export function Card({ title, children }: CardProps) {
  return (
    <section className="lg-card">
      {title != null && <h2 className="lg-card__title">{title}</h2>}
      <div className="lg-card__body">{children}</div>
    </section>
  );
}
