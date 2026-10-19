import type { JSX } from "react";
import { MockCard } from "./shared";
import { InlineBadge } from "../components/InlineBadge";
import { Table } from "../components/Table";
import { simulatedCameras, simulatedDetections } from "../mocks";
import type { SimulatedDetection } from "../mocks";

export function CamerasView() {
  return (
    <>
      <MockCard title="Camera streams (simulated frames)">
        <p className="lg-muted">
          In P1 these are caption placeholders only — no real video decoding, no Frigate (DEC-010)
          wiring, and no detection pipeline is bound.
        </p>
        <ul>
          {simulatedCameras.data.map((cam) => (
            <li key={cam.id}>
              <strong>{cam.name}</strong> ({cam.streamKind} ·{" "}
              <InlineBadge kind="neutral" label={cam.mode} glyph="◇" />)
              <br />
              <span className="lg-muted">{cam.frameCaption}</span>
            </li>
          ))}
        </ul>
      </MockCard>
      <MockCard title="Recent detections (simulated)">
        <Table
          rows={simulatedDetections.data}
          emptyLabel="No detections recorded."
          columns={[
            { header: "When (UTC)", render: (d) => d.atUtc },
            { header: "Camera", render: (d) => d.cameraId },
            { header: "Plate", render: (d) => d.plateText },
            {
              header: "Confidence",
              render: (d) => Math.round(d.confidence * 100) + "%",
            },
            {
              header: "Credential match",
              render: (d) => matchBadge(d),
            },
          ]}
        />
      </MockCard>
    </>
  );
}

function matchBadge(detection: SimulatedDetection): JSX.Element {
  switch (detection.matchedCredential) {
    case "match":
      return <InlineBadge kind="normal" label="match" />;
    case "no-match":
      return <InlineBadge kind="critical" label="no match" />;
    case "not-tried":
      return <InlineBadge kind="warning" label="not tried" />;
  }
}
