# Epic 9 Retrospective: Observability Rearchitecture — Shared Stack, Universal Instrumentation, Mandatory Telemetry

**Epic:** Epic 9 — Observability Rearchitecture
**Date:** 2026-03-15
**Stories Completed:** 5 (9-1, 9-2, 9-3, 9-4, 9-5)
**Status:** All stories done
**Final Epic:** Yes — this is the last epic in the codeharness project.

---

## Epic Summary

Epic 9 rearchitected the observability subsystem from a per-project Docker stack into a shared, multi-modal, mandatory telemetry platform. The five stories built progressively: 9-1 moved Docker to a shared machine-level location, 9-2 added remote backend support, 9-3 removed the opt-out escape hatch, 9-4 extended instrumentation to all app types, and 9-5 enforced data isolation across projects sharing the same backends.

**Story 9.1 — Shared Machine-Level Observability Stack** moved the Docker Compose stack from per-project directories to a single shared location at `~/.codeharness/stack/`. A new `stack-path.ts` module handles XDG-aware directory resolution. The Docker layer gained `isSharedStackRunning()`, `startSharedStack()`, and `stopSharedStack()` functions using a fixed `codeharness-shared` compose project name. A new `codeharness stack` command was added with `start`, `stop`, and `status` subcommands. `init` now discovers an existing shared stack instead of starting a duplicate, and `teardown` never stops the shared stack — only `stack stop` does, with an explicit warning.

**Story 9.2 — Remote Backend Support** introduced three OTLP modes: `local-shared` (full local Docker stack, the default), `remote-direct` (no local containers, app sends OTLP directly to a remote endpoint), and `remote-routed` (local OTel Collector forwards to remote VictoriaMetrics/Logs/Traces backends). Four new CLI flags (`--otel-endpoint`, `--logs-url`, `--metrics-url`, `--traces-url`) with mutual exclusivity validation were added to `init`. New Docker functions (`startCollectorOnly`, `isCollectorRunning`, `stopCollectorOnly`) and a `checkRemoteEndpoint()` health checker using Node 18+ `fetch()` were added. All commands (status, teardown, stack) became mode-aware.

**Story 9.3 — Mandatory Observability (Remove Opt-Out)** removed the `--no-observability` flag from `init`, deleted `enforcement.observability` from the state interface, and stripped all conditional guards around observability setup in init, status, hooks, deps, and onboard-checks. When Docker is unavailable and no remote flags are given, init degrades gracefully (warns and continues) instead of aborting. Legacy projects with `observability: false` get upgraded on re-run.

**Story 9.4 — Universal Instrumentation (Web, CLI, Agent)** added an `AppType` classification (`server | cli | web | agent | generic`) via a new `detectAppType()` function in `stack-detect.ts`. CLI projects get fast-flush batch processor settings (`OTEL_BSP_SCHEDULE_DELAY=100`). Web projects get `@opentelemetry/sdk-trace-web` packages and a CORS-enabled OTel Collector config. Agent projects get OpenLLMetry (`traceloop-sdk`) for LLM call tracing. The instrumentation pipeline dispatches to type-specific configurators after base setup.

**Story 9.5 — Data Isolation & Multi-Project Query Patterns** ensured telemetry from different projects is separable. `ensureServiceNameEnvVar()` writes `OTEL_SERVICE_NAME` to `.env.codeharness`. The OTel Collector config gained a `resource/default` processor that tags unattributed telemetry with `service.name=unknown`. Status output now shows service-scoped query URLs with filters pre-applied. A new `codeharness query` command provides `logs`, `metrics`, and `traces` subcommands that auto-inject `service.name` filters. The knowledge file was updated with service-scoped query examples throughout.

By the end of Epic 9, the project has 9,680 lines of production TypeScript across 39 source files and 16,916 lines of test code across 41 test files. All 1,210 unit tests pass. Coverage sits at 93.23% statements, 81.20% branches, 97.85% functions, 93.62% lines. Test execution time is ~1.97s.

---

## What Went Well

### 1. Five-Story Epic With Clean Progressive Architecture

Each story cleanly extended the previous one's foundation: 9-1 established the shared stack, 9-2 added remote alternatives on the same abstractions, 9-3 could remove opt-out because 9-1/9-2 eliminated every reason to opt out, 9-4 plugged new app types into the instrumentation pipeline built in 9-1/9-2, and 9-5 added data isolation on top of all four. No story required rework of a predecessor.

### 2. Mode System Provides Clean Separation of Concerns

The three-mode architecture (`local-shared`, `remote-direct`, `remote-routed`) gives every command a clean dispatch pattern: detect mode from state, branch accordingly. This replaced scattered Docker conditionals with a single `state.otlp?.mode` check. The pattern is consistent across init, status, teardown, stack, and query commands.

### 3. Largest Epic by Story Count, Executed in One Sprint

Five stories is the highest story count in any single epic (previous max was 4 in Epics 3, 4, and 8). The scope was larger than prior epics, yet all five stories completed without any needing to carry over. The key enabler was that each story's interface to the next was well-defined in the acceptance criteria.

### 4. New `query` Command Completes the Observability Loop

Prior to Epic 9, the agent had to manually construct curl commands from the knowledge file. The `codeharness query logs/metrics/traces` command with auto-injected `service.name` filters closes the loop: init instruments, stack runs, query reads. This end-to-end flow is the culmination of work started in Epic 2.

### 5. Test Count Grew by 20.9%

From 1,001 tests (Epic 8 end) to 1,210 tests — 209 new tests across the five stories. This is the largest absolute test count increase in any epic. The new `query.test.ts` and `stack.test.ts` files contributed the bulk, alongside substantial additions to `init.test.ts`, `status.test.ts`, `docker.test.ts`, and `teardown.test.ts`.

---

## What Could Be Improved

### 1. Coverage Dropped Across All Four Metrics

| Metric | Epic 8 (End) | Epic 9 (End) | Delta |
|--------|-------------|-------------|-------|
| Statement | 95.23% | 93.23% | -2.00 pts |
| Branch | 85.09% | 81.20% | -3.89 pts |
| Function | 98.10% | 97.85% | -0.25 pts |
| Line | 95.62% | 93.62% | -2.00 pts |

Despite adding 209 tests, coverage dropped because production code grew faster than test code in coverage-effective areas. Branch coverage took the biggest hit (-3.89 points), falling below the 85% mark that was only reached in Epic 8. The new multi-modal logic (three OTLP modes x five app types x three commands) creates many branch paths, and not all were covered.

### 2. run.ts and verify.ts Still Untested — Permanent Debt Confirmed

Carried since Epics 5 and 4 respectively. These were flagged in every retrospective from Epic 4 onward. With Epic 9 as the final epic, these are confirmed permanent technical debt. The autonomous execution command (run.ts) — the tool's core value proposition — remained at ~30% coverage for five consecutive epics.

### 3. Story File Status Headers Still Show "ready-for-dev"

Stories 9-1, 9-3, 9-4, and 9-5 show `Status: ready-for-dev` in their headers while sprint-status.yaml shows `done`. This divergence has persisted across all nine epics. The `codeharness sync` command exists but was never integrated into the workflow. Story 9-2 is the only one with a proper Dev Agent Record.

### 4. Coverage Enforcement Was Never Automated

Flagged in every retrospective from Epic 4 onward. The tool can check coverage but doesn't enforce it on itself. The coverage drop in Epic 9 is precisely the scenario that automated enforcement would have caught.

---

## Lessons Learned

### L1: Multi-Modal Systems Need Combinatorial Test Plans

Three OTLP modes times five app types times multiple commands creates a matrix of 15+ combinations per command. Testing each mode independently is insufficient — cross-mode interactions (e.g., web app with remote-routed mode) need explicit test cases. The coverage drop in Epic 9 reflects that combinatorial paths were under-tested. Future multi-modal systems should define the test matrix up front and use parameterized tests.

### L2: Making Features Mandatory Is Easier When Alternatives Exist

Story 9-3 (remove opt-out) was trivial to implement because Stories 9-1 and 9-2 had already eliminated every valid reason to opt out: Docker resource waste was solved by shared stack, Docker unavailability was solved by remote mode. The lesson: if you want to make something mandatory, first solve every objection, then remove the escape hatch. Attempting to make observability mandatory without 9-1/9-2 would have required ignoring legitimate user concerns.

### L3: App Type Detection Is Heuristic — Accept Ambiguity

`detectAppType()` uses a priority-ordered heuristic (agent > web > cli > server > generic) because real projects often match multiple categories. A project with `openai` in dependencies and a `bin` field is both an agent and a CLI tool. The priority order resolves ambiguity, but the `generic` fallback ensures unknown project types still get base instrumentation. Heuristic classification with a safe fallback beats strict classification that fails on edge cases.

### L4: Service-Scoped Queries Should Be the Default, Not an Afterthought

Story 9-5 retrofitted `service.name` filters onto query patterns that had existed since Epic 2. For four epics, the knowledge file's example queries returned data from all projects indiscriminately. In a shared-stack world, unscoped queries are actively misleading. Data isolation should be designed into query patterns from the first moment shared infrastructure is introduced, not added five stories later.

### L5: Coverage Metrics Can Move Backward Even While Test Count Grows

Epic 9 added 209 tests (20.9% growth) yet lost coverage across all four metrics. This happens when new production code has more branches per line than the average existing codebase (multi-modal dispatch logic is branch-heavy). Test count alone is a misleading quality indicator — branch coverage is the metric that reveals untested logic paths.

---

## Epic 8 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Permanent technical debt. |
| A2 | Raise scanner.ts branch coverage from 74.1% to 90%+ | Not done | Permanent technical debt. |
| A3 | Raise overall branch coverage from 82.32% to 85%+ | Regressed | Was at 85.09% after Epic 8, dropped to 81.20% after Epic 9. |
| A4 | Wire `codeharness coverage` into pre-commit gate or CI | Not done | Permanent technical debt. |
| A5 | Run `codeharness sync` after story completion | Not done | Tenth consecutive carry. Permanent process gap. |

**Summary:** 0 of 5 action items from Epic 8 were resolved. A3, which had been achieved organically in Epic 8, regressed in Epic 9 due to the coverage drop.

---

## Overall Project Summary (Final)

Codeharness was built across 10 epics (Epic 0 through Epic 9), delivering a CLI development harness for Claude Code that instruments projects with observability, quality gates, issue tracking, brownfield onboarding, and autonomous execution capabilities.

### Epic Timeline

| Epic | Focus | Stories | Key Deliverables |
|------|-------|---------|------------------|
| 0 | Sprint Execution Skill | 1 | `/harness-run` in-session sprint loop |
| 1 | Project Scaffold | 3 | CLI entry point, core libraries, `init` command |
| 2 | Observability Stack | 3 | Dependency install, Docker Compose, OTLP, observability querying |
| 3 | Beads & BMAD Integration | 4 | Beads install/CLI, BMAD install/patching, parser bridge, issue sync |
| 4 | Verification & Quality | 4 | Verification pipeline, hook architecture, testing/coverage, doc health |
| 5 | Ralph Loop Integration | 2 | Ralph task source, verification gates, termination tracking |
| 6 | Brownfield Onboarding | 2 | Codebase scan, coverage gap analysis, onboarding epic generation |
| 7 | Status & Lifecycle | 2 | Status command, clean teardown |
| 8 | Onboarding Hardening | 4 | Gap-id dedup, precondition checks, extended gap detection, scan caching |
| 9 | Observability Rearchitecture | 5 | Shared stack, remote backends, mandatory telemetry, universal instrumentation, data isolation |

### Final Metrics

- **Total production TypeScript:** 9,680 lines across 39 source files
- **Total test code:** 16,916 lines across 41 test files
- **Total unit tests:** 1,210 (all passing)
- **Statement coverage:** 93.23%
- **Branch coverage:** 81.20%
- **Function coverage:** 97.85%
- **Line coverage:** 93.62%
- **Test execution time:** ~1.97s
- **Build system:** tsup (ESM bundle)
- **Test framework:** vitest
- **Test-to-production ratio:** 1.75x (16,916 / 9,680)

### Growth Across Epics

| Metric | Epic 8 (End) | Epic 9 (End) | Delta |
|--------|-------------|-------------|-------|
| Production lines | 8,144 | 9,680 | +1,536 (+18.9%) |
| Test lines | 14,276 | 16,916 | +2,640 (+18.5%) |
| Unit tests | 1,001 | 1,210 | +209 (+20.9%) |
| Source files | 36 | 39 | +3 |
| Test files | 38 | 41 | +3 |
| Statement coverage | 95.23% | 93.23% | -2.00 pts |
| Branch coverage | 85.09% | 81.20% | -3.89 pts |
| Function coverage | 98.10% | 97.85% | -0.25 pts |
| Line coverage | 95.62% | 93.62% | -2.00 pts |

### Full Project Growth (Epic 1 to Epic 9)

| Metric | Epic 1 (End) | Epic 9 (End) | Growth |
|--------|-------------|-------------|--------|
| Production lines | ~1,500 | 9,680 | 6.5x |
| Test lines | ~2,200 | 16,916 | 7.7x |
| Unit tests | ~150 | 1,210 | 8.1x |
| Source files | 12 | 39 | 3.3x |
| Test files | 10 | 41 | 4.1x |

### Known Technical Debt (Final State)

| Item | Coverage | Carried Since |
|------|----------|---------------|
| run.ts action handler (lines 110-276) | ~30% statements | Epic 5 |
| verify.ts branch coverage | ~63% branches | Epic 4 |
| Story file status headers vs sprint-status.yaml | N/A | Epic 1 |
| Coverage enforcement not in CI/pre-commit | N/A | Epic 4 |
| Branch coverage below 85% target | 81.20% | Epic 9 (new regression) |

### What the Project Got Right

1. **Progressive architecture in Epic 9:** Shared stack -> remote support -> mandatory -> universal -> isolation. Each story built on the previous, and the final system supports 15+ configuration combinations cleanly.
2. **Library-first architecture:** Well-factored modules enabled reuse across all nine epics. Epic 9 composed `isSharedStackRunning`, `checkRemoteEndpoint`, `detectAppType`, `ensureServiceNameEnvVar`, and `resolveEndpoints` from clean module interfaces.
3. **Fail-open pattern:** External dependency failures (Docker, remote endpoints, state file) degrade gracefully. Story 9-3's Docker-unavailable handling exemplifies this: warn and continue, don't abort.
4. **Test investment:** 16,916 lines of test code with 1,210 tests running in ~2s. The 1.75x test-to-production ratio held consistent despite the codebase nearly doubling from Epic 1.
5. **Consistent CLI patterns:** `ok()`, `fail()`, `info()`, `warn()`, `jsonOutput()`, `--json` flag, Commander.js subcommands — uniform across all commands including the new `stack` and `query` additions.

### What the Project Should Have Done Differently

1. **Coverage enforcement was never automated.** Flagged in six consecutive retrospectives (Epics 4-9), never addressed. Epic 9 proved the cost: branch coverage regressed below 85% without anyone noticing until the retrospective.
2. **run.ts was never tested.** Five epics of carrying this debt. The autonomous execution command is the tool's primary value proposition.
3. **Retrospective action items had no teeth.** Zero of five Epic 8 action items were resolved in Epic 9. One that had been "resolved" (branch coverage at 85%) actually regressed. Without automated gates, action items are aspirational documentation.
4. **Story file status sync was never integrated.** Ten consecutive carries. The divergence between story file headers and sprint-status.yaml persisted across every epic without resolution.
5. **Multi-modal testing needed a combinatorial plan.** The coverage drop in Epic 9 was predictable: three modes x five app types x multiple commands creates dozens of paths. A test matrix defined up front would have identified gaps before they became coverage debt.

---

## Metrics

- **Stories planned:** 5
- **Stories completed:** 5
- **Stories failed:** 0
- **New production TypeScript files created:** 3 (stack-path.ts, stack.ts, query.ts)
- **Production files substantially modified:** 8 (init.ts, status.ts, teardown.ts, docker.ts, otlp.ts, state.ts, stack-detect.ts, otel-config.ts)
- **Total new production lines:** ~1,536 (9,680 - 8,144)
- **Total production TypeScript files:** 39 (up from 36)
- **Total production lines of code:** 9,680
- **Test files created:** 3 (stack.test.ts, query.test.ts, stack-path.test.ts)
- **Total new test lines:** ~2,640 (16,916 - 14,276)
- **Total test files:** 41 (up from 38)
- **Total unit tests:** 1,210 (up from 1,001, +20.9%)
- **Total test lines:** 16,916 (up from 14,276, +18.5%)
- **Statement coverage:** 93.23% (down from 95.23%)
- **Branch coverage:** 81.20% (down from 85.09%)
- **Function coverage:** 97.85% (down from 98.10%)
- **Line coverage:** 93.62% (down from 95.62%)
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~1.97s (vitest)
- **Epic 8 retro actions resolved:** 0 of 5 (A3 regressed)
