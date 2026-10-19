import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { EmptyState } from "../components/states";

export function SimulatorView() {
  return (
    <MockCard title="Simulator control (placeholder)">
      <p className="lg-muted">
        The Simulation Lab (event quanta, fault injection, virtual gatehead) is scheduled for P3 per
        the build plan. P1 renders the declared scaffold only — there are no controls here because
        there is no engine to drive yet.
      </p>
      <EmptyState title="No simulator controls in this phase">
        Wiring this view to a simulator before P3 would contradict the plan's phase gating and the
        domain-core ownership boundary (D3).
      </EmptyState>
      <p>
        <InlineBadge kind="neutral" label="Gateway to P3 scope" glyph="○" />
      </p>
    </MockCard>
  );
}
