# LocalGate AI — Documentation Index

**Status:** Documentation only; no application code exists at P0 completion.

| Document                 | Status                                 | What it contains                                                                             |
| ------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `OPENCODE_BUILD_PLAN.md` | Source of truth (rev 2.2, Amd 2.1/2.2) | Constraints C1–C5, decisions D1–D5, phased roadmap, scope-audit protocol                     |
| `RECON.md`               | P0 — complete                          | Repository discovery findings and inherited-decisions inventory                              |
| `REQUIREMENTS.md`        | Owner-reviewed                         | The 12 feature areas mapped to acceptance criteria                                           |
| `DOMAIN.md`              | Owner-reviewed                         | Core entities, lifecycles, invariants, operating-mode type                                   |
| `GATEHEAD.md`            | Owner-reviewed                         | Typed controlled-device boundary, adapter contracts, dependency direction                    |
| `THREAT_MODEL.md`        | Owner-reviewed                         | Trust zones, assets, threat register, mitigations phase map                                  |
| `DECISIONS.md`           | Owner-reviewed                         | D1 decision matrix, dependency budget, P0 review outcomes, contradiction findings F-01..F-04 |
| `ASSUMPTIONS.md`         | Owner-reviewed                         | Assumption ledger with classes and binding phases                                            |
| `DESIGN.md`              | P1 — source of truth                   | Design language, tokens, colorblind-safety strategy, component contracts                     |
| `NEXT.md`                | P1 outcome + P2 handoff                | P1 execution record (§1–3) and the proposed P2 handoff for owner review                      |
| `scope-audit/P0.md`      | P0 — complete                          | P0 scope audit (files changed, commands run, uncertainty register)                           |
| `scope-audit/P1.md`      | P1 — awaiting review                   | P1 scope audit (files changed, commands run, forbidden-scope search)                         |

Root note: `README.md` (repository root) carries the one documented command chain and current verification state.

Rule for this index: every document above with status **proposed** awaits the project owner's review before P1 begins (see `NEXT.md`).
