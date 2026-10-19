# D1 Decision Matrix — LocalGate AI (P0)

**Status:** Approved by project owner after P0 review (2026-10-19). No package installed, no lockfile generated at P0.

Selection criteria and weights (same weights applied to every slot):

| Criterion                           | Weight | Rationale                                                                  |
| ----------------------------------- | ------ | -------------------------------------------------------------------------- |
| Local-first operation               | 15     | C1: no mandatory SaaS, no cloud accounts                                   |
| Shared types frontend↔backend       | 20     | Prevents duplicated domain logic and type drift across 8–12 query surfaces |
| Testability without hardware        | 10     | P2 must prove behavior against simulators only                             |
| Dependency count / maintenance risk | 15     | 40-dep governance budget (D1)                                              |
| Offline capability after staging    | 15     | C3, verified only in P6                                                    |
| Reproducible local setup            | 10     | C2: one documented command chain                                           |
| Migration tooling maturity          | 10     | P4 forward-only migrations                                                 |
| Packaging/distribution feasibility  | 10     | A self-hosted installer, not a SaaS deploy                                 |

## 1. Language / runtime

| Candidate                       | Verdict                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript on Node.js (LTS)** | **Selected.** One language shares domain types across frontend and backend natively; mature SQLite tooling; large maintenance pool; ships as a single runtime the local host can run without a cloud service.                    |
| Python (FastAPI/pydantic)       | Strong backend ergonomics, but types are not shared with the frontend without codegen overhead and drift risk; second runtime for inference later is realistic — that lone argument does not outweigh 20 points of type sharing. |
| Go                              | Excellent single-binary distribution and low dependency risk, but sharing types with a TS frontend requires generated bindings; team-relevant migration tooling is thinner.                                                      |
| Rust                            | Highest safety ceiling, worst iteration speed and lowest credible maintenance substitute for an origin project of this scope.                                                                                                    |

## 2. Frontend framework

| Candidate                        | Verdict                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React 18 + Vite + TypeScript** | **Selected.** Premium dark security-dashboards in this shape are most readily staffed with React patterns (dashboards, cards, tables, live telemetry panels); Vite gives fast reproducible local dev with no SSR server dependency — screens talk to our local API, not a cloud edge. |
| Vue 3 + Vite                     | Fully viable runner-up; rejected only because React's dashboard component ecosystem is deeper (charts/status patterns we need by P1).                                                                                                                                                 |
| Next.js                          | Rejected: server-first/cloud-adjacent assumptions, heavier runtime for a local LAN-first app, no SSR value when the API is same-origin Fastify.                                                                                                                                       |
| Angular                          | Rejected: framework weight and opinionated module system disproportionate to a 12-view app.                                                                                                                                                                                           |

## 3. Backend framework (API + dashboard host)

| Candidate            | Verdict                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fastify 5 (Node)** | **Selected.** Typed-first schema validation (JSON Schema), small dependency surface, good LAN-wide performance for a non-scaled local server, plugin model keeps route-auth and SSE boundaries explicit. |
| Express 5            | Rejected: aging middleware ecosystem, weaker built-in typing.                                                                                                                                            |
| NestJS               | Rejected: framework lock and heavy transitive tree for a system whose domain contracts (Gatehead) are our own.                                                                                           |
| Hapi                 | Rejected: smaller maintenance pool vs Fastify for the same role.                                                                                                                                         |

## 4. Database

| Candidate                          | Verdict                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite (WAL mode, single file)** | **Selected.** One file, no external service (hard requirement per D1), durable local writes, ideal for append-only audit tables, trivially packaged and backed up. Constraints (single writer) match our arrival-rate profile (single-family site).                  |
| PostgreSQL (local install)         | Robust concurrency, but demands an always-running service the operator did not elect to run; heavier backup/restore choreography for the same correctness at this scale. Kept as the documented upgrade path if multi-writer load ever exceeds SQLite's suitability. |
| LevelDB-class KV store             | Rejected: no relational queries or declarative migrations; P4 audit/retention queries are relational.                                                                                                                                                                |

## 5. Schema and migrations

| Candidate                                      | Verdict                                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **drizzle-orm + drizzle-kit (SQLite dialect)** | **Selected.** TypeScript-first query builder, declarative schema, forward-only migration files match the plan's P4 model, tiny runtime surface (1 direct dep). |
| Prisma                                         | Rejected: bundled engine binary and a heavy transitive tree relative to benefit at this scale.                                                                 |
| Hand-written SQL + migration scripts           | Acceptable fallback; recorded, not selected — loses type inference that motivated the TS decision.                                                             |

## 6. Event, audit, and snapshot-export storage

| Candidate                                                                                                     | Verdict                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite for events/audit; media snapshots on filesystem with DB manifest rows; export as append-only JSONL** | **Selected.** Audit records stay relational and forward-only in SQLite; large binary snapshots never enter the database (Keeps backup sizes bounded); JSONL export satisfies "copy the audit trail" without exotic tooling. |
| MinIO/S3-compatible object store                                                                              | Rejected: introduces a service dependency purely for storage.                                                                                                                                                               |
| All blobs in DB                                                                                               | Rejected: bloats backups; degrades retention/pagination operations.                                                                                                                                                         |

## 7. Real-time telemetry to dashboard

| Candidate                                  | Verdict                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server-Sent Events over Fastify routes** | **Selected.** Gatehead telemetry streams and the live dashboard feed are one-directional; SSE requires **zero** additional runtime dependency and rides the same HTTP layer as commands (commands themselves are POSTs — commands never travel over telemetry channels).    |
| socket.io                                  | Rejected: adds protocol layer and reconnection complexity not needed while commands use plain HTTP.                                                                                                                                                                         |
| MQTT broker                                | Rejected: a local broker is a service dependency; conflicts with "no cloud broker" although not technically cloud — cost/benefit negative at this scale. Recorded as the natural integration bridge if Frigate/HA event forwarding later requires it (amendment path only). |
| plain WebSocket (ws)                       | Documented fallback if a duplex need emerges (e.g. future two-way camera PTZ); requires an amendment.                                                                                                                                                                       |

## 8. Vision/ANPR runtime (PROVISIONAL — flagged for review)

| Candidate                                                                                                                                                                                           | Verdict                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delegate ANPR inference to Frigate's ANPR capability when Frigate is configured; local standalone fallback module via onnxruntime-node with staged ONNX models, enabled only after benchmarking** | **Proposed.** This avoids deciding between runtimes under false urgency; Frigate is an existing local service with an interface specification we can adhere to; the standalone path exists but is explicitly provisional until a model and camera image quality exist to benchmark against. |
| Python sidecar inference service                                                                                                                                                                    | Rejected for now: second runtime to package and maintain for the same function the Frigate path already covers.                                                                                                                                                                             |
| OpenCV in Node (native bindings)                                                                                                                                                                    | Rejected: fragile native dependency for packaging; revisit if the standalone path is enabled.                                                                                                                                                                                               |

**Open item carrying into P1:** ANPR runtime choice is _behavior_, not UI; it does not block P1. It must be revisited in P5 with recorded benchmark criteria.

## 9. Session/credential handling

| Candidate                                                                                                                                   | Verdict                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session cookies (HttpOnly, same-origin) for dashboard; PIN flow per threat model; scrypt via Node `crypto` builtin for password hashing** | **Proposed.** `node:crypto` scrypt with documented parameters (N=2^15, r=8, p=1 minimum, per-record salt) avoids a native `argon2` binary in local packaging while remaining a recognized password-hashing primitive; parameters recorded in `THREAT_MODEL.md` and revisited if hardware runs allow argon2id. |
| argon2 (node-argon2 native module)                                                                                                          | Strong first choice; rejected for packaging fragility on a self-hosted Windows/macOS/Linux matrix, kept as a documented amendment candidate.                                                                                                                                                                  |
| bcrypt                                                                                                                                      | Rejected: weaker memory-hardening and worse parameter expression for modern hardware than scrypt with tuned parameters.                                                                                                                                                                                       |
| JWT in browser                                                                                                                              | Rejected: same-origin LAN app gains nothing and inherits logout/revocation complexity.                                                                                                                                                                                                                        |

## Dependency inventory (budget check, at decision level)

Backend direct production dependencies implied by these decisions (each to be recorded in `package.json` when P1+ creates it):

`fastify` (+ small `@fastify/*` official plugins), `drizzle-orm`, `drizzle-kit` (dev, excluded), `better-sqlite3` (SQLite driver), `zod` (runtime validation used by Access service), `ws` only as amendment path. **Estimated direct production count: ≤ 8.** Transitive tree will be inventoried in P1's first dependency report; 40-dep budget is not expected to bind.

Frontend direct production: `react`, `react-dom`, `react-router-dom`, `recharts`. No state library at decision level (React hooks + SSE + fetch); TanStack Query becomes an amendment only if dashboard cache invalidation demands it.

## Decision register (initial entries)

| #       | Decision                                                             | Status                                                  | Owner                                |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| DEC-001 | Language/runtime = TypeScript on Node LTS                            | Selected                                                | OpenCode, per matrix above           |
| DEC-002 | Frontend = React 18 + Vite + TS                                      | Selected                                                | OpenCode, per matrix above           |
| DEC-003 | Backend = Fastify 5                                                  | Selected                                                | OpenCode, per matrix above           |
| DEC-004 | Database = SQLite (WAL, single file)                                 | Selected                                                | OpenCode, per matrix above           |
| DEC-005 | Migrations/schema = drizzle-orm + drizzle-kit                        | Selected                                                | OpenCode, per matrix above           |
| DEC-006 | Event/audit storage split (SQLite + filesystem media + JSONL export) | Selected                                                | OpenCode, per matrix above           |
| DEC-007 | Real-time telemetry = SSE, commands stay on HTTP POST                | Selected                                                | OpenCode, per matrix above           |
| DEC-008 | Password hashing = node:crypto scrypt (documented params)            | Proposed                                                | Revisit in P4                        |
| DEC-009 | Session = HttpOnly cookie, same-origin                               | **Approved with security conditions** (owner P0 review) | Implement in P4 per conditions below |
| DEC-010 | ANPR runtime = delegate to Frigate; ONNX fallback provisional        | **Approved (Frigate-first)** (owner P0 review)          | Revisit in P5 per conditions below   |

## P0 review outcomes (owner, recorded verbatim in substance)

The project owner reviewed `NEXT.md`, `DECISIONS.md`, `DOMAIN.md`, and `GATEHEAD.md` on 2026-10-19 and ruled:

- **Q-01 / F-02 — Approved.** Gatehead exposes typed device commands, telemetry, and adapter status only, and must not independently authorize commands. The Actuation Coordinator owns the single controlled actuation workflow and depends on both the authorization service and Gatehead. This is recorded as plan amendment **Amd 2.2** (D3 rule 3 rewritten; original wording preserved in the amendment log).
- **Q-02 / F-01 — Approved.** Canonical entity count = 13. `CameraStream` and `Detection` remain distinct entities with composition relationships to `Camera`; documentation grouping must not erase their identities or lifecycle requirements.
- **F-04 — Approved** (unconditional; `docs/README.md` already created as the documentation index in P0).
- **F-03 — Already resolved by Amd 2.1** (no further action; unchanged by this review).

### DEC-009 security conditions (binding; implementation in P4, not P1)

1. Session cookies remain same-origin, `HttpOnly`, with CSRF protection and appropriate `Secure` and `SameSite` settings.
2. For authenticated access over the LAN, **HTTPS is required**, with a documented certificate-trust and enrollment approach.
3. Plain HTTP is permitted only for loopback-only development — it must not be the default for LAN-facing authenticated sessions.

### DEC-010 conditions (binding)

1. Frigate-first ANPR integration is approved; standalone ONNX inference remains a **provisional fallback** pending model selection, benchmarking, and packaging tests (P5).
2. Frigate being configured does **not** itself establish that ANPR is available or accurate; availability and accuracy are separate, evidence-backed claims.
3. Neither DEC-009 nor DEC-010 may be implemented during P1.

## Contradiction findings carried into this document (required by P0 prompt §3)

Recorded here; **statuses updated after owner review on 2026-10-19** (see "P0 review outcomes" above); the plan was not edited to pre-resolve them.

### Finding F-01 — Entity count: **Approved**

The plan does not itself state "10" (the count appeared in a chat-level summary), but the "Minimum required entities" list names **13** discrete entities when grouped names are counted separately (`Site; Gate; GateSession; Operator; VisitorCredential; PlateAuthorization; AccessDecision; Camera; CameraStream; Detection; SafetyDevice; Fault; AuditRecord`). **Resolution (approved by owner):** canonical count = **13 entities**, with `CameraStream` and `Detection` formally modelled as composition children of `Camera` so the intuitive "12" summary remains honest. Impact: none on behavior; prevents template-codegen duplication. Reflected in `DOMAIN.md` and as an amendment note back into the plan.

### Finding F-02 — Gatehead ↔ authorization dependency direction: **Approved** (plan Amd 2.2)

Plan D3 rule 3 says "Gatehead alone decides whether to consult the access-control service before acting." The D5 actuation sequence places authorization **before** Gatehead is asked to actuate. Both readings cannot hold — a policy-authority inside Gatehead duplicates the sequencing and invites a circular dependency (Gatehead → AccessControl, while the Actuation Coordinator must already depend on both). **Resolution (approved by owner):** Gatehead is a _policy-free, typed device layer_: it exposes commands and telemetry, performs no authorization. All policy (credentials, roles, interlock checks, decision recording) lives in the **Actuation Coordinator** service, which depends on Gatehead and AccessControl. `GATEHEAD.md` codifies this; D3 rule 3 was rewritten by plan amendment **Amd 2.2** with the original wording preserved in the plan's amendment log.

### Finding F-03 — Simulation/live representation: **Already resolved (Amd 2.1)**

Plan rev 2 (original C5) suggested `is_simulated`/`is_live` booleans, which permit both-true and both-false. Amd 2.1 already replaced C5 with an explicit operating-mode enum `SIMULATED | UNCONFIGURED | LIVE` (discriminated union), with health/connectivity/configuration/safety separate. **No further amendment required**; `DOMAIN.md` codifies the type, and event-level `source` (`simulated | live | imported`) is kept separate from adapter _mode_ — the mapping is defined, one-way, and frozen at write. Unchanged by the 2026-10-19 review.

### Finding F-04 — `docs/README.md` "empty index": **Approved**

An empty file cannot be a useful index as its plan role implies. **Resolution (approved by owner):** `docs/README.md` is created in P0 **as the documentation index** (links to every authoritative document with a one-line description of its status), and the plan's word "Empty" is corrected to "Index". Done in P0 (commit `12158db` and the index record in `docs/README.md`).
