# DESIGN.md — LocalGate AI design language

**Status:** P1 source of truth for the visual language. `web/src/tokens/tokens.css` is the single machine-readable implementation; never hardcode token values in components — consume them via `var(--lg-*)`.

---

## 1. Direction

Premium but restrained: a dark-first, industrial-control-panel aesthetic. Density leans toward operations tooling (cards of data, dense tables) with generous whitespace between cards. Nothing decorative exists for its own sake; the two things that earn visual emphasis are **state** (is everything fine?) and **provenance** (is this simulated or real?).

The design must survive two specific audits from the plan:

- **C5 / colorblind safety** — state must never be communicated by hue alone.
- **Simulation honesty** — simulated state carries a persistent, visible marker on every surface.

## 2. Tokens (`web/src/tokens/tokens.css`)

| Group             | Key variables                                                                                               | Notes                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Surfaces          | `--lg-bg`, `--lg-surface`, `--lg-surface-raised`, `--lg-surface-hover`, `--lg-border`, `--lg-border-strong` | dark navy/graphite ramp; raised surface sits above base |
| Text              | `--lg-text-primary`, `--lg-text-secondary`, `--lg-text-tertiary`, `--lg-text-on-accent`                     | tri-level hierarchy on dark ground                      |
| Accent            | `--lg-accent(-hover/-subtle/-focus)`                                                                        | focus ring and interactive affordances only             |
| State colors      | `--lg-state-normal/-warning/-critical` + `-text` and `-subtle` variants                                     | see §3                                                  |
| Provenance colors | `--lg-mode-simulated/-unconfigured/-live` + subtle variants                                                 | badge fills, see §4                                     |
| Motion            | `--lg-motion-fast/base`                                                                                     | every transition resolves to one of these               |
| Radius / zap      | `--lg-radius(-sm/-lg)`, `--lg-space-*` scale                                                                | one radius grammar, 4px spacing grid                    |

`color-scheme: dark` is set on `:root` so native form controls match the palette.

## 3. Colorblind-safe state rule (binding)

State colors alone never carry the information. Full redundancy is layered:

1. **Lightness ordering** — normal is the _lightest_ state color (reads as "bright/quiet/fine" on dark ground), warning is mid, critical is the _darkest-saturating_ of the three. Lightness deltas survive every common color-vision deficiency, hue naturally does not.
2. **Shape prefix** — `StatusBadge` renders a distinct glyph per state: `●` normal, `▲` warning, `■` critical (plus `◇` SIMULATED, `○` UNCONFIGURED, `◆` LIVE for provenance).
3. **Text label** — the human word ("FRESH", "degraded", "denied") is always rendered next to the glyph.

The P1 unit tests enforce the glyph + label pairing at the component level, so dropping either breaks the suite, not just the design intent.

## 4. Provenance badges (C5)

Three kinds, always rendered by `ModeBadge`-style components:

| Kind           | Glyph | Color slot               | Meaning                                                                                                                           |
| -------------- | ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `simulated`    | `◇`   | purple family (reserved) | mock-fed; the purple family is never used for state colors, so "simulated" stays visually distinct from "normal/warning/critical" |
| `unconfigured` | `○`   | neutral surface          | real slot with nothing behind it yet                                                                                              |
| `live`         | `◆`   | accent family            | actual device/session data — unused in P1 by construction                                                                         |

Every card/table/title that renders mock data mounts a provenance badge; the visual line between simulated and real never blurs.

## 5. Component contracts

- **`StatusBadge`** — API is spec-based: `spec = { kind, glyph, label }`, helpers `OperatingModeBadge` / `ModuleStateBadge` / `FreshnessBadge`. See `badge-specs.ts` for the spec collection.
- **`InlineBadge`** — label + kind inline in running text (`normal/warning/critical/neutral`).
- **`Card` / `Table`** — title + provenance badge pattern; tables render bounded rows with the same type ramp as cards.
- **`HoldToConfirmButton`** — `<button>` with a progress fill element (`.lg-hold__fill`, starts at `width: 0%`). Requires a valid safety status (fresh, non-empty); refuses stale/unknown with a `role="note"` reason, disabled button, and "UNAVAILABLE" affordance label; keyboard hold is available (and cannot bypass the same gate); never dispatches in P1.
- **States** — `EmptyState` (for deferred surfaces), skeleton rows (`lg-skeleton__row`), and `RefusedState` (data null/malformed → explicit refusal, never silent). ErrorBoundary wraps each view; a crashed view shows `lg-refused` instead of a blank grid.
- **ShellLayout** — sidebar nav (all manifest destinations) + `main` outlet; footer shows build phase honestly.

`prefers-reduced-motion` is honored for the hold fill and chart transitions (plan baseline).

## 6. Deferred by design

- Charming hero moments, simulator juggler visuals, ANPR overlay styling — P3/P5 concerns. The `SimulatorView` is an honest placeholder today, not a fake.
- Any "LIVE" styling is eagerly wired but unexercised: by construction no view can render it because no data source exists yet. This is the plan's honesty rule working as intended.
