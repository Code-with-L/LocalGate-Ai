# LocalGate AI — OpenCode Build Plan

**Status:** Source of truth. Rev 2.1. Replaces all prior ad-hoc task lists.

**Amendment log:**
- **Amd 2.1** (owner-approved): clarified C5 to an explicit operating-mode enum (`SIMULATED | UNCONFIGURED | LIVE`) with health/connectivity/configuration/safety as separate dimensions; refined the D5 hold-to-confirm requirement to show safety-device freshness and reject stale/unknown status; defined dependency-budget accounting (direct production deps count, transitive reported, budget must not force risky custom code). No D-decision replaced.

Build a premium, local-first smart gate management platform. No physical hardware is available during initial development. Simulation is the default. Never represent simulated device state as real.

---

## Non-negotiable constraints

These bind every phase and every prompt issued to OpenCode. A phase that violates any of them must be rejected in review.

| # | Constraint | Meaning |
|---|------------|---------|
| C1 | Local-first | Everything runs on the installer's own machine. No mandatory SaaS, no cloud accounts, no telemetry leaving the site by default. |
| C2 | Reproducible local setup | The project runs from the repository with documented commands (`install`, `dev`, `test`, `lint`). Model files and other large async assets may be staged separately, but the pipeline must define exactly how. |
| C3 | Offline after staging | After dependencies and AI models are staged locally, the product must operate with the network cable unplugged except for LAN integrations. Offline is a *claim until proven* — no artifact may state it until Phase 6 verifies it with actual network-disabling tests. |
| C4 | No invented compatibility | No file, prompt, changelog, or commit message may claim support for a specific gate operator, camera, or board that was not verified against real hardware or a documented interface specification. |
| C5 | Never misrepresent state | Every adapter operates in exactly one explicit operating mode `SIMULATED \| UNCONFIGURED \| LIVE`, represented as a discriminated union (or equivalent invariant that makes contradictory combinations structurally impossible), with a persistent visual indicator in the GUI. Operating mode is one dimension only: health, connectivity, configuration validity, and safety-device status are separate modeled dimensions and must never be compressed into the mode enum — a LIVE adapter can be disconnected; a configured adapter can be unhealthy. |
| C6 | Small reviewable changes | One phase, one review checkpoint, human sign-off before the next phase begins. |

---

## The five architecture decisions (decided now, not later)

Agents drift to their favorite framework and re-architect per feature. The following decisions are made up front and OpenCode must implement *against* them, not around them.

### D1 — Constrained stack selection, justified by decision matrix

In P0 OpenCode selects the stack, but not freely. It must produce `docs/DECISIONS.md` containing, for each choice (language/runtime, frontend framework, backend framework, database, storage for event/snapshot exports):

- **Candidates considered** (minimum 3 per slot).
- **Decision criteria, weighted**: local-first operation, type safety across frontend/backend, migration tooling maturity, testability without hardware, dependency count and maintenance risk, audit-able path, offline capability, packaging/distribution feasibility.
- **Explicit rejection reasons** for each non-selected candidate.
- **Dependency budget**: the backend may not exceed 40 direct production dependencies without a reviewed amendment entry to `DECISIONS.md`. A *production dependency* is a direct runtime dependency declared for the deployed backend artifact; build/dev/test tooling is excluded from the budget but must be inventoried. Transitive dependencies do not count against the budget but must be reported and reviewed for risk. The budget is a governance limit, not an incentive: if staying under it would mean replacing a safe, maintained library with riskier custom code, take the dependency and record an amendment instead.

Constraints: frontend and backend must share the type definitions (single language or official same-language binding). The database must run as one local process or file (SQLite/Postgres-local/LevelDB-class) — no external DB service. Real-time communication (dashboard live view) must work over LAN without a cloud broker.

### D2 — Domain core defined in P0, before any screen exists

The core entities, their relationships, and event semantics are documented in `docs/DOMAIN.md` during P0 and are the authoritative reference for all later phases. Minimum required entities:

- `Site` (single installation; the plan targets one 4 m opening / ~200 kg sliding gate — *provisional*, never verified)
- `Gate` and `GateSession` (movement lifecycle: idle → opening → open → closing → idle, with fault-injected states)
- `Operator` (the physical controller adapter identity, configure-time only, absent in simulation)
- `VisitorCredential` (PIN: issuance → valid window → spent/expired/revoked; one-time vs multi-use limits)
- `PlateAuthorization` (allowlist/denylist entry with confidence and review state)
- `AccessDecision` (decision record referencing the credential/event that triggered it)
- `Camera`, `CameraStream`, `Detection` (person/vehicle/pet with bounding box and confidence)
- `SafetyDevice` (photocell, safety edge, interlock chain)
- `Fault` (operator, sensor, network, vision — enriched over time)
- `AuditRecord` (append-only, all other entities may be updated/deleted via normal lifecycle; audit records never)

Event semantics that must be pinned in P0:

- **Append-only audit trail**: `AuditRecords` are written forward-only. No update, no delete, no upsert. Retention and export are separate operations that never rewrite the audit table. Corrections to a *previous decision* are recorded as a **new** audit record referencing the earlier one, not an edit.
- Order of recording: a physical or access event writes (1) event, (2) access decision if any, (3) audit record, in that order, in one transaction-adjacent batch.
- Every event has a `source` (`simulated` | `live` | `imported`) and this flag is never reinterpreted after write.

### D3 — "Gatehead": the single hardware/device boundary, named and typed

`Gatehead` is the repository's name for the typed interface layer through which **all** interaction with physical or simulated devices flows. It is not a framework, not a plugin loader per se — it is a set of contracts the rest of the application depends on and never bypasses.

Required primary contracts (typed, versioned):

- `GateOperator` — submit `{open, close, stop}` commands; receive back `{accepted, rejected(reason)}`; position telemetry stream with a declared granularity (e.g. mm or percent, since the real operator is unknown — percent is the default).
- `Camera` — frame or stream endpoint + per-frame metadata (timestamp, source id, integrity marker).
- `SafetySensorSet` — photocell states, safety-edge states, interlock state, plus a `last_reported_at`.
- `AnprProvider` — input frame(s) → recognition result(s) with confidences and timestamps.

Rules:

1. The simulator implements the *same* contracts; nothing in the app knows which implementation is primed.
2. Hardware adapters may only be added after review of an explicit, verifiable interface specification. "It has a REST API" is not a specification.
3. No screen, service, or route calls a raw device socket, HTTP endpoint, or serial port directly. Everything goes through Gatehead, and Gatehead alone decides whether to consult the access-control service before acting.
4. **Actuation path — one, and only one**: `authenticate → authorize → validate request → check safety interlocks → record decision → issue command via the approved Gatehead adapter`. The order is: authenticate, authorize, validate, interlock-check, then **record decision**, then actuate. Recording happens *before* actuation, because a command that cannot be audited must not be issued. Snapshot/camera capture is a post-command evidence step, not a precondition — a failed snapshot must not silently cancel a safety-relevant command, and a successful snapshot must not bypass the audit step. This depends on storage semantics: where snapshots are stored (file, blob, event-attached) and whether the snapshot write is best-effort or blocking is decided in D1/D2 and pinned in `DOMAIN.md` — the default is: audit record accepts an optional `evidence_ref` that may be filled asynchronously, so actuation is never blocked by snapshot latency.
5. Interfaces evolve additively (new fields, new methods) — a breaking change to a Gatehead contract requires an explicit amendment entry in `DECISIONS.md`.

### D4 — Reliable time, timezone, and expiry semantics

Time is a common source of silent bugs in access systems. Decisions are pinned in P0 and appear in `DOMAIN.md`:

- **Server-authoritative timestamps**. The application server is the single time oracle for all business logic, event records, audit records, and PIN expiry evaluation. Clients never provide timestamps; they may provide time only as latency-bearing evidence, but their clocks are never used to decide whether a credential is valid.
- **PIN expiry is calendar-based, evaluated against server wall clock** in the server's configured timezone (explicit, stored in config, default UTC with a documented conversion). Monotonic clocks measure elapsed time (e.g. session idle, cooldown) but **cannot** independently determine calendar expiry — they are a supplementary check, never the authority.
- **Clock desynchronization or loss of wall clock** on the local server (battery failure, RTC reset, first boot before NTP) must be handled explicitly:
  - Gate operations do not stop because wall clock is unavailable, but credential evaluation in an unknown-clock state is conservative: PINs with a start time in the future relative to an untrusted clock are treated as not-yet-valid; expired-relative-to-past readings are treated as expired-uncertain and routed to manual review rather than auto-allowed.
  - A "clock sanity" event is emitted and surfaced in the Privacy Center when received time drifts from a monotonic measured window by more than a configured threshold.
- All persisted timestamps carry explicit timezone/UTC offsets and are stored as UTC; display localization is a presentation concern only.
- Logged event and audit records use server time; when reconciling with device-reported time, both times are recorded.

### D5 — One controlled actuation path, with a documented network exposure model for unauthenticated access

This is the only place where the system takes irreversible physical action.

- The single actuation path is the one described in D3 rule 4. There is no second path — no "quick toggle" endpoint, no direct simulator or hardware call from the UI, no shell command.
- The **visitor PIN entry point** is the only expected internet/LAN-exposed unauthenticated surface and therefore requires a separate, documented exposure design in `THREAT_MODEL.md` before implementation:
  - Network exposure model: which network it is exposed to (LAN-only by default; anything wider requires an amendment), what protocols/ports, TLS story, what the failure mode is for each.
  - Throttling: token-bucket or fixed-window per IP and per PIN-prefix; per-IP burst allowance; global rate limits that degrade gracefully into a single "try again later" state rather than per-request errors.
  - Lockout policy: per-PIN attempt counter with lockout after N failures; backoff; counter persisted across process restarts.
  - Anti-enumeration: PIN format declared (length, alphabet) but constant-time comparison, uniform error responses (same timing + response shape for "wrong PIN" vs "unknown PIN"), no per-PIN existence oracle.
  - Anti-replay: single-use PINs and multi-use PINs must not allow the same authorization window to be replayed after use; limits tracked with the same append-only audit trail ordering; timestamps are server-authoritative per D4.
- **Append-only audit is not tamper-proof by itself.** It is a complete-observation record, not an integrity guarantee. The threat model must state this distinction explicitly: audit records prevent silent deletion/rewrite at the application layer, not against an attacker with filesystem or database-admin access. What is possible instead: hash-chaining (documented, optional), export-to-append-only-file (documented), and any "tamper-evident" claim must be individually justified against a named attacker model, never assumed.
- Manual control via the dashboard: the operator must also be able to trigger open/close/halt directly, and that path uses the same single actuation path, is rate-limited, is logged, and is flagged in the audit record as `manual` rather than `automated`. For safety, open/close commands issued from the GUI must require a brief hold-to-confirm interaction. The confirmation panel must show each relevant safety device's **current status and its freshness** (`last_reported_at` against a configured staleness threshold); dispatch must be **rejected** while safety status is stale or unknown rather than implied-safe from an earlier reading. Hold-to-confirm is an additional human-factors safeguard, not a substitute for physical interlocks or the operator's own safety mechanisms, and it must not be applied to routine, non-actuating actions.

---

## Phases

### P0 — Discovery and domain architecture

**Goal:** A complete, reviewable plan with zero implementation. The repo may already contain code from prior sessions or a novel state — inspect first.

**Deliverables (all in the repo, nothing executable):**
- `docs/RECON.md`: repository inventory (what files exist, current state, dead code, prior session state, scripts).
- `docs/REQUIREMENTS.md`: expanded from the feature matrix; every feature mapped to the entities it reads/writes and the Gatehead contracts it needs.
- `docs/DOMAIN.md`: core entity/relationship model, event semantics, append-only audit rules, time semantics (per D2/D4), state machine definitions (gate lifecycle, credential lifecycle, decision lifecycle).
- `docs/GATEHEAD.md`: typed contract definitions per D3, the actuation path with its exact sequence, and versioning rules.
- `docs/THREAT_MODEL.md`: trust boundaries, data flow diagram, per-feature threat list, visitor-PIN exposure model per D5, threats to the audit trail (including the note in D5 that append-only ≠ tamper-proof), and a list of threats explicitly **not** modeled (e.g. firmware compromise of the controller).
- `docs/DECISIONS.md`: decision matrix and choices per D1, plus the first entries in the decision register.
- `docs/ASSUMPTIONS.md`: every claim made without evidence (mechanical specs, camera placement, network topology, operator model, etc.) listed as `provisional` with a planned verification step.
- Empty `docs/README.md` index.
- `docs/NEXT.md`: prescribed contents that P1 will need to *review against* (naming conventions, terminal framework commands, directory layout skeleton), so P1's first commit can be checked against it.

**Allowed:** reading the repo, creating or reorganizing `docs/`, running read-only commands.
**Forbidden:** installing dependencies, creating app code, generating tests, generating screenshots or preview assets, upgrading anything, cleanup work.

**Review gate for user:** Inspect P0's output. Confirm stack, model, threat model coverage, and assumptions are credible. Only then authorize P1.

---

### P1 — Premium design system

**Goal:** A responsive, premium dark security dashboard shell and a design system, with no live or simulated complex behavior.

**Deliverables:**
- Design tokens (color, type, spacing, elevation, motion) file(s).
- Core component library: button, card, table, chart (axis, tooltip, colorblind-safe palettes), status indicator (state, fault, simulated-not-configured-live indicator), form input, badge, modal, toast, empty-state, loading skeleton, error boundary page.
- Navigation shell (primary, secondary, feature-matrix routes for all 12 features, responsive breakpoints).
- Mock-data registry: every screen reads from one documented mock source where each entry is clearly typed as simulated per C5. Reusing the type definitions from the D1 decisions is a hard requirement.
- Accessibility: keyboard navigation, focus management, contrast, ARIA labels for state indicators.
- `docs/DESIGN.md`: tokens, components, and interaction rules.

**Forbidden:** business logic, network calls, persistence, device or model loading, random "demo" data not marked simulated.

**Scope-audit** (see "The scope-audit rule" below).

---

### P2 — Domain core and simulator

**Goal:** The rules of the system, provable without any screen or device.

**Deliverables:**
- Domain logic implementing `DOMAIN.md`: gate lifecycle, credential lifecycle (issue/validate/spend/expire/revoke), plate authorization, decision recording, audit writes, time semantics.
- Gatehead simulator implementations per D3 (virtual gate operator, virtual cameras, virtual safety sensors, virtual ANPR provider), plus a scripted scenario runner.
- Fault injection: sensor failure, network loss, clock drift (per D4), out-of-range ANPR confidence, duplicate events, out-of-order events.
- Test suite proving each behavior against simulated devices only.

**Forbidden:** live device code paths, network listeners, real password hashing or PIN storage. Simulation tools must not accidentally acquire them.

**Scope-audit**.

---

### P3 — Dashboard and workflows

**Goal:** Every screen operates from real application services (via P2 domain core and the simulator), not mock data.

**Deliverables:**
- All 12 feature views wired to real services.
- Handling for loading, error, offline, unauthorized, fault, and simulated/live indicator states.
- Live dashboard view fed from simulated Gatehead streams.
- Simulation Lab UI (run scenario, pause, step, reset).

**Forbidden:** persistence (comes in P4), real credentials, live integrations.

**Scope-audit**.

---

### P4 — Persistence and access security

**Goal:** The system can protect its own data.

**Deliverables:**
- Database, schema, migrations (forward-only, testable up/down/replay).
- Access service: authentication (documented argon2-class parameters, per D1 constraints — no unsalted MD5/SHA1), role-based authorization, secure session handling, CSRF handling.
- Visitor PIN lifecycle wired to the persistence layer and governing exposure model in `THREAT_MODEL.md`, including throttling, lockout, constant-time comparisons.
- Audit record persistence enforcing the append-only semantics of D2.
- Retention policy engine; backup and restore procedure, tested in CI.

**Forbidden:** any live integration; any hardcoded secret; any file where a real credential could leak via examples.

**Scope-audit**.

---

### P5 — Local integrations

**Goal:** Interfaces for real-world systems exist, are typed, and are validated — with nothing live.

**Deliverables:**
- Adapter interfaces and mock implementations for Frigate, Home Assistant, an ANPR model harness (model files staged locally when available), camera streams, and controller telemetry.
- `docs/INTEGRATIONS.md`: exact behaviors, expected response shapes, offline behavior, configuration validation rules, and — where relevant — which claims are *provisional* until hardware is acquired.
- Configuration validation with fail-closed behavior: missing hardware or credentials make the corresponding feature return `unconfigured` cleanly and visibly in the UI.
- Contract tests for each adapter against recordings/fixtures; no network calls in tests.

**Forbidden:** live actuation. No real device connection without a hardware-specific review the user authorizes separately.

**Scope-audit**.

---

### P6 — Independent audit and release gate

**Goal:** Prove the plan's claims or retire them.

**Deliverables:**
- Security review against `THREAT_MODEL.md` (session handling, PIN flow, injection, host-based threats, dependency audit).
- Safety-boundary review: verify no code path outside the single actuation path can issue a command; verify interlock preconditions; verify the audit-before-actuate ordering.
- Offline-operation verification: scripted tests with network disabled; only then may any artifact claim offline capability, with a link to the test.
- Accessibility audit and performance baseline (startup, dashboard refresh, ANPR-inference path).
- Dependency inventory and risk check; reproducible release build; checksummed artifacts.
- `docs/RELEASE.md`: installation, upgrade from prior version (if any), known gaps, hardware commissioning preconditions.
- Hardened README for users (not just developers): install, first run, simulation mode, security of the local host, backup/restore, troubleshooting.
- A regression test suite running against simulated data with no hardware.

**Required outputs:**
- `docs/COMMISSIONING.md` — hardware-readiness matrix and commissioning checklist.

**Forbidden:** enabling any real actuation path. Nothing in this phase sells the software as hardware-ready.

**Scope-audit.**

---

### The scope-audit rule

At the close of every phase, the implementing agent produces a scope audit written to `docs/scope-audit/P<N>.md` (e.g. `docs/scope-audit/P2.md`). The scope-audit rule has a specific, bounded prohibition:

> A scope audit must not forbid documentation that a phase's own deliverables require. It must prohibit documentation unrelated to the phase's deliverables, dependency upgrades, cleanup of unrelated code, and new feature work.

Each scope audit must answer; the next phase may not start until they are answered:

1. What changed? Does every change belong to this phase's deliverables?
2. Which tests actually ran (paste command and pass/fail/did-not-run counts)? Which remain unverified?
3. Name the three most important uncertainties across **security**, **safety**, and **performance** identified in this phase. Record them as open items, do not guess.
4. Is there any path that bypasses Gatehead, authorization, or the simulator/hardware separation? Search for it; report findings or state clearly that none was found.
5. This phase's scope audit governs the next phase: state explicitly what the next phase is allowed to touch and what it is forbidden to touch.
6. At most one blocking question to the user — only if proceeding safely requires the answer. Otherwise, none.

Scope-audit findings belong in `docs/scope-audit/P<N>.md`; the next phase's permission boundaries are carried in `docs/NEXT.md` (updated by each scope audit) rather than scattered through the codebase.

---

## Delivery rules

- Work in small reviewable changes; one phase per review window.
- Run relevant tests and builds after each phase; report real output, not summaries of intent.
- Report files changed, commands run, test results, known gaps, risks, and the next proposed step.
- Never invent test results, benchmark numbers, or hardware compatibility.
- If a task changes any decision (D1–D5) or the content in `DOMAIN.md`, `GATEHEAD.md`, or `THREAT_MODEL.md`, it must state the change explicitly in the phase report with a justification. Silence means "no changes made" in review.
