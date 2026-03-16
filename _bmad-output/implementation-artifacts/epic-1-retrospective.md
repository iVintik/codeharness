# Epic 1 Retrospective: CLI Foundation & Project Initialization

**Epic:** Epic 1 — CLI Foundation & Project Initialization
**Date:** 2026-03-15
**Stories Completed:** 3 (1-1, 1-2, 1-3)
**Status:** All stories done

---

## Epic Summary

Epic 1 delivered the TypeScript CLI foundation for codeharness. Starting from zero TypeScript code, the epic produced a fully functional `codeharness` binary with Commander.js, output utilities, core libraries (state management, stack detection, template generation), and a working `init` command. The CLI can be installed globally, detects project stacks, manages YAML-frontmatter state files, checks Docker availability, scaffolds documentation, and handles idempotent re-initialization.

By the end of Epic 1, the project has 689 lines of production TypeScript across 8 source files and 1,316 lines of test code across 9 test files. All 134 unit tests pass. Coverage sits at 97.44% statements, 93.63% branches, 100% functions, 99.31% lines. The build produces an 18KB ESM bundle.

---

## What Went Well

### 1. Clean Sequential Story Decomposition

The three-story breakdown was well-structured: scaffold first (1.1), libraries second (1.2), integration third (1.3). Each story had clear inputs and outputs, and each built directly on the previous one. No story required backtracking or rework of earlier stories.

### 2. Near-Complete Test Coverage From Day One

Coverage targets were aggressive (100%) and nearly achieved: 97.44% statements, 100% functions. The 9 test files with 134 tests provide a strong safety net for future changes. The test-to-production ratio (~1.9:1 by lines) indicates thorough testing without being excessive.

### 3. Technology Choices Proved Sound

- **Commander.js** over oclif: lightweight, 40-line entry point, no framework overhead. Right call for 7 commands.
- **tsup** over tsc for bundling: single-file output with shebang, 11ms builds. Fast iteration.
- **vitest** over jest: fast, ESM-native, no configuration gymnastics.
- **yaml** package over hand-rolled parsing: correct YAML serialization from the start. No edge-case bugs.

### 4. Architecture Decisions Translated Cleanly to Code

Architecture Decision 2 (state management via YAML frontmatter in `.claude/codeharness.local.md`) mapped directly to `state.ts`. Decision 6 (template embedding as TypeScript literals) mapped to `templates.ts`. Decision 5 (Docker lifecycle) mapped to the conditional Docker check in `init.ts`. No architecture-to-implementation gaps.

### 5. Idempotent Init Was Designed In, Not Bolted On

Re-run safety (AC #6 of Story 1.3) was an acceptance criterion from the start, not an afterthought. The init command checks for existing state and preserves it. This prevents the common "init destroyed my config" failure mode.

---

## What Could Be Improved

### 1. Story Files Still Show "Status: ready-for-dev"

All three story files still have `Status: ready-for-dev` in their markdown headers despite being completed. The sprint-status.yaml correctly tracks them as `done`, but the story files themselves are stale. Either the workflow should update story file status, or the status field should be removed from story files to avoid confusion (single source of truth in sprint-status.yaml).

### 2. Coverage Gaps in index.ts and init.ts Branches

`index.ts` is at 87.5% statements (lines 38-39 uncovered — likely the error handler path). `init.ts` has two uncovered branches (lines 161, 254). These are minor but represent edge cases that could bite later. The uncovered branches should be explicitly tested or documented as intentionally untested.

### 3. Docker Module Was Extracted But Not Planned

`src/lib/docker.ts` (10 lines) was created during implementation but wasn't in the original story task lists. This is a good architectural decision (separation of concerns), but it means the implementation deviated from the story plan. Minor, but worth noting that implementation details will diverge from pre-written task lists — the task lists should be treated as guidance, not contracts.

### 4. stack-detect.ts Is Minimal

At 12 lines, stack detection is a thin wrapper around `existsSync` checks. It works, but the priority ordering (Node.js wins when both indicators exist) is implicit in code order rather than explicit. As more stacks are added (Go, Rust, Java), this will need restructuring. The current design is adequate for now but has a short shelf life.

### 5. No Integration Test Across the Full CLI

Unit tests cover individual functions well, but there's no test that runs `codeharness init` as a subprocess and verifies the end-to-end output and file creation. The `cli.test.ts` tests Commander.js registration but not full command execution. An integration test would catch wiring issues that unit tests miss.

---

## Lessons Learned

### L1: Small Libraries Compound Into Significant Capability

Each individual library is tiny: `output.ts` (39 lines), `stack-detect.ts` (12 lines), `templates.ts` (11 lines), `docker.ts` (10 lines). But combined through `init.ts` (275 lines), they produce a complete initialization flow. The "many small modules" approach keeps each piece testable and replaceable.

### L2: YAML Frontmatter State Format Works Well

The decision to store state as YAML frontmatter in a markdown file (`.claude/codeharness.local.md`) paid off. It's human-readable, parseable by both the CLI and plugin hooks, and the markdown body below the frontmatter provides a natural place for human-facing notes. The `yaml` package handles serialization/deserialization without edge cases.

### L3: Stub Commands Enable Incremental Delivery

Registering all 7 commands as stubs in Story 1.1, then replacing them incrementally (state in 1.2, init in 1.3), keeps the CLI coherent at every stage. Users always see the full command surface; unimplemented commands fail with actionable messages pointing to the relevant epic. This pattern should continue for bridge, run, verify, status, onboard, and teardown.

### L4: Test Coverage Targets Drive Better Design

The 100% coverage target forced extraction of the Docker check into a separate module (`docker.ts`) so it could be mocked independently. It also pushed the state module toward pure functions with injectable directory parameters. Coverage targets aren't just about quality — they shape architecture.

### L5: ESM-Only Was the Right Decision

Going ESM-only (`"type": "module"` in package.json) from the start avoided the CommonJS/ESM interop complexity that plagues many Node.js projects. tsup handles the bundling, vitest runs ESM natively. No dual-format headaches.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | Add integration test that runs `codeharness init` as a subprocess and verifies full output + file creation | Epic 4 | Dev |
| A2 | When extending stack detection for new stacks, refactor to explicit priority map instead of code-order priority | Epic 2+ | Dev |
| A3 | Either automate story file status updates or remove the `Status:` field from story markdown files | Process | SM |
| A4 | Cover the uncovered branches in `index.ts` (error handler) and `init.ts` (lines 161, 254) | Epic 2 | Dev |
| A5 | When `init` grows in Epic 2 (dependency install, Docker Compose), consider splitting it into orchestrator + step functions to keep testability | Epic 2 | Dev |

---

## Next Epic Readiness

**Epic 2: Dependency Management & Observability Stack** is next in the backlog. It covers:
- Story 2-1: Dependency auto-install + OTLP instrumentation
- Story 2-2: Docker Compose + VictoriaMetrics stack management
- Story 2-3: Observability querying + agent visibility into runtime

**Prerequisites met:**
- CLI foundation is solid (Commander.js, output utilities, build pipeline)
- State management works (read/write/corruption recovery)
- Stack detection works (Node.js and Python)
- Docker availability check exists (can be extended for Docker Compose)
- Template generation mechanism exists (ready for docker-compose.yml and otel-config templates)

**Risks for Epic 2:**
- Story 2-1 (dependency auto-install) involves `npm install` and `pip install` subprocesses, which are harder to test deterministically than filesystem operations. Mock strategy needs careful design.
- Story 2-2 (Docker Compose management) requires Docker Compose as a real dependency. Tests will need either Docker-in-CI or carefully scoped mocks.
- Story 2-3 (observability querying) interfaces with VictoriaMetrics and Grafana APIs — external service dependencies that may need test fixtures.

---

## Metrics

- **Stories planned:** 3
- **Stories completed:** 3
- **Stories failed:** 0
- **Production TypeScript files created:** 8
- **Test files created:** 9
- **Production lines of code:** 689
- **Test lines of code:** 1,316
- **Unit tests:** 134 (all passing)
- **Statement coverage:** 97.44%
- **Branch coverage:** 93.63%
- **Function coverage:** 100%
- **Line coverage:** 99.31%
- **Bundle size:** 18.19 KB (ESM)
- **Build time:** 11ms (tsup)
- **Test execution time:** 388ms (vitest)
