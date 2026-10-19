import type { JSX } from "react";
import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedOperators } from "../mocks";
import type { SimulatedOperator } from "../mocks";

export function OperatorsView() {
  return (
    <MockCard title="Operators & roles (simulated)">
      <p className="lg-muted">
        Operator provisioning lands when the local identity surface exists; the P1 view is read-only
        and mock-driven.
      </p>
      <Table
        rows={simulatedOperators.data}
        emptyLabel="No operators configured."
        columns={[
          { header: "Operator", render: (o) => o.displayName },
          {
            header: "Role",
            render: (o) => <InlineBadge kind="neutral" label={o.role} />,
          },
          { header: "Auth method", render: (o) => o.authMethod.replace("_", " ") },
          { header: "Status", render: (o) => statusBadge(o) },
        ]}
      />
    </MockCard>
  );
}

function statusBadge(operator: SimulatedOperator): JSX.Element {
  switch (operator.status) {
    case "active":
      return <InlineBadge kind="normal" label="active" />;
    case "disabled":
      return <InlineBadge kind="critical" label="disabled" />;
  }
}
