import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedAudit } from "../mocks";
import type { SimulatedAuditRecord } from "../mocks";

export function AuditView() {
  return (
    <MockCard title="Audit log (simulated, append-only UI)">
      <p className="lg-muted">
        The P1 log is a static mock. The real append-only local audit store (plan D2) arrives with
        the P2 persistence layer and is never editable afterward.
      </p>
      <Table
        rows={simulatedAudit.data}
        emptyLabel="No audit records."
        columns={[
          { header: "When (UTC)", render: (r) => r.atUtc },
          { header: "Actor", render: (r) => r.actor },
          { header: "Action", render: (r) => r.action },
          { header: "Object", render: (r) => r.object },
          { header: "Result", render: (r) => resultBadge(r.result) },
        ]}
      />
    </MockCard>
  );
}

function resultBadge(result: SimulatedAuditRecord["result"]): JSX.Element {
  switch (result) {
    case "success":
      return <InlineBadge kind="normal" label="success" />;
    case "denied":
      return <InlineBadge kind="warning" label="denied" />;
    case "failed":
      return <InlineBadge kind="critical" label="failed" />;
  }
}
