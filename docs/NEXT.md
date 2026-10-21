# NEXT — Handoff After P0

**Status:** P0 review complete (owner ruled 2026-10-19). P0 decisions are recorded in `docs/DECISIONS.md` § "P0 review outcomes" and plan Amd 2.2 is applied in `docs/OPENCODE_BUILD_PLAN.md`. **P1 and P2 are authorized** under the permissions below; P2 is executed and recorded in `docs/scope-audit/P2.md`. The P2 owner review produced nine findings; **Bucket A (A1–A5) corrections are implemented and self-verified, and P2 sign-off is pending the owner's re-review** (§6). This version supersedes the pre-review proposal.

---

## 1. Review record (owner answers)

| Question                                    | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01 (Gatehead policy-free amendment, F-02) | **Approved.** Gatehead stays policy-free; the Actuation Coordinator owns the controlled actuation workflow and depends on the authorization service + Gatehead. Plan D3 rule 3 rewritten by **Amd 2.2**; original wording preserved in the plan's amendment log.                                                                                                                                                                                                                                                                  |
| Q-02 (canonical 13 entities, F-01)          | **Approved.** 13 canonical entities; `CameraStream` and `Detection` remain distinct entities with composition relations — documentation grouping must not erase their identities or lifecycles.                                                                                                                                                                                                                                                                                                                                   |
| Q-03 (DEC-009 sessions, DEC-010 ANPR)       | **Conditional approval.** DEC-009: HttpOnly same-origin cookies with CSRF and appropriate `Secure`/`SameSite`; **HTTPS required for LAN-facing authenticated sessions** (documented cert-trust/enrollment approach); plain HTTP only for loopback-only development, never the default. DEC-010: Frigate-first approved; standalone ONNX is a provisional fallback pending model selection/benchmarking/packaging tests; "Frigate configured" never implies "ANPR available/accurate". Detailed conditions in `docs/DECISIONS.md`. |
| Q-04 (P1 permission model)                  | **Approved with one correction:** the original route list had 6 placeholder screens but the plan (Phase 1, "feature-matrix routes for all 12 features") requires 12 feature destinations. Reconciled in §2 below — all destinations are carried, none silently dropped.                                                                                                                                                                                                                                                           |

## 2. P1 permissions (binding)

### Allowed

1. **Design-token foundation:** create `web/src/tokens/` as a minimal directory (`tokens.css` for CSS custom properties, `README.md` for token rules) — color palette (with an accessible dark default), typography scale, spacing scale, radii, elevation/z-index, motion durations, state colors (normal / warning / critical), and simulation/live visual indicators (C5's persistent badge styles).
2. **Colorblind-safe palette:** the default dark palette must pass a colorblind-safe check for its state colors (normal / warning / critical distinguishable without relying on hue alone — include at least shape/label redundancy in component CSS variables), verified at P1 review, not just promised.
3. **Mock data registry:** create `web/src/mocks/` — a lightweight type-safe mock-data registry, each object explicitly typed as a `Simulated*` wrapper with an explicit `source` field. Mocks are **not** production domain types and must not shadow them.
4. **Component scaffolding:** `web/src/components/` — shell layout, cards, tables, status badges, hold-to-confirm button (per Amd 2.1; UI logic shell only, **no backend safety dispatch**), charts using **Recharts**, empty/error/skeleton states, and refuses-callback handling on data-driven components so a null/malformed prop is always surfaced, never silently rendered. Components are typed and free of business logic;
5. **Navigation shell — 12-feature reconciliation (Q-04 correction, binding):** routing skeleton (`react-router-dom`) must cover **all 12 feature destinations**. The only enumerated 12-feature list on record is the owner's pre-plan feature enumeration; the map below is the reconciled manifest. Merges and deferrals are explicit — nothing is silently dropped:

   | #   | Feature destination                                          | Route                           | Notes                                                                                                                                                                                                |
   | --- | ------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 1   | Dashboard (incl. manual gate controls + live telemetry)      | `/dashboard`                    | Manual control lives inside the dashboard per plan D5; **hold-to-confirm must not dispatch** in P1.                                                                                                  |
   | 2   | Access control (decisions & authorizations)                  | `/access`                       | Read-only mock surface; auth flows themselves are P4.                                                                                                                                                |
   | 3   | Camera integration (streams & detections)                    | `/cameras`                      | Mock frames/detections only; camera connectivity is P5.                                                                                                                                              |
   | 4   | PIN verification                                             | `/credentials` (status section) | The PIN endpoint itself is an unauthenticated public surface (P4); its monitoring section lives here. Explicit destination, not dropped.                                                             |
   | 5   | Credentials (visitor credential lifecycle)                   | `/credentials`                  | Merged with destination 4 into one route — the merge is declared, both destinations remain.                                                                                                          |
   | 6   | Audit (records & export)                                     | `/audit`                        | Export is UI shell only; real export is P4/P6.                                                                                                                                                       |
   | 7   | Admin (operators & roles)                                    | `/operators`                    | Multi-user surface; login/auth flows again P4.                                                                                                                                                       |
   | 8   | Simulator control                                            | `/simulator`                    | Placeholder per plan Phase 1; the Simulation Lab UI itself is P3.                                                                                                                                    |
   | 9   | Activity (sessions & visit history)                          | `/activity`                     | Mock timeline.                                                                                                                                                                                       |
   | 10  | Messaging & notifications                                    | `/messaging`                    | **Behavior is deferred with reason** (per `REQUIREMENTS.md` deferred list — no claim until hardware commissioning); route shows an explicit deferred/empty state. Explicit destination, not dropped. |
   | 11  | Config (site, devices, retention, maintenance reads)         | `/config`                       | Read-only mock config views; write paths are P4.                                                                                                                                                     |
   | —   | _(supporting, beyond the 12)_ Devices & adapter status panel | `/devices`                      | REQUIRED surfaces from `REQUIREMENTS.md` AC-F5.3/AC-F8.3 (Gatehead adapter status, commissioning panel); declared openly as an extra destination mandated by P0 docs, not part of the owner's 12.    |

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

---

# NEXT, part 2 — Handoff After P1 (2026-10-19)

## 4. P1 execution record (summary)

P1 is **code complete and self-audited**; every permission in §2 above was exercised exactly and nothing was silently dropped. Full evidence: `docs/scope-audit/P1.md`.

Verified state at handoff: `npm install` → `npm test` (3 files / 43 tests pass) → `npm run lint` (clean) → `npm run format:check` (clean) → `npm run build` (green, ~577 kB bundle).

Deliverables:

- Design-token foundation + colorblind-safe state system (`web/src/tokens/`, spec in `docs/DESIGN.md`).
- Typed `Simulated<T>` mock registry (`web/src/mocks/`) — provenance wrapper, never production types.
- Component kit with hold-to-confirm (refuses stale/unknown safety state, zero dispatch) and refused/empty/loading states (`web/src/components/`).
- Navigation shell covering all 12 owner destinations + supporting `/devices`, with build-time manifest validation (`web/src/routes/nav-config.ts`).
- Three test suites (mock shapes incl. no fabricated fields; hold safety incl. no keyboard bypass; full route render incl. redirect).
- Root `README.md` with the verified command chain; `docs/DESIGN.md`; `docs/scope-audit/P1.md`.

Deviations and open items for the owner (details in the P1 audit §4/§7):

- **D-P1-1:** Dashboard route corrected from `/` to the binding `/dashboard` (bare root is now an explicit redirect). Manifest validator enforces binding paths going forward.
- **D-P1-2:** 5 npm audit findings live in the dependency tree (2 critical — `tinypool` RCE gadget and `vitest` mocker path traversal — are dev/test-only, never shipped; 1 moderate in `react-router-dom` is a client-side open-redirect in a loopback-local app). `npm audit fix --force` was deliberately **not** run (breaking major updates). Remediation proposed at P2 toolchain refresh.
- **D-P1-3:** Recharts exceeds the default 500 kB chunk warning; acceptable for LAN-served UI, `import()` code-split proposed as optional P2 polish.

## 5. P2 handoff proposal (authorized — execution record in `docs/scope-audit/P2.md`)

**P2 authorized** by the project owner; the permissions below were exercised as written. Per-permission evidence, deviations (D-P2-1 … D-P2-4), and the full test/toolchain record live in `docs/scope-audit/P2.md`.

P2 per the plan: **domain core + simulator** — the behavioral engine that P1's UI will later talk to. Permissions, mirroring the P1 model:

1. **Domain core (`web/src/domain/`):** pure-TypeScript translation of `DOMAIN.md`'s 13 canonical entities — types, state machines (gate motion cycle, credential lifecycle, operator modes), invariants, and typed events. No React, no I/O, no time-fudging: time is injected.
2. **Simulator engine (`web/src/simulator/`):** drives real instances of the domain core classes through generated timelines (visitors, decisions, telemetry). This is the first real logic replacing mock data — **mocks stay until the simulator UI land (P3)**, then get wired to the engine behind tested contracts. Simulated provenance labels remain everywhere: the simulator is honest simulation, never claimed real (C5/D3 unconditional).
3. **Safety interlocks as rules, not hooks:** the hold-to-confirm safety gate gets a real domain-side equivalent that the P1 UI shell can already honor — the UI change is a one-line data-source swap behind the existing test contract.
4. **Property-based tests** for state machines (gate never activates while safety obstructed; credentials never active outside their window; audit event for every decision) — complementing, not replacing, the vitest suite.
5. **Toolchain refresh:** non-breaking patch/devDependency updates, incl. remediation attempt for the P1 audit findings (D-P1-2) without `--force`.

Forbidden in P2 (unchanged): no Gatehead adapter wiring (P3), no backend/network/persistence (P4), no real camera/ANPR (P5), no physical-hardware assumptions. Additions or changes to §5 above require an amendment like Amd 2.x. P2 execution stayed inside these bounds; the forbidden-scope search evidence is in `docs/scope-audit/P2.md` §5.

Open items carried to P3: D-P2-1 (UI safety data-source swap deferred to P3), D-P2-2 (hand-rolled property checks instead of an external library), D-P2-3 (5 npm audit findings remain; all fixes are semver-major), D-P2-4 (enum casing canonicalized in code).

---

# NEXT, part 3 — P2 owner review and Bucket A correction (2026-10-21)

## 6. Bucket A outcome (implemented, awaiting P2 sign-off)

The P2 review raised nine findings. Findings 4–9 are accepted as carried work (§7); findings 1–3 and 6 are corrected here. Bucket A stayed inside the P2 scope: no Gatehead adapter wiring, no backend/network/persistence, no real hardware.

**A1 — clock-skew upper bound (finding 1).** `SAFETY_CLOCK_SKEW_TOLERANCE_MS = 3000` is exported from `web/src/domain/safety-device.ts:8`. Both freshness paths now reject future-dated reports rather than treating them as fresh:

- `evaluateSafetyReport()` returns the new typed error kind `{ kind: "safety-timestamp-future"; reportedAtUtc; skewToleranceMs }` when `lastMs - nowMs > SAFETY_CLOCK_SKEW_TOLERANCE_MS`. The check sits after the NaN guard and before the existing staleness comparison (`:129`), which remains strict `>`.
- `recordSafetyReport()` applies the symmetric guard when `reportedMs - nowMs > SAFETY_CLOCK_SKEW_TOLERANCE_MS`, so a future-dated report cannot be stored.
- `GateCoordinator.readSafety()` maps the condition to `safety_unknown` (never fresh, never throwing). Its stale comparison keeps `>=` (`stalenessThresholdMs` is inclusive there), which is intentionally different from `evaluateSafetyReport()`'s strict `>`; entity tests pin the `>` boundary (exactly tolerance is accepted, tolerance + 1 ms is `safety-timestamp-future`).

**A2 — no implicit audit failure (finding 2).** A private `appendAuditSafe()` wraps `appendAudit()`: it converts either a returned `AuditError` or an empty `auditId` or a thrown store failure into `Result<AuditRecord, "audit_unavailable">`. The empty-string audit-id projection is gone from both the grant and the denial path.

- Grant path: a failed `OPEN_GATE_ISSUED` write now raises a CRITICAL `AUDIT_WRITE_FAILED` fault and returns `{ kind: "REFUSED", reason: "audit_unavailable" }` **before** any decision record or command exists. `REFUSED` carries no decision, so `decision.ts` is unchanged.
- Dispatch path: `OPEN_GATE_DISPATCH` is now written write-ahead. If that write fails, the already-committed decision stands (never silently removed) and the outcome is `GRANTED` with `dispatch: "NOT_ATTEMPTED"`, `ack: null`, and a CRITICAL `AUDIT_WRITE_FAILED` fault. Deliberate consequence: an `OPEN_GATE_DISPATCH` record can exist for a command that was never sent. Treat that action as "dispatch attempted" — the record is a crash-durable intent trail, not proof of transmission.
- Denial path: a failed denial audit write returns `{ kind: "REFUSED", reason: "audit_unavailable" }` (not `DENIED`), with a CRITICAL `AUDIT_WRITE_FAILED` fault and `correlationId: null`, and writes no decision.

**A3 — honest grant shape (finding 3).** `GRANTED` is extended to `{ kind: "GRANTED"; dispatch: "ACKED" | "UNREACHABLE" | "NOT_ATTEMPTED"; ack: GateOperatorAck | null; decision: AccessDecision }`.

- `ACKED` — the adapter acknowledged; `ack` is populated.
- `UNREACHABLE` — the adapter rejected or threw; `ack` is `null`, the pending dispatch is retained, and the existing `OPERATOR_UNREACHABLE`/`STATE_CLAIM_MISMATCH` fault is raised.
- `NOT_ATTEMPTED` — authorized but deliberately not sent (currently only the write-ahead dispatch-audit failure above).
- Ordering is unchanged: the decision is committed before actuation, so an actuation failure can never retract an authorization record.
- `dispatchedAtServerUtc` is now the single `dispatchAtMs` sample that also stamps `pending.issuedAtMs`, so it is honest only when `dispatch === "ACKED"`; consumers must read `dispatch` rather than assume a command moment.
- `dispatchTimeoutMs` is still configuration-only: the coordinator records it but performs no timeout enforcement.

**A4 — safety attribution (finding 6).** `raiseFault()` now reports `safetyDeviceId: null` on every path. The simulator's `device_type` is never converted into a device identity; real identity registration is P3 work.

**A5 — explicit invariant tests (finding 7).** `fast-check` stays deferred (D-P2-2). Added to `web/src/tests/coordinator.test.ts`: a future-dated safety denial (`reportSkewMs = -60_000` → `DENIED`/`safety_unknown`, no state change), an `UNREACHABLE` dispatch assertion on the disconnected operator, and three audit-failure cases (issue-write, dispatch-write, denial-write) driven by a new `failAuditAfter(system, allowedPushes)` helper that makes the simulated audit store throw past a chosen write. `web/src/tests/sim-contracts.test.ts` now also asserts `dispatch === "UNREACHABLE"`; `web/src/tests/entities.test.ts` pins the A1 boundary on both `evaluateSafetyReport()` and `recordSafetyReport()`. A5(b) needed no new test: `credential.test.ts` already asserts `ok === false` for expired, revoked, and exhausted credentials — that eligibility rule is simply not yet wired into the coordinator (B1).

Also updated: `coordinator.ts` runtime imports/`DispatchStatus`/`CoordinatorRefusalReason`; existing `GRANTED` consumers in tests were narrowed to the new fields. Verified at handoff: `npx tsc --noEmit` clean, `npm run lint` clean, `npm run format:check` clean, `npm test` green apart from the pre-existing hold-to-confirm flake (C2), `npm run build` green.

## 7. Carried corrective work (not in Bucket A)

- **B1 (P4, finding 5):** credential eligibility lives outside coordinator authorization. Required order: lookup → status/validity/revocation/use-count → atomic consumption → decision → audit. The authorize callback must return a credential decision, not a bare boolean.
- **B2 (P5, finding 4):** post-command evidence is not connected to decisions. Evidence starts `pending`, updates asynchronously through a defined path, and a snapshot failure must neither retract the decision nor bypass its audit record. P3 must not fake live evidence.
- **B3 (P6):** persistence-backed audit. Until then the A2 guarantees are process-local; a crash between decision commit and audit flush can still lose the ledger tail.
- **C1 (finding 9):** dependency remediation stays an isolated change (`vitest@5`, `react-router-dom@7` are semver-major) with a full regression run and a post-upgrade audit.
- **C2 (finding 8):** the hold-to-confirm test in `web/src/tests/hold-and-badges.test.tsx` is timing-sensitive on real timers. Fix by fake timers with explicit advancement, or document a real-timer contract that the suite actually honors.

P3 (Gatehead adapters + simulator UI wiring) remains blocked pending separate explicit owner authorization.
