# Epic 2 Retrospective: Dependency Management & Observability Stack

**Epic:** Epic 2 — Dependency Management & Observability Stack
**Date:** 2026-03-15
**Stories Completed:** 3 (2-1, 2-2, 2-3)
**Status:** All stories done

---

## Epic Summary

Epic 2 delivered the full observability pipeline for codeharness. Starting from the CLI foundation built in Epic 1, the epic produced: automatic dependency installation with fallback chains (deps.ts), OTLP instrumentation for Node.js and Python projects (otlp.ts), Docker Compose-based VictoriaMetrics stack management with pinned image versions (docker.ts, docker-compose.ts, otel-config.ts), a partial `status` command with `--check-docker` health reporting and endpoint URLs (status.ts), and agent-facing plugin artifacts — an observability querying knowledge file, a visibility-enforcement skill, and a post-test-verify hook.

By the end of Epic 2, the project has 1,607 lines of production TypeScript across 18 source files and 2,178+ lines of test code across the 7 new/modified test files. All 270 unit tests pass. Coverage sits at 98.22% statements, 91.3% branches, 100% functions, 99.24% lines. The init command grew from 275 lines (Epic 1) to 398 lines. Three new modules were created (deps.ts: 168 lines, otlp.ts: 185 lines, docker.ts expanded to 167 lines) plus two template modules (docker-compose.ts: 73 lines, otel-config.ts: 45 lines).

---

## What Went Well

### 1. Story Sequencing Was Correct

The three-story breakdown — install dependencies first (2.1), stand up Docker stack second (2.2), give the agent query knowledge third (2.3) — was well-ordered. Each story consumed outputs from the previous one: 2.2 used OTLP config from 2.1's state extension, 2.3 relied on 2.2's Docker health check and OTel Collector config. No story required rework of an earlier story.

### 2. Module Boundaries Stayed Clean

Despite init.ts growing to 398 lines, the architecture held. Dependency logic lives in deps.ts, OTLP instrumentation in otlp.ts, Docker lifecycle in docker.ts. Init.ts remained an orchestrator calling into these modules. The init command imports 7 modules but doesn't duplicate their logic. Epic 1 retro action A5 (consider splitting init into orchestrator + step functions) was partially addressed — the actual split into separate modules achieved the testability goal without the overhead of a formal step-runner pattern.

### 3. Template Embedding Strategy Proved Sound

Both docker-compose.ts and otel-config.ts are compact TypeScript functions returning YAML strings (73 and 45 lines respectively). This follows Architecture Decision 6 and avoids external file copying. Templates are testable, type-checked, and bundled into the CLI. The tests validate generated YAML is parseable, image tags are pinned, and port mappings are correct.

### 4. Test Coverage Remains Strong

270 tests across 14 test files, all passing. Statement coverage at 98.22% and function coverage at 100%. The new modules (deps.ts, otlp.ts, docker.ts, docker-compose.ts, otel-config.ts, status.ts) all achieved 100% line coverage. The test-to-production ratio for Epic 2 code specifically is ~2:1 (2,178 test lines for 1,120 production lines in new files).

### 5. Dependency Fallback Chains Are Production-Ready

The deps.ts module handles real-world complexity: pip vs pipx fallbacks for Showboat and beads, critical vs non-critical failure modes, already-installed detection via version commands, and observability-gated OTLP deps. The interface design (DependencySpec with InstallCommand arrays) is extensible for future tools.

---

## What Could Be Improved

### 1. Plugin Artifacts Landed in a Different Location Than Planned

Story 2.3 planned plugin artifacts under `plugin/knowledge/`, `plugin/skills/`, and `plugin/hooks/`. The actual implementation placed them at the repo root: `knowledge/`, `skills/`, `hooks/`. This is likely the correct location for a Claude Code plugin (matching the auto-discovery convention), but it's a deviation from the story specification. The story file's dev notes and task list should have been updated to reflect this architectural decision.

### 2. Story Files Still Show "Status: ready-for-dev"

This is a repeat finding from the Epic 1 retrospective (action A3). All three story markdown files still have `Status: ready-for-dev` in their headers. Sprint-status.yaml correctly tracks them as `done`, but the story files are stale. The process fix from Epic 1 retro was not implemented.

### 3. init.ts Has Uncovered Branches at Lines 244 and 316

The coverage report shows init.ts at 98.62% statements with uncovered lines 244 and 316. Epic 1 retro action A4 asked to cover the uncovered branches in init.ts (then at lines 161, 254). The lines shifted as init grew, and new uncovered branches appeared. The gap pattern persists — init.ts edge cases continue to slip through testing.

### 4. index.ts Lines 38-39 Still Uncovered

This was flagged in Epic 1 retro (action A4) and remains unfixed. The error handler path in the CLI entry point has no test coverage at 87.5% statements. Two epics have now passed without addressing this.

### 5. Branch Coverage at 91.3% — Multiple Files Have Gaps

While line and function coverage are strong, branch coverage shows gaps in deps.ts (84.37%), docker.ts (83.33%), otlp.ts (95%), and state.ts (90.27%). These represent error handling paths and fallback logic that are exactly the code paths most likely to fail in production. The 100% coverage target from story acceptance criteria was met for lines/functions but not branches.

### 6. No Integration Test for the Full Init Pipeline

Epic 1 retro action A1 called for an integration test that runs `codeharness init` as a subprocess. This wasn't addressed in Epic 2 (it was targeted at Epic 4). With init now spanning dependency install, OTLP instrumentation, and Docker stack management, the gap is larger. Unit test mocks verify individual pieces but don't catch wiring issues between the 7 modules init.ts imports.

---

## Lessons Learned

### L1: Orchestrator + Modules Scales Better Than Step-Runner

Epic 1 retro suggested a formal step-runner pattern for init.ts. In practice, extracting logic into focused modules (deps.ts, otlp.ts, docker.ts) with init.ts as a thin orchestrator achieved the same goal with less indirection. At 398 lines, init.ts is large but readable — each step is a clearly named function call. The step-runner pattern would add abstraction without reducing complexity.

### L2: Docker Compose Templates Need Version Pinning Discipline

Pinning all Docker image versions (NFR11) required conscious effort. The template embeds `victoriametrics/victoria-logs:v1.15.0`, `victoriametrics/victoria-metrics:v1.106.1`, `jaegertracing/all-in-one:1.56`, and `otel/opentelemetry-collector-contrib:0.96.0`. This is correct for reproducibility but creates a maintenance burden — these versions will need periodic updates. There's no automated check for stale image versions.

### L3: Plugin Artifact Location Matters for Auto-Discovery

Story 2.3 planned `plugin/` subdirectory but implementation used repo-root directories (`hooks/`, `knowledge/`, `skills/`). This aligns with Claude Code's plugin auto-discovery behavior, which scans known directory names at the repo root. The architecture spec should be updated to reflect the actual convention. Future stories referencing `plugin/` paths need correction.

### L4: The DependencySpec Pattern Is Reusable

The `DependencySpec` interface (name, displayName, installCommands[], checkCommand, critical, requiresObservability) is a clean data-driven pattern for managing external tool dependencies. It cleanly separates "what to install" from "how to install." This pattern should be reused when adding new tools in future epics.

### L5: Observability Enforcement Is a Cross-Cutting Concern

The `--no-observability` flag gates: OTLP dependency installation (deps.ts), OTLP instrumentation (otlp.ts), Docker Compose generation (init.ts), Docker stack startup (init.ts), and agent querying guidance (skill.md, post-test-verify.sh). This single flag touches 5+ files. It works cleanly because the flag is read once in init.ts and passed as a parameter — no global state. This pattern should continue.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | Add integration test that runs `codeharness init` as a subprocess and verifies full output + file creation (carried from Epic 1) | Epic 4 | Dev |
| A2 | Either automate story file status updates or remove the `Status:` field from story markdown files (carried from Epic 1, still unresolved) | Process | SM |
| A3 | Cover the error handler path in index.ts (lines 38-39) — two epics overdue (carried from Epic 1) | Epic 3 | Dev |
| A4 | Improve branch coverage in deps.ts, docker.ts, otlp.ts, state.ts — target 95%+ branches, not just lines | Epic 3 | Dev |
| A5 | Update architecture spec to reflect actual plugin artifact locations: `hooks/`, `knowledge/`, `skills/` at repo root, not under `plugin/` subdirectory | Epic 3 | Architect |
| A6 | Add automated check for stale Docker image version pins in docker-compose.ts template | Epic 4 | Dev |
| A7 | Update story 2.3 task list references from `plugin/` to repo-root paths for future reference accuracy | Backlog | SM |

---

## Epic 1 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Integration test for `codeharness init` as subprocess | Carried to Epic 4 | Gap is now larger with 7 module imports |
| A2 | Refactor stack detection for explicit priority map | Not yet needed | Only Node.js and Python supported; no new stacks added |
| A3 | Automate story file status updates or remove Status field | Not done | Repeated in this retro as A2 |
| A4 | Cover uncovered branches in index.ts and init.ts | Partially done | init.ts branches shifted, new gaps at 244/316; index.ts 38-39 still uncovered |
| A5 | Consider splitting init into orchestrator + step functions | Done (differently) | Used module extraction instead of step-runner pattern; achieved same testability goal |

---

## Next Epic Readiness

**Epic 3: Beads & BMAD Integration** is next in the backlog. It covers:
- Story 3-1: Beads installation + CLI wrapper
- Story 3-2: BMAD installation + workflow patching
- Story 3-3: BMAD parser + story bridge command
- Story 3-4: Beads sync + issue lifecycle

**Prerequisites met:**
- Beads is installed via deps.ts (install step done in Story 2.1)
- State management supports nested optional sections (otlp, docker — pattern for beads section)
- CLI foundation is solid with 270 passing tests
- Docker stack is managed (beads may need its own containers in future)
- Plugin artifact structure established (hooks/, knowledge/, skills/)

**Risks for Epic 3:**
- Story 3-1 wraps the `bd` CLI — this depends on beads' CLI interface stability. Any breaking changes in beads will break the wrapper.
- Story 3-2 patches BMAD workflows — this is fragile if BMAD's internal structure changes. Need clear version pinning.
- Story 3-3 parses BMAD story files — markdown parsing is inherently brittle. Need robust error handling for malformed stories.
- Story 3-4 syncs state between beads and external issue trackers — this introduces external API dependencies that are harder to test and mock.

---

## Metrics

- **Stories planned:** 3
- **Stories completed:** 3
- **Stories failed:** 0
- **New production TypeScript files created:** 5 (deps.ts, otlp.ts, docker-compose.ts, otel-config.ts, status.ts extended)
- **Modified production TypeScript files:** 2 (docker.ts extended, init.ts extended)
- **New plugin artifact files:** 4 (observability-querying.md, SKILL.md, post-test-verify.sh, hooks.json)
- **Total production TypeScript files:** 18
- **Total production lines of code:** 1,607
- **New test files created:** 7 (deps, otlp, docker, docker-compose, otel-config, init updated, status)
- **Total test files:** 14
- **Total unit tests:** 270 (all passing)
- **Statement coverage:** 98.22%
- **Branch coverage:** 91.3%
- **Function coverage:** 100%
- **Line coverage:** 99.24%
- **Init command growth:** 275 lines (Epic 1) -> 398 lines (Epic 2), +44.7%
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~721ms (vitest)
