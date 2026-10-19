import type { JSX } from "react";
import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedDevices } from "../mocks";
import type { SimulatedDeviceAdapter } from "../mocks";

/** DevicesView — declared supporting route (REQUIREMENTS AC-F5.3/AC-F8.3). */
export function DevicesView() {
  return (
    <MockCard title="Devices & adapters (simulated)">
      <p className="lg-muted">
        Adapter health and report freshness feed Gatehead's terminal-freshness gate in the P2+
        actuation workflow.
      </p>
      <Table
        rows={simulatedDevices.data}
        emptyLabel="No devices configured."
        columns={[
          { header: "Adapter", render: (d) => d.name },
          { header: "Kind", render: (d) => d.kind },
          { header: "State", render: (d) => stateBadge(d) },
          { header: "Freshness", render: (d) => freshnessBadge(d) },
        ]}
      />
    </MockCard>
  );
}

function stateBadge(device: SimulatedDeviceAdapter): JSX.Element {
  switch (device.state) {
    case "connected":
      return <InlineBadge kind="normal" label="connected" />;
    case "degraded":
      return <InlineBadge kind="warning" label="degraded" />;
    case "unconfigured":
      return <InlineBadge kind="critical" label="unconfigured" />;
  }
}

function freshnessBadge(device: SimulatedDeviceAdapter): JSX.Element {
  switch (device.freshness) {
    case "fresh":
      return <InlineBadge kind="normal" label="FRESH" />;
    case "stale":
      return <InlineBadge kind="warning" label="STALE" />;
    case "unknown":
      return <InlineBadge kind="critical" label="UNKNOWN" />;
  }
}
