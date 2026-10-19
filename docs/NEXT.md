# NEXT — Handoff After P0

**Status:** P0 review complete (owner ruled 2026-10-19). P0 decisions are recorded in `docs/DECISIONS.md` § "P0 review outcomes" and plan Amd 2.2 is applied in `docs/OPENCODE_BUILD_PLAN.md`. **P1 is authorized under the permissions below.** This version supersedes the pre-review proposal.

---

## 1. Review record (owner answers)

| Question | Outcome |
|---|---|
| Q-01 (Gatehead policy-free amendment, F-02) | **Approved.** Gatehead stays policy-free; the Actuation Coordinator owns the controlled actuation workflow and depends on the authorization service + Gatehead. Plan D3 rule 3 rewritten by **Amd 2.2**; original wording preserved in the plan's amendment log. |
| Q-02 (canonical 13 entities, F-01) | **Approved.** 13 canonical entities; `CameraStream` and `Detection` remain distinct entities with composition relations — documentation grouping must not erase their identities or lifecycles. |
| Q-03 (DEC-009 sessions, DEC-010 ANPR) | **Conditional approval.** DEC-009: HttpOnly same-origin cookies with CSRF and appropriate `Secure`/`SameSite`; **HTTPS required for LAN-facing authenticated sessions** (documented cert-trust/enrollment approach); plain HTTP only for loopback-only development, never the default. DEC-010: Frigate-first approved; standalone ONNX is a provisional fallback pending model selection/benchmarking/packaging tests; "Frigate configured" never implies "ANPR available/accurate". Detailed conditions in `docs/DECISIONS.md`. |
| Q-04 (P1 permission model) | **Approved with one correction:** the original route list had 6 placeholder screens but the plan (Phase 1, "feature-matrix routes for all 12 features") requires 12 feature destinations. Reconciled in §2 below — all destinations are carried, none silently dropped. |

## 2. P1 permissions (binding)

### Allowed
1. **Design-token foundation:** create `web/src/tokens/` as a minimal directory (`tokens.css` for CSS custom properties, `README.md` for token rules) — color palette (with an accessible dark default), typography scale, spacing scale, radii, elevation/z-index, motion durations, state colors (normal / warning / critical), and simulation/live visual indicators (C5's persistent badge styles).
2. **Colorblind-safe palette:** the default dark palette must pass a colorblind-safe check for its state colors (normal / warning / critical distinguishable without relying on hue alone — include at least shape/label redundancy in component CSS variables), verified at P1 review, not just promised.
3. **Mock data registry:** create `web/src/mocks/` — a lightweight type-safe mock-data registry, each object explicitly typed as a `Simulated*` wrapper with an explicit `source` field. Mocks are **not** production domain types and must not shadow them.
4. **Component scaffolding:** `web/src/components/` — shell layout, cards, tables, status badges, hold-to-confirm button (per Amd 2.1; UI logic shell only, **no backend safety dispatch**), charts using **Recharts**, empty/error/skeleton states, and refuses-callback handling on data-driven components so a null/malformed prop is always surfaced, never silently rendered. Components are typed and free of business logic;
5. **Navigation shell — 12-feature reconciliation (Q-04 correction, binding):** routing skeleton (`react-router-dom`) must cover **all 12 feature destinations**. The only enumerated 12-feature list on record is the owner's pre-plan feature enumeration; the map below is the reconciled manifest. Merges and deferrals are explicit — nothing is silently dropped:

   | # | Feature destination | Route | Notes |
   |---|---|---|---|
   | 1 | Dashboard (incl. manual gate controls + live telemetry) | `/dashboard` | Manual control lives inside the dashboard per plan D5; **hold-to-confirm must not dispatch** in P1. |
   | 2 | Access control (decisions & authorizations) | `/access` | Read-only mock surface; auth flows themselves are P4. |
   | 3 | Camera integration (streams & detections) | `/cameras` | Mock frames/detections only; camera connectivity is P5. |
   | 4 | PIN verification | `/credentials` (status section) | The PIN endpoint itself is an unauthenticated public surface (P4); its monitoring section lives here. Explicit destination, not dropped. |
   | 5 | Credentials (visitor credential lifecycle) | `/credentials` | Merged with destination 4 into one route — the merge is declared, both destinations remain. |
   | 6 | Audit (records & export) | `/audit` | Export is UI shell only; real export is P4/P6. |
   | 7 | Admin (operators & roles) | `/operators` | Multi-user surface; login/auth flows again P4. |
   | 8 | Simulator control | `/simulator` | Placeholder per plan Phase 1; the Simulation Lab UI itself is P3. |
   | 9 | Activity (sessions & visit history) | `/activity` | Mock timeline. |
   | 10 | Messaging & notifications | `/messaging` | **Behavior is deferred with reason** (per `REQUIREMENTS.md` deferred list — no claim until hardware commissioning); route shows an explicit deferred/empty state. Explicit destination, not dropped. |
   | 11 | Config (site, devices, retention, maintenance reads) | `/config` | Read-only mock config views; write paths are P4. |
   | — | *(supporting, beyond the 12)* Devices & adapter status panel | `/devices` | REQUIRED surfaces from `REQUIREMENTS.md` AC-F5.3/AC-F8.3 (Gatehead adapter status, commissioning panel); declared openly as an extra destination mandated by P0 docs, not part of the owner's 12. |

6. **Project scaffolding:** create `package.json`, Vite config, TypeScript config, ESLint + Prettier config, and run the reproducible install/test/build commands so that C2's "one documented command chain" is verified and stated in root `README.md`. Includes first-time `npm install` of the dependency set and committing `package-lock.json` (per `THREAT_MODEL.md` T-11).
7. **Directory skeleton:** `web/src/{tokens,components,views,mocks,routes,tests}`; revisions allowed if documented in `docs/scope-audit/P1.md`.
8. **Root `README.md`** with the verified C2 command chain and pointer to `docs/README.md`.
9. **Tests:** unit tests (Vitest) proving components render from mocks, the hold-to-confirm component rejects stale/unknown inputs and has no dispatch side-effect, and navigation covers every route in the §2 table. Build + tests must actually run and pass in this phase; no invented results.

### Forbidden in P1
- **Backend code of any kind** — no server, routes, database files, drizzle schemas, or SSE stubs.
- **Network code** — no fetch clients against modeled endpoints; components consume mocks or show error/empty states, all shown at P1 review.
- **DEC-009/DEC-010 features** — no HTTPS/CSRF/session/ANPR implementation in P1; DEC-009 implementation is P4, DEC-010 is P5 (binding owner condition).
- **Dependencies outside the agreed list** (`react`, `react-dom`, `react-router-dom`, `recharts` + dev/build/test tooling); additions need an amendment.
- **Database, migration, or persistence logic** — P4 scope.
- **Simulator/domain-core logic** — P2 scope; mocks must not imply contract stability beyond the typed wrapper.
- **Representing simulated state as real** — every mock-driven surface keeps its visible `Simulated*` provenance (C5 badge styles); no screen may blur the line.
- **Motion that conflicts with the reduced-motion baseline**, unless a later review explicitly grants it.
- **Threat-model boundary changes** — nothing beyond zone Z2 local-only per `THREAT_MODEL.md` §1.

## 3. Carried into P2 (reference, not activated)

P2 receives the entities/state machines from `DOMAIN.md` and adapter contracts from `GATEHEAD.md` for the domain core + simulator. Its detailed permissions are proposed in P2's own scope-audit handoff, per the scope-audit protocol.
