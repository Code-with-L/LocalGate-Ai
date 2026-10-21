# LocalGate AI — Documentation Index

**Status:** Phases P0–P2 are complete and recorded; P3 awaits owner authorization.

| Document                 | Status                                 | What it contains                                                                                 |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `OPENCODE_BUILD_PLAN.md` | Source of truth (rev 2.2, Amd 2.1/2.2) | Constraints C1–C5, decisions D1–D5, phased roadmap, scope-audit protocol                         |
| `RECON.md`               | P0 — complete                          | Repository discovery findings and inherited-decisions inventory                                  |
| `REQUIREMENTS.md`        | Owner-reviewed                         | The 12 feature areas mapped to acceptance criteria                                               |
| `DOMAIN.md`              | Owner-reviewed                         | Core entities, lifecycles, invariants, operating-mode type                                       |
| `GATEHEAD.md`            | Owner-reviewed                         | Typed controlled-device boundary, adapter contracts, dependency direction                        |
| `THREAT_MODEL.md`        | Owner-reviewed                         | Trust zones, assets, threat register, mitigations phase map                                      |
| `DECISIONS.md`           | Owner-reviewed                         | D1 decision matrix, dependency budget, P0 review outcomes, contradiction findings F-01..F-04     |
| `ASSUMPTIONS.md`         | Owner-reviewed                         | Assumption ledger with classes and binding phases                                                |
| `DESIGN.md`              | P1 — source of truth                   | Design language, tokens, colorblind-safety strategy, component contracts                         |
| `NEXT.md`                | P2 outcome + P3 handoff                | P1/P2 execution records and the authorized permission bounds (§5)                                |
| `scope-audit/P0.md`      | P0 — complete                          | P0 scope audit (files changed, commands run, uncertainty register)                               |
| `scope-audit/P1.md`      | P1 — complete                          | P1 scope audit (files changed, commands run, forbidden-scope search)                             |
| `scope-audit/P2.md`      | P2 — awaiting review                   | P2 scope audit (scope, commands, tests, uncertainty register, forbidden-scope search, D-P2-1..4) |

Root note: `README.md` (repository root) carries the one documented command chain and current verification state.

Rule for this index: every document above with status **proposed** or **awaiting review** stays under the project owner's review before the next phase begins (see `NEXT.md`).
