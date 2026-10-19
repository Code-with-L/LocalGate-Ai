import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { App } from "../App";

/**
 * Route-manifest coverage test — the binding P1 route list (NEXT.md §2).
 * Every manifest route must actually render in the wired app.
 */

const ROUTE_CASES: readonly { path: string; heading: RegExp }[] = [
  { path: "/dashboard", heading: /gate state|manual controls/i },
  { path: "/access", heading: /access decisions/i },
  { path: "/cameras", heading: /camera|detection/i },
  { path: "/credentials", heading: /credential|pin verification/i },
  { path: "/audit", heading: /audit/i },
  { path: "/operators", heading: /operator|roles/i },
  { path: "/simulator", heading: /simulator/i },
  { path: "/activity", heading: /activity/i },
  { path: "/messaging", heading: /messaging/i },
  { path: "/config", heading: /configuration/i },
  { path: "/devices", heading: /device|adapter/i },
];

for (const { path, heading } of ROUTE_CASES) {
  it(`renders the ${path} route`, () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    // Multiple card titles may match one regex; ensure at least one lands in
    // the routed main content area (not the nav shell).
    const matches = screen.getAllByText(heading);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((el) => el.closest("main") != null)).toBe(true);
  });
}

it("shows un-routed paths as a redirect to the dashboard", () => {
  render(
    <MemoryRouter initialEntries={["/nope"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getAllByText(/gate state|manual controls/i).length).toBeGreaterThan(0);
});

it("redirects the bare root / to /dashboard", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getAllByText(/gate state|manual controls/i).length).toBeGreaterThan(0);
});
