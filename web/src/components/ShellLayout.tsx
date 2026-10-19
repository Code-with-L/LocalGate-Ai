import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { OperatingModeBadge } from "./StatusBadge";
import { NAV_ITEMS } from "../routes/nav-config";
import { simulatedAppSurface } from "../mocks";
import type { AppSurfaceConfig } from "../mocks";

/**
 * ShellLayout — application chrome: sidebar nav + topbar + content area.
 *
 * The operating-mode chip (default SIMULATED, from mocks) is persistent so
 * the simulated provenance is visible on every screen (plan C5 binding).
 *
 * The topbar surface config is intentionally exposed as `readonly
 * AppSurfaceConfig[]` so the shell consumes it like a keyed prop list rather
 * than a mutable module global picked lazily — a repeatable test surface
 * (NEXT.md C6).
 */
const surfaceConfig: readonly AppSurfaceConfig[] = simulatedAppSurface;

export function ShellLayout({ children }: { children: ReactNode }) {
  const mode = surfaceConfig[0]?.currentOperatingMode ?? "UNCONFIGURED";
  return (
    <div className="lg-shell" data-testid="lg-shell">
      <aside className="lg-shell__sidebar" aria-label="Primary">
        <div className="lg-shell__brand">LocalGate AI</div>
        <nav>
          <ul className="lg-shell__nav">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "lg-shell__navlink is-active" : "lg-shell__navlink"
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="lg-shell__main">
        <header className="lg-shell__topbar" data-testid="lg-topbar">
          <OperatingModeBadge mode={mode} />
        </header>
        <main className="lg-shell__content">{children}</main>
      </div>
    </div>
  );
}
