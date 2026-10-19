# LocalGate AI

Premium, local-first, self-hosted smart gate management. Runs entirely on your
own LAN — privacy by architecture: no cloud, no third-party service, no data
leaves your network.

> **Status: Phase 1 (design system scaffold).** The UI shell, design language,
> and simulated demo surfaces exist; the domain core (P2), Gatehead adapter
> layer (P3), backend (P4), camera/ANPR pipeline (P5) and packaging (P6) are
> not built yet. Everything on screen is currently **simulated** and labeled as
> such — simulated state is never presented as real. Build the repo docs along
> the way: start at [`docs/README.md`](docs/README.md).

## Quick start

Requires Node.js (tested with v26 LTS) and npm.

```sh
npm install        # first time only; commits package-lock.json (supply-chain rule T-11)
npm run dev        # dev server → http://localhost:5173
npm test           # vitest suite (43 tests)
npm run lint       # eslint
npm run format     # prettier --write (check with npm run format:check)
npm run build      # tsc --noEmit + vite build → web/dist/
```

The toolchain is the **one documented command chain** (plan constraint C2):
`npm install → npm test → npm run lint → npm run build` must all pass before
any phase boundary is declared. Current verified state: **43/43 tests pass,
lint clean, build green.**

## What's in the box (P1)

- **Design tokens** — dark-first, colorblind-safe state colors (lightness
  ordering + shape + text-label redundancy so state never relies on hue alone),
  type/spacing/radii/motion scales. Source of truth: `docs/DESIGN.md`.
- **Component kit** — status badges, cards, tables, empty/loading/error
  ("refused") states, hold-to-confirm buttons, Recharts-backed dashboards.
- **Navigation shell** — all 12 feature destinations from the owner's planning
  review, plus a supporting devices panel; unknown paths redirect to the
  dashboard.
- **Mock registry** — every dataset is an explicitly-typed `Simulated<T>`
  wrapper with visible `SIMULATED` provenance on every surface that consumes it.
- **Hold-to-confirm** — safety-status gate implementation is UI shell only; it
  refuses empty/stale/unknown safety state and performs **no dispatch** in P1.

## Repository layout

```
docs/            plan, requirements, domain, threat model, decisions, audits
web/src/
  tokens/        design tokens (consumed via var(--lg-*), never hardcoded)
  components/    presentational kit + shell layout + error boundary
  views/         one screen per feature destination
  mocks/         typed Simulated* registry (not production domain types)
  routes/        route manifest with build-time route/feature validation
  tests/         vitest suite
```

## Documents

The project is planned phase-by-phase with owner review gates between phases.
See [`docs/README.md`](docs/README.md) for the full index — the build plan
(`docs/OPENCODE_BUILD_PLAN.md`) is the source of truth, and
[`docs/scope-audit/`](docs/scope-audit/) records what each phase actually
changed.
