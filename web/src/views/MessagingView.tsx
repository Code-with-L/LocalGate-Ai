import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { EmptyState } from "../components/states";

export function MessagingView() {
  return (
    <MockCard title="Messaging">
      <p className="lg-muted">
        Behavior is deferred per REQUIREMENTS (deferred list): local messaging is not in the P1
        build, and none of the placeholders below implies a shipping channel.
      </p>
      <EmptyState title="Messaging is deferred">
        This screen exists so the feature is not silently dropped from the plan, but it has no
        implementable surface in P1.
      </EmptyState>
      <p>
        <InlineBadge kind="neutral" label="Disabled by scope decision (P1)" glyph="○" />
      </p>
    </MockCard>
  );
}
