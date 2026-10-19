# P0 Gatehead — Typed Controlled-Device Boundary

**Status:** Proposed for P0 review.
**Resolves:** F-02 (**dependency direction**), plus codifies the freshness/staleness rules from Amd 2.1.

---

## 0. Boundary definition and dependency direction (F-02)

The plan (D3 rule 3) currently says _"Gatehead alone decides whether to consult the access-control service before acting."_ That rule and the D5 ordering (_authorization happens before Gatehead is engaged_) cannot both hold. **Proposed resolution** (recorded in `DECISIONS.md`; plan amendment requested on approval):

- **Gatehead is a policy-free, typed device layer.** It never consults AccessControl, never issues credentials, never evaluates roles, and performs **no authorization**.
- All policy lives in the **Actuation Coordinator** service inside the backend, which is the _only_ caller of Gatehead's command surface:

```
┌────────────────────────────────────────────────────┐
│ UI / API routes                                    │
│   dashboard, visitor-PIN endpoint, ANPR webhooks   │
└───────────────┬────────────────────────────────────┘
                │ (auth via AuthService; roles via AccessControl)
┌───────────────▼────────────────────────────────────┐
│ Actuation Coordinator (backend service)            │
│  1 authenticate   2 authorize   3 validate         │
│  4 safety check (Gatehead telemetry read)          │
│  5 record AccessDecision   6 dispatch via Gatehead │
│  7 post-hoc snapshot via Gatehead                  │
└───────────────┬────────────────────────────────────┘
                │ (only caller of command surface)
┌───────────────▼────────────────────────────────────┐
│ Gatehead (typed device layer)                      │
│   GateOperator · Camera · SafetyDevice adapters    │
│   ANPR provider      [mode: SIMULATED | LIVE]      │
└────────────────────────────────────────────────────┘
```

Rules (researchable, testable):

1. **One-way dependency:** Gatehead adapters never import backend services. The coordinator imports Gatehead; Gatehead never imports it back.
2. **Assets declared, not requested, only mode:** an adapter is `SIMULATED`, `LIVE`, or `UNCONFIGURED`; a simulated adapter never claims live telemetry (per C5/Amd 2.1).
3. **Failure semantics, not success-only semantics:** every command method returns a typed discriminated result (`{ok:true}` | typed failure). No invented exceptions hiding recovery paths.
4. **Fresh safety, always, before any "open"-affecting dispatch:** the coordinator queries the current `SafetyDevice.notifying-projected state` via Gatehead, **with** freshness evaluation, before dispatch. Gatehead itself merely reports; freshness configuration is the coordinator's invariant to enforce.

## 1. Versioning and compatibility

- Contracts are named **`GATEHEAD/v1`** and are additive-evolution: new optional fields and new adapters may be added under `v1`; breaking changes open a new minor (`GATEHEAD/v2`) recorded as a `DECISIONS.md` amendment before implementation.
- Each adapter record carries `adapter_contract_version` so state-migration or on-air failure can be attributed to a boundary revision.
- Every adapter must ship its own **contract tests** (P2 for simulators, P5 for live provisioning pilots) and must run them against the versioned schemas.

## 2. Adapter family: `GateOperator`

```ts
interface GateOperatorAdapter {
  readonly kind: "GateOperator";
  readonly capabilities: {
    open: boolean;
    close: boolean;
    halt: boolean;
    position_report: "NONE" | "COARSE";
  };
  status(): Promise<OperatorStatus>; // includes mode, health, connectivity, last_reported_at
  stateExpose(): Observable<OperatorStatus>;
  command(
    cmd: GateCommand,
    opts?: { readyState?: GateActuationState },
  ): Promise<Result<GateOperatorAck, GateOperatorError>>;
}
type GateCommand = { type: "OPEN" } | { type: "CLOSE" } | { type: "HALT" } | { type: "RESUME" };
```

Behavioral commitments:

- **idempotency:** `command` may repeat safely when the adapter cannot prove delivery (gate hardware is stateless, not atomic; retries from the coordinator are expected in degraded connectivity, and the coordinator's dispatch audit carries the retry count).
- **acknowledgement is receipt-of-command, not completion-of-motion.** Completion is reported via `stateExpose`; a dispatch that is never acknowledged raises `Fault(kind='OPERATOR_UNREACHABLE')`.
- **timeout envelope:** every command carries a configured dispatch timeout; its exact value is a config item (never hardcoded magic). On timeout, the coordinator's next action is to record a fault and re-query state — never to re-dispatch silently.

## 3. Adapter family: `SafetyDevice`

```ts
interface SafetyDeviceAdapter {
  readonly kind: "SafetyDevice";
  readonly device_type:
    "PHOTOCELL" | "SAFETY_EDGE" | /* extensible */ (string & { brand?: SafetyDeviceKind });
  status(): Promise<SafetyDeviceStatus>; // includes reported_state + last_reported_at
  events(): Observable<SafetyEdgeEvent>; // trigger / clear transitions
}
```

- **Freshness disclosure:** `last_reported_at` is mandatory; the staleness threshold lives in site config, referenced (not duplicated) by the adapter's descriptor. Gatehead alone does not decide dispatch-readiness — it exposes the raw evidence the coordinator needs to decide (see §0 rule 4).
- A `TRIGGERED` while a `CLOSING` action is underway is the _only_ path to `HALTED_SAFETY_STOP` (per `DOMAIN.md` gate state machine, D2 gate state machine); Halt-codes issued from the GUI can never bypass this.

## 4. Adapter family: `Camera`

```ts
interface CameraAdapter {
  readonly kind: "Camera";
  status(): Promise<CameraStatus>;
  streams(): Observable<CameraStreamEvent>;
  snapshot(opts?: SnapshotOpts): Promise<Result<SnapshotRef, SnapshotError>>;
  detectionEvents?(): Observable<PlateDetectionEvent>; // when ANPR-capable
}
```

- **Simulated cameras** produce synthetic `Camera`/`CameraStream`/`Detection` events via the simulator's deterministic scripts (P2). They never claim `mode:'LIVE'`.
- **Snapshots** are post-command or post-detection evidence, **never** pre-command prediction. For offline capture windows when `mode='SIMULATED'`, snapshots come from the generator's pre-recorded frames; this is recorded in the snapshot event's metadata, not falsified into "live" labels.

## 5. Provider family: `AnprProvider`

```ts
interface AnprProvider {
  readonly kind: "AnprProvider";
  connect(cfg: AnprConnectConfig): Promise<Result<AnprSession, AnprConnectError>>;
  ingest(frameRef: FrameRef | CameraStreamId): Promise<Result<PlateCandidate[], AnprError>>;
}
```

- Per `DECISIONS.md` DEC-010: the default implementation wires to **Frigate's ANPR** when Frigate is configured; a standalone `onnxruntime-node` fallback is marked **provisional** until a benchmark is recorded (P5). ANPR is _never_ unconditional: `detectionEvents` may be omitted by any camera adapter.
- **Historical frame storage:** raw frames are **not** persisted by default (privacy, threat model); only the detection row's `snapshot_evidence_ref` (compressed context image per camera config) is retained and is subject to the site's snapshot retention policy.

## 6. Not Gatehead's job (policy/roles boundaries)

To keep tests decidable and the dependency graph acyclic, Gatehead explicitly _excludes_:

- role/attribute checks (AccessControl / AuthService),
- decision recording (Actuation Coordinator),
- session, PIN, and credential lifecycle (per `DOMAIN.md` §2.3/2.6),
- audit write (single audit path, see `DOMAIN.md` §2.14).

These are recorded as _exclusions_ so future refactors don't silently re-merge them.

## 7. Contract-test matrix (P2 for simulators; P5 for live)

| Adapter                  | Required tests                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------- |
| GateOperator (SIMULATED) | state machine conformance; ack/completion separation; timeout → fault path             |
| SafetyDevice (SIMULATED) | trigger/clear event ordering; `last_reported_at` truthfulness vs simulated clock       |
| Camera (SIMULATED)       | snapshot refs resolve or `{phase:'unavailable'}`; detection ordering vs simulated time |
| AnprProvider (mock)      | connect-failure is typed; ingest limits                                                |

Live-contract tests get their own checklist in P5 and explicitly verify **freshness** behavior (not just status flags).
