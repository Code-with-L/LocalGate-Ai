# P0 Assumptions Ledger — LocalGate AI

**Status:** Proposed for P0 review.
**Rule:** every assumption here carries a `class` (safe / verify-in-phase / user-input-needed). Anything that would change a plan D-decision if wrong is `user-input-needed`; it is *not* silently fixed into an unapproved implementation.

---

| # | Assumption | Class | Where it binds |
|---|---|---|---|
| A-01 | Hardware: gate opening ≈ 4 m, sliding gate ~200 kg — **provisional; no claim of compatibility** (C4) | safe (recorded as provisional) | `DECISIONS.md` D3 wording; P6 commissioning must confirm or amend |
| A-02 | Controller protocol will be one of the common ones (dry-contact relay or RS-485-class protocol), decided *after* hardware arrives; Gatehead `GateOperator` contract stays protocol-agnostic until then | verify-in-phase (P6) | `GATEHEAD.md` §2 |
| A-03 | Site network is a local LAN with no internet exposure of the frontend; if that changes, the whole threat model's exposure assumptions must be re-opened | verify-in-phase (P4, then P6 release gate) | `THREAT_MODEL.md` |
| A-04 | Cameras between 1 and 4 (normal household ingress); camera count does not drive architecture because adapters are per-camera | verify-in-phase (P5) | `DOMAIN.md` §2.9 `CameraStream`/`Detection` |
| A-05 | Backend host can be a small always-on machine (mini-PC class) on the LAN; SQLite fits the arrival-rate profile of a single-family site | user-input-needed (host class, OS) | P4 packaging & C2 setup doc |
| A-06 | Home Assistant and/or Frigate exist on the same LAN — **optional**, not required; every feature works without them | verify-in-phase (P5) | `DECISIONS.md` DEC-010; `GATEHEAD.md` §5 |
| A-07 | Registered operators will be few (2–5 household members); no multi-tenancy design pressure | safe | `DOMAIN.md` §2.5 `Operator` |
| A-08 | Night camera quality will be adequate for ANPR once real hardware exists; until then ANPR accuracy is not assumed | verify-in-phase (P5 benchmark criteria per DEC-010) | `THREAT_MODEL.md` T-09 |
| A-09 | Node LTS available on the target host for the entire project life; runtime upgrade is a reviewed amendment, never silent | safe (release-gated) | P4/P6 packaging |
| A-10 | The user (project owner) reviews each phase before the next starts; "human sign-off" is not a typo or assumption — it is the PSDA per plan §Scope discipline | safe (process commitment) | plan scope-audit mechanism |
| A-11 | Visitor PINs are 6 digits and used within one session day; anything longer/different needs re-review of brute-force math | user-input-needed (PIN spec) | `THREAT_MODEL.md` T-01..T-03; `DOMAIN.md` §2.6 |
| A-12 | "Server-authoritative time" means the backend host's clock is reasonably correct (NTP-synced) most of the time; checking drift defensively is required for live adapters per D4 | verify-in-phase (P2 simulators must emit device timestamps provably not relied upon as authoritative; check again P5 live) | `DOMAIN.md` D4 refinements; `GATEHEAD.md` freshness rules |
| A-13 | Access to the LAN from outside the household is not planned (no VPN, no reverse-proxy互联网 exposure) | user-input-needed | `THREAT_MODEL.md` zone model |
| A-14 | The maintenance operator keeps offline backups of the SQLite file and snapshot dir; the app does not invent cloud backup | safe (setup doc P4 config-export duties) | plan C2; `DECISIONS.md` DEC-006 |
| A-15 | The user's review checkpoints in `docs/` are readable on the host machine (no SaaS doc store used) | safe | plan §Files layout |

**Assumption classes:**
- `safe` — low impact if wrong; correction would not alter a D-decision.
- `verify-in-phase` — must be confirmed by a later phase's own tests/evidence, with the phase listed.
- `user-input-needed` — need project-owner input recorded here; blocking P1 would be overkill, but the impact is declared so it cannot be silently decided for you.
