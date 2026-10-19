/**
 * Mock-data registry for P1.
 *
 * The binding rule (NEXT.md §2): mocks are view props only. They must never
 * be promoted into production domain types. When P2's domain core lands,
 * these files are replaced by real adapters and the Simulated* wrappers go
 * away wholesale — no screen should keep importing from here.
 *
 * Messaging is deliberately absent: its behavior is deferred with a reason
 * (REQUIREMENTS.md deferred list) until hardware commissioning exists, so the
 * route renders an explicit deferred state rather than a mock that pretends
 * behavior.
 */

export { simulatedGate, simulatedGateEvents, simulatedTelemetry } from "./gate";
export { simulatedAccessDecisions, simulatedCredentials } from "./access";
export { simulatedCameras, simulatedDetections } from "./cameras";
export { simulatedAudit } from "./audit";
export { simulatedOperators, simulatedActivity } from "./activity";
export { simulatedDevices, simulatedSiteConfig } from "./devices";
