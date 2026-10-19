# NEXT — Handoff After P0

**Status:** P0 complete; awaiting project-owner review.

---

## 1. P1 permissions (proposed, effective only after review)

If the project owner approves the P0 documents (including the proposed resolutions of findings F-01/F-02/F-04 and decisions DEC-008/DEC-009/DEC-010), **P1 (premium design system, plan ref Phase 1)** may begin under these boundaries:

### Allowed
1. **Design-token foundation:** create `web/src/tokens/` as a minimal directory (`tokens.css` for CSS custom properties, `README.md` for token rules) — color palette (with an accessible dark default), typography scale, spacing scale, radii, elevation/z-index, motion durations, state colors (normal / warning / critical), and simulation/live visual indicators (C5's persistent badge styles).
2. **Colorblind-safe palette:** the default dark palette must pass a colorblind-safe check for its state colors (normal / warning / critical distinguishable without relying on hue alone — include at least shape/label redundancy in component CSS variables), verified at P1 review, not just promised.
3. **Mock data registry:** create `web/src/mocks/` and a lightweight type-safe mock-data registry — enough to make premium screens reviewable, and each object explicitly typed as a `Simulated*` object or similar typed wrapper + the source field, and the file must not shadow the REAL project types. These mocks are **not** production domain types; they are only the P1 visual props required to build components gracefully.
4. **Component scaffolding:** create `web/src/components/` with shell layout, cards, tables, status badges, hold-to-confirm button (as a component logic shell, per Amd 2.1's UI element, without backend safety dispatch), charts using **Recharts** (per `DECISIONS.md`), empty states; all components must be typed and free of local business logic (they may accept mock data or be wrapped later by P2 wiring).
5. **Navigation shell:** base routing skeleton (`react-router-dom` per `DECISIONS.md`) with placeholder screens: Dashboard, Cameras, Devices, Credentials, Audit, Config — explicitly labeled as mock-first (any data fetch attempt fails gracefully, and this restriction is enforced by unit tests in P1, not left unenforced).
6. **Project scaffolding:** create `package.json`, Vite config, TypeScript config, ESLint + Prettier config, and run the reproducible install/test/build commands so that C2's "one documented command chain" can be stated in `README.md` at the root. This includes first-time `npm install` of the (small) dependency set and committing `package-lock.json` (per `THREAT_MODEL.md` T-11).
7. **Directory skeleton:** the initially expected tree is `web/src/{tokens,components,views,mocks,routes,tests}` and it may be revised as long as P1's scope audit documents the change and rationale.
8. **Root `README.md`:** create it in P1 (not before), per `ASSUMPTIONS.md` A-11 rule, containing the C2 install/build/run commands (with the exact command chain verified once in this phase) and the doc index pointer to `docs/README.md`.

### Forbidden in P1
- **Backend code of any kind** — no server, no routes, no database files, no drizzle schemas, no SSE stubs; P1 is frontend-visual only (per plan Phase 1 and the approved P0 doc set).
- **Network code** — no fetch clients pointed at modeled backend endpoints and no SSE/WebSocket wiring; components consume mock data or show error/empty states (each of these fallback states must be pictured in the P1 review).
- **Dependency additions outside the agreed list** (`react`, `react-dom`, `react-router-dom`, `recharts` + dev/build tooling), per `DECISIONS.md`'s dependency budget section; anything beyond needs an amendment.
- **Database, migration, or persistence logic** — P4 scope.
- **Simulator/domain-core logic** — P2 scope, and the active data contract is not yet cut (per `DOMAIN.md`), so the mocks must avoid implying contract stability beyond the typed wrapper.
- **Motion that conflicts with "reduced motion only" preference** (plan's accessibility baseline) — no motion instances where a reduced-motion preference is honored, unless a review item explicitly requests one at P3.
- **Threat-model boundary changes** — no service, route, or rule that widens exposure beyond zone Z2 local-only per `THREAT_MODEL.md` §1.

## 2. Permissions carried into P2 (for reference, not activated)

P2 receives the entities and state machines from `DOMAIN.md` and the adapter contracts from `GATEHEAD.md` to build the domain core + simulator; its detailed permissions get proposed in P2's own `next-phase-handoff.md` in P2's scope audit — consistent with the scope-audit protocol, not pre-decided here.

## 3. Open questions for the project owner (needed before P1 starts)

- **Q-01:** Accept the **dependency-direction amendment** from F-02 (Gatehead policy-free; coordinator owns all policy; plan D3 rule-3 wording gets a follow-up amendment note in `OPENCODE_BUILD_PLAN.md` on approval)?
- **Q-02:** Accept the **entity-count resolution** from F-01 (canonical = 13 entities, with `CameraStream`/`Detection` as composition children of `Camera`)?
- **Q-03:** Confirm **DEC-009** session model (HttpOnly cookie; HTTPS-with-self-signed-or-internal-CA default off by default for LAN in P4 pending hardware/C2 packaging) and **DEC-010** ANPR delegation default (Frigate-first; ONNX fallback provisional)?
- **Q-04:** Confirm the **P1 permission model above**, or edit items before granting it (especially the dependency allowance and the `NEXT.md` mock-data rule).
