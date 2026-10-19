/**
 * Route manifest — the binding P1 route list (NEXT.md §2).
 *
 * Everything on this list is rendered for P1 review; nothing was silently
 * dropped. `/devices` is a declared supporting route from AC-F5.3/AC-F8.3.
 * Each entry maps one open review of the NEXT.md 12-feature manifest, and a
 * build-time check below refuses to boot if any feature is unrouted.
 */

import type { ComponentType } from "react";
import { DashboardView } from "../views/DashboardView";
import { AccessView } from "../views/AccessView";
import { CamerasView } from "../views/CamerasView";
import { CredentialsView } from "../views/CredentialsView";
import { AuditView } from "../views/AuditView";
import { OperatorsView } from "../views/OperatorsView";
import { SimulatorView } from "../views/SimulatorView";
import { ActivityView } from "../views/ActivityView";
import { MessagingView } from "../views/MessagingView";
import { ConfigView } from "../views/ConfigView";
import { DevicesView } from "../views/DevicesView";

export interface RouteEntry {
  /** react-router path (lowercase, no params in P1). */
  readonly path: string;
  readonly label: string;
  /** The feature id the screen fulfils — the 12-feature reconciliation key. */
  readonly featureId: string;
  /**
   * Extra feature ids merged into this same route (declared merges only,
   * e.g. pin-verification shares /credentials with credentials).
   */
  readonly mergedFeatureIds?: readonly string[];
  readonly view: ComponentType;
}

export const ROUTES: readonly RouteEntry[] = [
  {
    // /dashboard is the binding manifest path (NEXT.md A2 row 1); the bare
    // root / redirects to it (see App.tsx). Manual control lives inside the
    // dashboard per plan D5; hold-to-confirm must not dispatch in P1.
    path: "/dashboard",
    label: "Dashboard",
    featureId: "dashboard",
    view: DashboardView,
  },
  {
    path: "/access",
    label: "Access",
    featureId: "access-control",
    view: AccessView,
  },
  {
    path: "/cameras",
    label: "Cameras",
    featureId: "camera-integration",
    view: CamerasView,
  },
  {
    // Merged view, declared: Credentials (AC credential/invite surface) and
    // PIN-verification status live together per NEXT.md reconciliation.
    path: "/credentials",
    label: "Credentials",
    featureId: "credentials",
    mergedFeatureIds: ["pin-verification"],
    view: CredentialsView,
  },
  { path: "/audit", label: "Audit", featureId: "audit", view: AuditView },
  {
    path: "/operators",
    label: "Operators",
    featureId: "admin",
    view: OperatorsView,
  },
  {
    path: "/simulator",
    label: "Simulator",
    featureId: "simulator-control",
    view: SimulatorView,
  },
  {
    path: "/activity",
    label: "Activity",
    featureId: "activity",
    view: ActivityView,
  },
  {
    path: "/messaging",
    label: "Messaging",
    featureId: "messaging",
    view: MessagingView,
  },
  { path: "/config", label: "Config", featureId: "config", view: ConfigView },
  // Supporting route (AC-F5.3/AC-F8.3): telemetry & adapter health fed by
  // Gatehead-style device data. Declared openly as beyond the 12 features.
  { path: "/devices", label: "Devices", featureId: "telemetry", view: DevicesView },
];

export const NAV_ITEMS: readonly { path: string; label: string }[] = ROUTES.map(
  ({ path, label }) => ({ path, label }),
);

/**
 * The plan's full 12-feature list (DECISIONS-approved reconciliation).
 * `pin-verification` shares /credentials with `credentials` — a declared
 * merge, not a dropped feature.
 */
const REQUIRED_FEATURE_ROUTES: Readonly<Record<string, string>> = {
  dashboard: "/dashboard",
  "access-control": "/access",
  "camera-integration": "/cameras",
  "pin-verification": "/credentials",
  audit: "/audit",
  credentials: "/credentials",
  admin: "/operators",
  "simulator-control": "/simulator",
  telemetry: "/devices",
  activity: "/activity",
  messaging: "/messaging",
  config: "/config",
};

for (const [feature, path] of Object.entries(REQUIRED_FEATURE_ROUTES)) {
  const entry = ROUTES.find(
    (route) => route.featureId === feature || (route.mergedFeatureIds ?? []).includes(feature),
  );
  if (entry == null || entry.path !== path) {
    throw new Error(`P1 route manifest violation: feature "${feature}" must resolve to ${path}`);
  }
}

export function featureRoute(feature: string): string {
  const entry = ROUTES.find((route) => route.featureId === feature);
  if (entry == null) {
    throw new Error(`No route registered for feature "${feature}"`);
  }
  return entry.path;
}
