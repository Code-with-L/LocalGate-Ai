# Tokens

`tokens.css` is the single source of truth for all visual values in LocalGate AI.
Every component must consume values as `var(--lg-*)` — no hardcoded colors,
sizes, durations, or z-indexes anywhere else.

## Naming rule

`--lg-<domain>-<name>` with domains in a fixed order: `bg`, `surface`, `border`,
`text`, `accent`, `state-*`, `mode-*`, `font`, `text-*` (type scale ),
`leading`, `weight`, `space`, `radius`, `elevation`, `z`, `duration`,
`ease`, layout (`sidebar`, `topbar`, `breakpoint`).

## Colorblind-safe rule (binding, NEXT.md §2)

The three state colors (normal / warning / critical) and the three operating
modes (SIMULATED / UNCONFIGURED / LIVE) must never be distinguished by hue
alone:

1. **Lightness separation** — states are ordered normal = lightest,
   warning = mid, critical = highest contrast against `--lg-bg`, chosen so even
   most deuteranopia/protanopia/achromatopsia profiles keep the three distinct.
2. **Text labels** — any state chip carries the state's name verbatim
   (e.g. `NORMAL`, `WARNING`, `CRITICAL`; `SIMULATED`, `UNCONFIGURED`, `LIVE`).
   Verified at P1 review; never promised by note alone.
3. **Shape prefix** — `<StatusBadge>` pairs each state with a distinct glyph:
   `●` normal, `▲` warning, `■` critical; modes use `◇` SIMULATED, `○`
   UNCONFIGURED, `◆` LIVE. The glyph comes from the component, not from copy,
   so no screen can omit it accidentally.
4. Purple is reserved exclusively for SIMULATED. It is outside the
   normal/warning/critical hue triangle, so a purple badge can never be
   confused with a health state and vice versa.

## Usage rules for the P1 baseline

- Dark is the default; there is no light theme yet. Do not create `:root[data-theme]`
  hooks without a DESIGN.md decision first.
- `prefers-reduced-motion` is honored at the token level; components should
  never add their own media queries to "fix" motion — they inherit the
  suppressed values automatically.
- New tokens require a one-line entry here plus the DESIGN.md palette table.
