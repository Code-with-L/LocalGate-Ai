import { Card } from "../components/Card";
import { ModuleStateBadge, FreshnessBadge } from "../components/StatusBadge";
import { HoldToConfirmButton } from "../components/HoldToConfirmButton";
import { CommandTrendChart } from "../components/CommandTrendChart";
import { MockCard } from "./shared";
import {
  simulatedGate,
  simulatedGateEvents,
  simulatedTelemetry,
  simulatedAppSurface,
} from "../mocks";

/**
 * DashboardView — combined surface for dashboard + telemetry + manual gate
 * controls (manifest reconciliation). Telemetry chart and event feed are
 * mock-driven; the hold-to-confirm shell demonstrates the Amd 2.1 UX without
 * any dispatch.
 */
export function DashboardView() {
  const gate = simulatedGate.data;
  const phase = simulatedAppSurface[0]?.buildPhase ?? "P1";
  return (
    <>
      <Card title={`Welcome — ${phase}`}>
        <p className="lg-muted">
          LocalGate AI is running on simulated data. Nothing here talks to a gate yet.
        </p>
      </Card>

      <MockCard title="Gate state">
        <p>
          <ModuleStateBadge state={gate.moduleState} />{" "}
          <span className="lg-muted">last change {gate.lastChangedAtUtc}</span>
        </p>
        <h3 className="lg-card__title">Safety devices</h3>
        <ul>
          {gate.safetyDevices.map((device) => (
            <li key={device.id}>
              {device.name} — <FreshnessBadge freshness={device.freshness} />
              <span className="lg-muted">
                {" "}
                reported {device.reportState} at {device.lastReportedAtUtc}
              </span>
            </li>
          ))}
        </ul>
      </MockCard>

      <MockCard title="Command trend (per minute)">
        <CommandTrendChart points={simulatedTelemetry.data} />
      </MockCard>

      <MockCard title="Manual controls (hold to confirm)">
        <p className="lg-muted">
          The control below is a UI shell only. It fires a local confirmation callback; no command
          is ever dispatched in P1.
        </p>
        <HoldToConfirmButton
          label="OPEN (simulated rig)"
          safetyStatus={[{ name: gate.name, freshness: "fresh" }]}
          onConfirmed={() => {
            // Deliberate no-op in P1: the plan's forbidden list bars any
            // backend/IPC/network dispatch. Wired for real in a later phase.
          }}
        />
      </MockCard>

      <MockCard title="Recent gate events">
        <ul>
          {simulatedGateEvents.data.map((event) => (
            <li key={event.id}>
              <strong>{event.atUtc}</strong> — {event.summary}
            </li>
          ))}
        </ul>
      </MockCard>
    </>
  );
}
