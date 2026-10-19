import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedAccessDecisions } from "../mocks";

export function AccessView() {
  return (
    <MockCard title="Access decisions (simulated feed)">
      <Table
        rows={simulatedAccessDecisions.data}
        emptyLabel="No access decisions recorded."
        columns={[
          { header: "When (UTC)", render: (d) => d.atUtc },
          { header: "Subject", render: (d) => d.subject },
          {
            header: "Decision",
            render: (d) => <InlineBadge kind={kind(d.decision)} label={d.decision} />,
          },
          { header: "Reason", render: (d) => d.reason },
        ]}
      />
    </MockCard>
  );
}

function kind(decision: "allow" | "deny" | "uncertain"): "normal" | "critical" | "warning" {
  switch (decision) {
    case "allow":
      return "normal";
    case "deny":
      return "critical";
    case "uncertain":
      return "warning";
  }
}
