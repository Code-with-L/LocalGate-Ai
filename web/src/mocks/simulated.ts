/**
 * Simulated* — the P1 mock-data wrapper type (binding NEXT.md §2 rule).
 *
 * Every P1 mock object is wrapped as `Simulated<T>` with an explicit
 * `source: "simulated"` discriminant so no screen can accidentally render
 * invented state as live or real. These types are view-layer props only —
 * they are intentionally distinct from (and must never shadow or be reused
 * as) the production domain types that P2 will define per DOMAIN.md.
 */

export type SimulatedSource = "simulated";

export interface Simulated<T> {
  readonly source: SimulatedSource;
  readonly data: T;
}

/** Module input-state union for badges (docs DOMAIN.md / plan D5). */
export type ModuleState = "on" | "off" | "e-stop" | "gate-in-motion" | "unconfigured" | "error";

/** Evaluating how fresh a device report is (Amd 2.1 hold-to-confirm safety). */
export type Freshness = "fresh" | "stale" | "unknown";

/** Operating mode indicator shown on every mock surface (plan C5). */
export type OperatingMode = "SIMULATED" | "UNCONFIGURED" | "LIVE";
