# P0 Domain Architecture — LocalGate AI

**Status:** Proposed for P0 review.
**Source:** `OPENCODE_BUILD_PLAN.md` (rev 2.1) D2. Counts and boundary decisions resolve findings F-01..F-06 of `DECISIONS.md` as **Proposed** until the user approves them.

---

## 0. Operating mode (F-03 resolution, per Amd 2.1)

```ts
type OperatingMode = "SIMULATED" | "UNCONFIGURED" | "LIVE";

interface DeviceStatus<O = object> {
  mode: OperatingMode;
  health: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  connectivity: "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
  config_validity: "VALID" | "INVALID" | "UNKNOWN";
  last_reported_at: string; // server time, UTC ISO-8601, may be absent
  oxidation: O; // adapter-specific details
}
```

Cross-invariant enforced at the type level: a device's `mode` is a singular discriminated tag; the API surface never exposes `is_simulated`/`is_live` booleans. Health/connectivity/config/safety are separate fields. A `LIVE` camera may be `DISCONNECTED`; an `UNCONFIGURED` operator reports `UNKNOWN` for all diagnostics rather than pretending health.

**Event source classification** (separate from adapter mode; frozen at write time, never backfilled):

```ts
type EventSource = "simulated" | "live" | "imported";
```

Mapping is one-way and recorded when the event is appended: an event emitted by the simulator is `simulated`, one from a LIVE path is `live`, data restored via maintenance tooling is `imported`. GUI legibility (C5) uses the mode enum; event `source` drives lineage/audit queries.

---

## 1. Canonical entity count (F-01 resolution)

13 entities, of which two are composition children of `Camera`:

1. Site
2. Gate
3. GateSession
4. Operator
5. VisitorCredential
6. PlateAuthorization
7. AccessDecision
8. Camera
9. CameraStream _(composition child of Camera)_
10. Detection _(composition child of Camera)_
11. SafetyDevice
12. Fault
13. AuditRecord

**Proposed:** treat `10` in any earlier ad-hoc summary as obsolete; `13` is canonical, with the grouped count of 11 if the two camera children are folded into their parent in a naive view. To be recorded as an amendment note in the plan on approval, and used verbatim by template-codegen in P2.

> **P2 implementation note:** the 13 entities were hand-written (not generated) in `web/src/domain/` — `site.ts`, `gate.ts`, `session.ts`, `operator.ts`, `credential.ts`, `plate-authorization.ts`, `camera.ts` (Camera + CameraStream), `detections.ts`, `decision.ts`, `safety-device.ts`, `fault.ts`, `audit.ts` — sharing `primitives.ts` and `clock.ts`. Enum value casing is UPPER-CASE in code; the lowercase spellings in this document are display casing (see `docs/scope-audit/P2.md` §7, D-P2-4).

## 2. Entities

Common conventions unless stated otherwise:

- **Identifiers:** UUID v7 (time-ordered, safe to sort by id in logs).
- **Time:** server-time UTC ISO-8601; D4 rules apply; audit records carry both `occurred_at_server_utc` and, where relevant, `device_last_reported_at` for freshness attribution.
- **Credentials/storage:** all credential material stored one-way (scrypt per `DECISIONS.md` DEC-008) or as opaque tokens; no reversible storage of user passwords.
- **Simulator parity:** every entity's lifecycle is exercised identically whether the underlying device adapter was `SIMULATED` or `LIVE` — prop-driven, one code path (D2).

### 2.1 Site

- Purpose: top-level composition root.
- Fields: `id`, `name`, `created_at`.
- Lifecycle: created in maintenance tooling; no runtime transitions.
- Invariants: at least one `Gate`; all other entities reference the site transitively.
- Source of truth: where adapters discovery is keyed (simulated adapter accounts have a site id too, so switching mode never breaks referential structure).

### 2.2 Gate

- Purpose: the single controlled opening.
- Fields: `id`, `site_id`, `name`, `type` (`sliding` | other), `commissioning_state` (`SIMULATED` | `UNCONFIGURED` | `LIVE`), `rated_specs`, `timestamps`.
- **State machine** (actuation state, authoritative):

```
IDLE ──OPENING──▶ OPEN_AWAIT_CLOSE ──CLOSING──▶ IDLE
                         │
                         └─(safety trigger while closing)──▶ HALTED_SAFETY_STOP
HALTED_SAFETY_STOP ──resume/open──▶ OPENING   (resume always re-asserts safety clearance)

IDLE | OPENING | OPEN_AWAIT_CLOSE | CLOSING | HALTED_SAFETY_STOP
   │
   └─(unknown/faulted adapter, watchdog expiry)──▶ FAULT_UNKNOWN
```

- Invariants: only one non-terminal transition target at a time; a command must specify which state it claims to transition **from**, and the coordinator rejects if `from` does not match (no lost-update across concurrent actors); every state change is emitted as a `GateStateChange` event with `source`.
- Unknown sub-states (all sources): `HALTED_SAFETY_STOP` when photocell/safety edge blocks closing; `FAULT_UNKNOWN` on adapter loss; recovery only through explicit `resume` command, never silent auto-resume.

### 2.3 GateSession

- Purpose: identifies **why** a credential or plate was admitted; groups AccessDecisions.
- Fields: `id`, `visitor_credential_id?` (null when the actor is an Operator), `operator_id?`, `started_at`, `ended_at?`, `context` (`dashboard` | `visitor_pin` | `anpr_pass`), `source` (`live` | `simulated` | `imported`).
- Lifecycle: `OPEN` → `CLOSED` (by explicit end action, session timeout, or `gate spooky_decay` — see 2.4). Sessions outlive credentials they used; re-use policy per credential type.
- Invariants: at most one open session per credential at a time; ended sessions are immutable (new session for new entry in scheduled cadence even for the same credential).

### 2.4 GateSession timeout (exact rule)

- Default: 10 min inactivity timeout, **configurable**.
- Timeout is a dashboard-visible event (`source: live` if triggered by backend clock, `simulated` if triggered by the simulator clock adapter).
- On timeout, session ends; no credential is invalidated; **no readiness is claimed** — any subsequent need re-touches the credential to re-check state.
- Re-open within timeout window: allowed; counts as one visit per `VisitorCredential` policy.

### 2.5 Operator

- Purpose: enrolled human role for dashboard/tier.
- Fields: `id`, `name`, `role` (`ADMIN` | `OPERATOR`), `created_at`, `last_login_at?`, `passkey_hash` (scrypt or equivalent at rest), `passkey_rotated_at`, rotation policy reference, `is_active`.
- Lifecycle: `ACTIVE` ⇄ `SUSPENDED` (maintenance only, preserving audit trail); `is_active=false` blocks new logins but retains historical attributions.
- Invariants: ADMIN/OPERATOR separation (read/review vs change commands) is enforced by AccessControl role table, not by this entity; deletions are not performed — `SUSPENDED` + audit trail instead.

### 2.6 VisitorCredential

- Purpose: token given to a guest (kasna PIN, physical card emulation later).
- Fields: `id`, `site_id`, `pin_hash` (scrypt), `created_at`, `valid_from`, `valid_until?`, `max_uses?` (unlimited unless set), `is_revoked`, `revoked_at?`, `issued_by` (Operator id), `created_source` (`live` | `simulated`), `active_attempts_window_config` ref.
- Lifecycle: `CREATED` → `ACTIVE` (between `valid_from`/`valid_until`) → `EXPIRED` (invoked by clock) → or `REVOKED` (explicit admin action, terminal).
- Status is **computed** at read time from `valid_from`/`valid_until`/`is_revoked` (rule frozen in API docs), not duplicated as a stored boolean, to avoid clock-dependency inconsistency.
- Invariants: PIN storage one-way (scrypt, same parameters as Operator per DEC-008); PIN values ≥ 6 digits; no plaintext retention; no plaintext logging anywhere (threat model covers); revocation supersedes any in-flight `GateSession` for future _attempts only_ (already-recorded decisions stand, they are historical facts).

### 2.7 PlateAuthorization

- Purpose: bind a detected plate to a permitted context.
- Fields: `id`, `site_id`, `plate_raw`, `plate_normalized` (country-aware), `visitor_credential_id?` (or check against an allowlist), `created_at`, `revoked_at?`, `created_by`, `created_source`.
- Lifecycle similar to `VisitorCredential`: `ACTIVE` → `REVOKED`.
- Invariants: `plate_raw` is only ever written from a `Detection` (never hand-typed); normalization rules are versioned and upgrade-safe (rows keep `plate_raw`, `plate_normalized` is recomputed for display, not for matching — matching always uses the stored normalized value at write time, never re-derives).

### 2.8 AccessDecision

- Purpose: the authoritative record of a gate-coach actuation decision. **Terminal and immutable.**
- Fields: `id`, `gate_id`, `gate_session_id?`, `actor_type` (`DISPLAYUSER` | `ANPR_GUEST` | `VISITOR_PIN` | `OPERATOR`), `subject_type`, `subject_id`, `dispatched_at_server_utc`, `outcome` (`GRANTED` | `DENIED`), `denied_reason` (filled only when `DENIED` — see F-05 enum below), `correlation_id` (links to the attempt that produced it), `audit_record_id`, `evidence` (`snapshot_evidence_ref[]`, filled asynchronously).
- Lifecycle: `EVALUATED` as the only terminal state (no pending/retry concept; denied decisions are recorded, never suppressed).
- **Outcomes:** `GRANTED` / `DENIED` (terminal). Slash-detailed reason codes record **why** in `denied_reason` when `DENIED`, not policy of re-evaluation.
- PR-C: snapshot evidence `evidence_ref`s point to real media files once produced (`{phase: 'pending' | 'available' | 'unavailable', sha256?}`, per F-05 refinement).
- Invariants: every actuation has exactly one `AccessDecision`; there is no path to actuate that bypasses evaluation; audit references this row.

### 2.9 Camera

- Fields: `id`, `site_id`, `label`, `operator_gate_side` (`passenger` | other, extensible), `stream_cfg_ref`, `mode` (OperatingMode), `connection_profile` (defined only when `mode='LIVE'`), `config_validity`.
- Lifecycle: created in maintenance tooling; `mode` and diagnostics follow `DeviceStatus`.
- Invariants: a camera **owns** exactly one `CameraStream` and zero-or-more `Detection` rows; a camera has exactly one adapter record at a time (connection config is adapter-versioned, not free-form).

### 2.10 CameraStream _(child of Camera)_

- Fields: `id`, `camera_id`, `started_at`, `ended_at?`, `source` (`live` | `simulated` | `imported`), `codec_info?` (recorded at capture time, not relabeled).
- Lifecycle: `OPEN` → `CLOSED` (per actual consumption windows; not a placeholder for "future streaming").
- Invariants: opening/closing snapshots are **backend-authoritative only** — they must reference an existing stream or be recorded as `snapshot_unavailable`.

### 2.11 Detection _(child of Camera)_

- Fields: `id`, `camera_id`, `camera_stream_id?` (populated when the detection happened against an open stream), `first_seen_at`, `last_confirmed_at`, `plate_raw` (if ANPR), `plate_confidence`, `detection_source` (`simulated` | `frigate` | `onnx` | `imported`), `snapshot_evidence_ref`.
- Lifecycle: stateless observation row (append-only); `last_confirmed_at` extends the window if the same plate re-appears (a fresh row is recorded for material re-detections if a new authorization is evaluated).
- Invariants: `plate_confidence` in [0,1]; a row below a **recorded** confidence threshold is not used to build `PlateAuthorization` rows; never silently relabeled.

### 2.12 SafetyDevice

- Fields: `id`, `gate_id`, `device_type` (`PHOTOCELL` | `SAFETY_EDGE` | other, extensible), `mode` (OperatingMode), `last_reported_at`, `reported_state` (`CLEAR` | `TRIGGERED` | `UNCLEAR` | `UNKNOWN`), `staleness_threshold_ref` (config).
- Lifecycle: state changes appended as events; current row is a projection (D2).
- Invariants: `reported_state` transitions always from an annotated source (`simulated`/`live`/`imported`); dispatch from `Gate` actuation flow must reject when `last_reported_at` is older than the configured staleness threshold (per Amd 2.1 D5 refinement), and must reject when the record doesn't exist as well as when it is stale.

### 2.13 Fault

- Fields: `id`, `gate_id`, `camera_id?`, `safety_device_id?`, `raised_at`, `kind` (`OPERATOR_UNREACHABLE` | `SAFETY_TRIGGER` | `ANPR_INFER_FAIL` | `SCHEDULE_MISS` | other, extensible), `severity` (`INFO` | `WARN` | `CRITICAL`), `resolved_at?`, `source` (`live` | `simulated` | `imported`).
- Lifecycle: `RAISED` → `RESOLVED` (explicit, or superseded by a `Fault` of the same correlation id with `RESOLVED` in synthetic re-derivation); there is no scheduled auto-resolve.
- Invariants: FAULT rows carry their own `evidence_ref` (logs etc.), not the media snapshot that an `AccessDecision` carries.

### 2.14 AuditRecord

- Fields: `id`, `ts_server_utc`, `occurred_at_device_source` (info, optional), `actor` (Operator id, `DISPLAYUSER`-anonymous, `VISITOR_PIN` subject, or system), `action` (verb: `LOGIN_ATTEMPT`, `OPEN_GATE_ISSUED`, `OPEN_GATE_DISPATCH`, `SNAPSHOT_SAVED`, `CREDENTIAL_CREATED`, `DECISION_RECORDED`, …, enumerated and versioned), `subject_ref` (`entity_type`, `entity_id`), `decision_ref?`, `request_origin` (`dashboard_ui` | `rest_api` | `simulator`) present, `payload_digest` (hash of redacted-at-write details; payload itself never re-recorded).
- **Append-only, forward-only** (D2): corrections are _new records_ referencing the original via `correction_of`, never rewrites or deletes.
- Invariants: for every actuation a matching `AccessDecision` and ≥1 `AuditRecord` must exist; audits reference decisions, not other audits (except `correction_of`).

## 3. Cross-cutting invariants

- **Single actuation path** (D5): all four triggers `dashboard command / visitor PIN pass / ANPR pass / scheduled` reduce to the same coordinator sequence: authenticate → authorize → validate → safety check → record decision → dispatch via Gatehead → post-hoc snapshot. There is no "helper" actuation route.
- **Defence in depth** for the visitor-PIN endpoint (per D5): authentication (rate limiting + lockout per device/IP), validation (anti-enumeration: constant-time responses for invalid PINs), authorization (valid window + revocation check), then decision recording, then the same countdown. These roles are recorded as checks, not implicitly merged.
- **Source lineage never migrates by re-typing.** `imported` records are created only through a clear-system import path and never overlap re-aot-path rewriting.
- **Unanchored enums:** every enumerated field carries the word "extensible" in its doc note to prevent codegen treating absence of a forbidden variant as impossible.

## 4. Derived objects (not entities)

| Object              | Derived from                                           | Format                                |
| ------------------- | ------------------------------------------------------ | ------------------------------------- |
| Dashboard telemetry | `DeviceStatus` projection + backend clock              | SSE stream payload                    |
| Site-day report     | `Detection`, `GateSession`, `Fault`, `AuditRecord`     | JSON download served from SQLite      |
| Audit trail export  | `AuditRecord` + linked `AccessDecision`, `GateSession` | append-only JSONL                     |
| Time alignment      | backend vs. device-claimed clock                       | stored at capacity as `ts` facts only |

## 5. Phase coverage matrix (for NEXT.md)

| Entity             | Created (state)             | Constrained behaviors      | Referenced |
| ------------------ | --------------------------- | -------------------------- | ---------- |
| Site               | P2 (seeded by C2 init)      | —                          | all        |
| Gate               | P2                          | actuation state machine D2 | P2..P5     |
| GateSession        | P2                          | timeout rules (§2.4)       | P2..P5     |
| Operator           | P4 (auth), seeded P2        | suspension, rotation       | P3..P4     |
| VisitorCredential  | P4                          | lifecycle, revocation      | P2, P4..P5 |
| PlateAuthorization | P4                          | normal forms               | P4..P5     |
| AccessDecision     | P2 (records are write-only) | outcome/denied_reason      | P2..P5     |
| Camera             | P2 (seeded P1)              | mode/status                | P2..P5     |
| CameraStream       | P2 (P5 live real)           | snapshot binding           | P2..P5     |
| Detection          | P2 (simulated), P5 (live)   | confidence thresholds      | P3..P5     |
| SafetyDevice       | P2                          | staleness rejection        | P2..P5     |
| Fault              | P2                          | resolution semantik        | P2..P5     |
| AuditRecord        | P2                          | append-only                | P2..P6     |

P2 delivered the `P2` column for every entity: validated constructors, the gate motion cycle, credential/operator lifecycles, safety staleness rejection, the append-only audit/fault/decision ledgers, and the actuation coordinator that joins them. Items marked P4/P5 in this table (operator auth, plate authorization seeding from live ANPR, live camera streams) remain open — see `docs/scope-audit/P2.md` §4 for the carried uncertainties (D-P2-1..D-P2-4).
