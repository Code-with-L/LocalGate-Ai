import type { JSX } from "react";
import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedCredentials } from "../mocks";
import type { SimulatedVisitorCredential } from "../mocks";

/**
 * CredentialsView — merged surface (declared): visitor credentials plus the
 * PIN-verification status section, per the NEXT.md feature reconciliation.
 */
export function CredentialsView() {
  return (
    <>
      <MockCard title="Visitor credentials (simulated)">
        <Table
          rows={simulatedCredentials.data}
          emptyLabel="No credentials on record."
          columns={[
            { header: "Visitor", render: (c) => c.visitor },
            {
              header: "Kind",
              render: (c) => c.credentialKind.replace("_", " "),
            },
            { header: "Valid from (UTC)", render: (c) => c.validFromUtc },
            { header: "Valid to (UTC)", render: (c) => c.validToUtc },
            { header: "Status", render: (c) => statusBadge(c) },
          ]}
        />
      </MockCard>
      <MockCard title="PIN verification (status only)">
        <p className="lg-muted">
          Surface placeholder for the PIN-verification feature. The verification logic itself lands
          with the P2 access-control service; nothing here accepts or evaluates PINs yet.
        </p>
        <ul>
          <li>
            <InlineBadge kind="neutral" label="PIN entry: not available in P1" glyph="○" />
          </li>
          <li>
            <InlineBadge kind="neutral" label="Keypad adapter: unconfigured" glyph="○" />
          </li>
        </ul>
      </MockCard>
    </>
  );
}

function statusBadge(credential: SimulatedVisitorCredential): JSX.Element {
  switch (credential.status) {
    case "active":
      return <InlineBadge kind="normal" label="active" />;
    case "expiring-soon":
      return <InlineBadge kind="warning" label="expiring soon" />;
    case "expired":
      return <InlineBadge kind="warning" label="expired" />;
    case "revoked":
      return <InlineBadge kind="critical" label="revoked" />;
  }
}
