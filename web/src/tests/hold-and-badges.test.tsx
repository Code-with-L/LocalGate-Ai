import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HoldToConfirmButton } from "../components/HoldToConfirmButton";
import { StatusBadge } from "../components/StatusBadge";
import { InlineBadge } from "../components/InlineBadge";

/**
 * Behavior-critical component tests (P1 scope).
 * Hold-to-confirm is the binding safety affordance from Amd 2.1:
 *  - rejects (does not confirm / shows reason) for stale, unknown, or empty
 *    safety status
 *  - confirms only after HOLD_MS of sustained hold
 *  - never dispatches anything on its own (reports via `onConfirmed` only;
 *    the spy itself is the dispatch surface)
 */
const freshSafety = [
  { name: "Optical safety edge", freshness: "fresh" as const },
  { name: "Loop detector", freshness: "fresh" as const },
];

describe("HoldToConfirmButton — rejection cases", () => {
  const rejectionCases = [
    { name: "empty status", status: [] },
    {
      name: "stale device",
      status: [{ name: "Optical edge", freshness: "stale" as const }],
    },
    {
      name: "unknown device",
      status: [{ name: "Loop detector", freshness: "unknown" as const }],
    },
    {
      name: "one fresh + one stale",
      status: [
        { name: "Edge", freshness: "fresh" as const },
        { name: "Loop", freshness: "stale" as const },
      ],
    },
  ] as const;

  for (const { name, status } of rejectionCases) {
    it(`rejects hold with ${name}`, async () => {
      const onConfirmed = vi.fn();
      const user = userEvent.setup();
      render(
        <HoldToConfirmButton label="Open gate" safetyStatus={status} onConfirmed={onConfirmed} />,
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent(/safety status/i);

      // Keyboard attempts must not bypass the disabled state.
      await user.keyboard("{enter}");
      expect(onConfirmed).not.toHaveBeenCalled();
    });
  }
});

describe("HoldToConfirmButton — acceptance semantics", () => {
  it("starts with an empty fill and exposes an accessible hold affordance", () => {
    render(
      <HoldToConfirmButton label="Open gate" safetyStatus={freshSafety} onConfirmed={() => {}} />,
    );
    const fill = document.querySelector(".lg-hold__fill") as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe("0%");
  });

  it("cancels the pointer hold on early release without confirming", async () => {
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    render(
      <HoldToConfirmButton
        label="Open gate"
        safetyStatus={freshSafety}
        onConfirmed={onConfirmed}
      />,
    );

    const button = screen.getByRole("button", {
      name: /hold to confirm — open gate/i,
    });
    await user.pointer([
      { target: button, keys: "[MouseLeft>]" },
      { target: button, keys: "[/MouseLeft]" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("fires exactly once on a full keyboard hold", async () => {
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    render(
      <HoldToConfirmButton
        label="Close gate"
        safetyStatus={freshSafety}
        onConfirmed={onConfirmed}
      />,
    );

    const button = screen.getByRole("button", { name: /close gate/i });

    // Hold with keydown, complete the hold duration, then keyup.
    button.focus();
    await user.keyboard("[Enter>]");
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1), {
      timeout: 2500,
    });
    await user.keyboard("[/Enter]");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});

describe("Badges — colorblind-safe shape + label contract", () => {
  it("StatusBadge renders glyph + text label, never hue alone", () => {
    render(<StatusBadge spec={{ kind: "warning", glyph: "▲", label: "STALE" }} />);
    const badge = screen.getByText("STALE").closest(".lg-badge");
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toMatch(/[●▲■]/);
  });

  it("InlineBadge covers normal/warning/critical/neutral with labels", () => {
    render(
      <>
        <InlineBadge kind="normal" label="FRESH" />
        <InlineBadge kind="warning" label="degraded" />
        <InlineBadge kind="critical" label="denied" />
        <InlineBadge kind="neutral" label="deferred" />
      </>,
    );
    for (const label of ["FRESH", "degraded", "denied", "deferred"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
