import type { JSX } from "react";
import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedActivity } from "../mocks";
import type { SimulatedActivityEntry } from "../mocks";

/** ActivityView — visitor arrivals and gate outcomes (mock-driven P1). */
export function ActivityView() {
  return (
    <MockCard title="Recent visitor activity (simulated)">
      <Table
        rows={simulatedActivity.data}
        emptyLabel="No activity recorded."
        columns={[
          { header: "When (UTC)", render: (a) => a.atUtc },
          { header: "Visitor", render: (a) => a.visitor },
          { header: "Event", render: (a) => activityBadge(a.kind) },
          { header: "Gate outcome", render: (a) => outcomeBadge(a.gateOutcome) },
        ]}
      />
    </MockCard>
  );
}

function activityBadge(kind: SimulatedActivityEntry["kind"]): JSX.Element {
  switch (kind) {
    case "arrival":
      return <InlineBadge kind="normal" label="arrival" />;
    case "departure":
      return <InlineBadge kind="normal" label="departure" />;
    case "denied-entry":
      return <InlineBadge kind="warning" label="denied entry" />;
  }
}

function outcomeBadge(outcome: SimulatedActivityEntry["gateOutcome"]): JSX.Element {
  switch (outcome) {
    case "opened":
      return <InlineBadge kind="normal" label="opened" />;
    case "stayed-closed":
      return <InlineBadge kind="warning" label="stayed closed" />;
  }
}
