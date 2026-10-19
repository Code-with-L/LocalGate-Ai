import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { simulatedSiteConfig } from "../mocks";

export function ConfigView() {
  const config = simulatedSiteConfig.data;
  return (
    <MockCard title="Site configuration (simulated, read-only)">
      <p className="lg-muted">
        Editing, persistence, and schema validation arrive with P2 (domain core). The P1 view only
        reflects the mock; nothing here writes state.
      </p>
      <dl>
        <dt>Site name</dt>
        <dd>{config.siteName}</dd>
        <dt>Timezone</dt>
        <dd>
          {config.timezone} <InlineBadge kind="normal" label="configured" />
        </dd>
        <dt>Retention window</dt>
        <dd>
          {config.retentionDays} days <InlineBadge kind="normal" label="configured" />
        </dd>
      </dl>
      <p>
        <InlineBadge kind="neutral" label="Full config UX: later phase" glyph="○" />
      </p>
    </MockCard>
  );
}
