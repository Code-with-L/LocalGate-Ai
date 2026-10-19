import type { ReactNode } from "react";

export interface EmptyStateProps {
  readonly title: string;
  readonly children?: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="lg-empty" role="status">
      <p className="lg-empty__title">{title}</p>
      {children != null && <p className="lg-empty__body">{children}</p>}
    </div>
  );
}

export interface ErrorStateProps {
  readonly title: string;
  /** The visible refusal — why nothing is being shown. Never swallowed. */
  readonly children?: ReactNode;
}

export function RefusedState({ title, children }: ErrorStateProps) {
  return (
    <div className="lg-refused" role="alert">
      <p className="lg-refused__title">{title}</p>
      {children != null && <p className="lg-refused__body">{children}</p>}
    </div>
  );
}

export interface SkeletonProps {
  readonly rows?: number;
}

export function Skeleton({ rows = 3 }: SkeletonProps) {
  return (
    <div className="lg-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="lg-skeleton__row" key={i} />
      ))}
    </div>
  );
}
