# P0 Requirements — Mapped Features (Section IV of the invention, plan section II)

**Status:** Proposed for P0 review.
**Purpose:** turn the plan's 12-feature list into per-feature acceptance criteria tied to `DOMAIN.md` (entities) and `GATEHEAD.md` (contracts), without inventing ports, thresholds, or hardware behaviors. Any numeric/threshold value used here lives in **site configuration**, not code.

---

## F1. Dashboard

**Role:** the GUI is the primary control surface per plan Phase 3.
- Entities exercised: `Gate`, `GateSession`, `AccessDecision`, `SafetyDevice`, `Fault`, `Camera`, `Detection` (read paths), `AuditRecord` (export).
- Acceptance criteria:
  - AC-F1.1 The dashboard uses only the operating-mode enum (`SIMULATED | UNCONFIGURED | LIVE`) from `DOMAIN.md` §0; it does not render an actuation state or device health conflated with mode.
  - AC-F1.2 Issuing open/close/halt requires the hold-to-confirm interaction (Amd 2.1) and shows per-safety-device status + `last_reported_at` vs staleness threshold; **dispatch is rejected** if stale/unknown.
  - AC-F1.3 Every command submitted from the dashboard creates a `GateSession` (when a session is not already open) and a `PATCH`-style decision record — see AC-F2.2 for the decision invariant.
  - AC-F1.4 The dashboard makes no cloud call in any mode (telemetry is SSE over the local backend); C3 Compliance is checked in P6, but the architecture makes the call no-op by design (fail → recreate client-local connection only).

## F2. Gate-operation APIs (4 would-be flows)

Two inbound flows: (a) dashboard operator controls, (b) guest credential journeys. The API surface is deliberately small: session start / extend, command actuation, status (SSE), audit export, credential mgmt (maintenance only), config (maintenance only).

- AC-F2.1 **Single actuation path** invariant (D5): all flows reduce to the coordinator sequence authenticate → authorize → validate → safety check → record decision → dispatch via Gatehead. No route bypasses it. Testable: stub-check via unit + integration tests in P4, loaded detail in P6 release gate.
- AC-F2.2 **Every actuation has one `AccessDecision` row**, terminal, immutable, referenced by ≥1 `AuditRecord` row (`audit_record_id`), carrying `evidence_ref` (filled asynchronously post-command, per F-05).
- AC-F2.3 **Visitor PIN journeys use only LAN-local network access to the PIN endpoint** (plan D5 hardened endpoint; rate-limited). Acceptance in P4 covers: lockout, anti-enumeration, replay-window per credential, lockout of repeating attempts on same PIN from same IP/device.
- AC-F2.4 **Session semantics per `DOMAIN.md` §2.4:** default 10-minute inactivity timeout, configurable; re-entry refreshes; session-create and session-close are individually audited.
- AC-F2.5 **Data-retention/maintenance UI** presents settings (camera stream retention, credential expiry, audit export), never a "erase everything" — preserving audit integrity is D2-forward-only, and the maintenance tool writes new correction rows, never deletes.

## F3. Access-control layer

- AC-F3.1 Authentication is per-operator scrypt-hashed passkey (DEC-008 parameters) and per-session HttpOnly cookie (SameSite=Strict). No token storage in `localStorage`.
- AC-F3.2 Authorization is role-based (`ADMIN`/`OPERATOR` per `DOMAIN.md` §2.5) enforced at the Fastify route level before the coordinator runs.
- AC-F3.3 Validation is typed: every inbound request is validated against a registered schema; there is no ad-hoc `req.body.foo` usage in coordinator code (grep-verifiable in P4).
- AC-F3.4 Safety-check semantics per Amd 2.1: reject on stale/unknown; telemetry freshness visible pre-dispatch (per F1.2). Re-tested in P5 hardware trial, released in P6.

## F4. Camera-integration layer (LAN)

- AC-F4.1 Cameras are added in maintenance tooling; when Frigate is configured, `AnprProvider` delegates to Frigate (DEC-010), and the adapter's `mode` becomes `LIVE` only when connectivity succeeds — nothing else.
- AC-F4.2 `Detection` rows carry `plate_confidence`; below-threshold rows do not create `PlateAuthorization`; threshold is site config, and below-threshold faults are recorded (`Fault kind='ANPR_INFER_FAIL'`), not silently dropped.
- AC-F4.3 No raw frame storage by default (`GATEHEAD.md` §5); snapshot media only over config, per site retention policy.
- AC-F4.4 Night/low-light performance is **not designed against a fixed spec**; benchmark criteria for ANPR accuracy are a P5 deliverable (per DEC-010), not a P0 assumption.

## F5. Site-management layer (minimal admin surface)

- AC-F5.1 Record a site, gates (with provisional type `sliding`), credentials, and camera inventory *before* hardware; this happens in the config path only, not via screen screens (screens consume config).
- AC-F5.2 Faults raised in `Fault` are queryable in the dashboard with filters by kind/severity/date across `simulated`/`live`/`imported` `source` values.
- AC-F5.3 The dashboard never renders an unconfigured device's data as live telemetry (C5 enforcement reachable to users: `mode` drives the visual badge).
- AC-F5.4 Deletion semantics: no destructive deletion of audit-linked entities (D2); only `SUSPENDED`/`REVOKED`/lifecycle states plus correction rows.

## F6. Multi-user access (dashboard)

- AC-F6.1 Operators with `role='OPERATOR'` see all dashboards/pages except: maintenance/config creation, raw audit export, credential issuing; these are `ADMIN`-gated at the route level, with the same Gatehead-focused audit trail for any *revisions*.
- AC-F6.2 Guest paths never touch dashboard features; the visitor-PIN endpoint returns only a minimal result structure (no entity names, no timestamps of other sessions).
- AC-F6.3 A dashboard user sees personal data (plates, snapshots) only when they are authorized to see real access data (a role field — deferred exactly how until P4's specific screen design, so P0 does not freeze a UI detail it cannot yet test).

## F7. Fault handling and error reporting

- AC-F7.1 All actuation failures produce a `Fault` row through the same insertion path; UI-surfaced faults derive from those rows, never from a parallel local error log. One write-behind path; no divergent error journals. Matches plan's C2-no-untraceable-locals.
- AC-F7.2 Health pages reflect `DeviceStatus` from `DOMAIN.md` §0 — mode + health + connectivity + config validity, each a separate field, driving the C5 visual badge.
- AC-F7.3 Timestamps are server-UTC; UI renders local per browser locale per plan D4. `imported` records' stored `ts` values and their rendering-hints are preserved in the entity rows, so records are never silently rewritten (per domain).

## F8. Hardware-compatibility promise discipline

- AC-F8.1 Today — **no compatibility claim is asserted** for any particular opening, gate model, controller, photocell, or camera (C4). Specs in the plan (4 m / ~200 kg / common sliding gate) are recorded in `ASSUMPTIONS.md` as provisional, pending on-site commissioning.
- AC-F8.2 Compatibility proofs, when they exist later, are **rooted in actual commissioning evidence files** (P6), never in manufacturer marketing claims, and each adapter carries `adapter_contract_version` for traceability per `GATEHEAD.md` §1.
- AC-F8.3 The dashboard has a built-in "commissioning verification" spike (proposed, not committed): a read-only panel that shows, per adapter, contract-version + connectivity + safety-device freshness + last test-passed timestamp — enabling the P6 release gate to inspect claim-vs-reality without inventing a claim.

---

## Coverage check against plan §II (the plan's 12 features)

`dashboard / gate-operation APIs (4)/ access-control / camera-integration / site-management / multi-user-access / fault-handling` — all mapped above to at least one feature acceptance-criterion group. Features cover the plan's II list: each named feature has its own AC-group with entity/contract coverage.

**Deferred-with-reason (not silently dropped):**
- Telegrambot/WhatsAppbot delivery/notification surfaces: no claim; revisit when hardware commissioning tells us what notification targets are meaningful.
- Scheduled TOCTOU-like sensor checks: the safety freshness rule (Amd 2.1) covers modeled dispatch-time behavior; anything beyond it is an explicit P5/P6 engineering item.
- Multi-gate site rules (per-gate vs site-wide actuation): site is a container in P0 with one gate; behavior for N>1 gates is out of scope until a second gate exists (C4-adjacent honesty).
