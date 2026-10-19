# P0 Discovery Report — LocalGate AI

**Status:** Complete. Read-only phase; no code written, no dependencies installed, and **no plan edit was made in this pass** (the plan amendment 2.1 was committed *before* P0 began, at the project owner's request, as part of the pre-P0 review refinements).

## 1. Method

Read-only inspection of the repository working tree and git metadata:

```
git log --oneline --all
git status --short
git branch -a
recursive file listing (docs only)
```

No build tool, package manager, test runner, or linter was invoked — none exists in the repo to invoke.

## 2. Repository inventory

| Item | Finding |
|---|---|
| Branch | `main` (only branch) |
| Commits at P0 start | 2 (`9f3be85` plan rev 2; `4d012af` Amd 2.1 — author: OpenCode, pre-P0 approved refinement) |
| Files | `docs/OPENCODE_BUILD_PLAN.md` only |
| READMEs | none (until this pass) |
| Package manifests | none — first one is created in P1 |
| Tests, CI, tooling | none |
| Source code | none |
| Uncommitted changes | none left after the Amd 2.1 commit |

## 3. Existing decisions recorded in the plan (inherited, not re-decided)

Constraints C1–C5, architecture decisions D1–D5 as amended by Amd 2.1, the 8-phase roadmap, and the scope-audit protocol. The two items that the plan itself carries as undecided parameters (TLS bind configuration, ANPR runtime choice) were resolved *provisionally* in this pass — see `DECISIONS.md` DEC-009/DEC-010 and `THREAT_MODEL.md` §3 — and remain subject to review.

## 4. Contradiction findings from inspection (no silent edits)

Recorded in `DECISIONS.md` §"Contradiction findings carried into this document":

- **F-01** entity list counts 13 when enumerated separately vs "10" in prior chat summary → canonical 13 proposed.
- **F-02** Gatehead "consults access-control" wording vs authorization-before-actuation ordering, and the circular-dependency risk between them → Gatehead is proposed to be policy-free; amendment of D3 rule 3 wording requested.
- **F-03** `is_simulated`/`is_live` boolean pair permits impossible combinations → already resolved by Amd 2.1's discriminated operating-mode enum; `DOMAIN.md` codifies it.
- **F-04** `docs/README.md` role described as "empty index" → proposed as an actual index file (created in this pass).

## 5. What P1 will receive from discovery

- Approved set of entities and lifecycles in `DOMAIN.md`.
- Approved adapter contracts and dependency-direction rule in `GATEHEAD.md`.
- Threat-model exposure boundary constraints in `THREAT_MODEL.md` (zone Z2 must not gain internet surfaces in P1–P5).
- Decision-matrix verdicts to implement (React/Vite/Fastify/SQLite/drizzle/SSE, budget accounting per Amd 2.1 D1) — see `DECISIONS.md`.
- The blocked-vs-allowed list in `NEXT.md`.

## 6. Risks / unknowns carried forward

- Hardware is absent; every hardware-facing statement is provisional (C4 honored by content, not by intent): see `ASSUMPTIONS.md` A-01, A-02, A-08.
- `docs/OPENCODE_BUILD_PLAN.md` remains the source of truth; the amendments requested by F-01/F-02/F-04 need the project owner's go-ahead, recorded in `NEXT.md` §Questions for the project owner.
