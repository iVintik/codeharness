# Epic 9 Retrospective: Multi-Stack Project Support

**Epic:** Epic 9 -- Multi-Stack Project Support
**Date:** 2026-03-23
**Stories Completed:** 5 (9-1, 9-2, 9-3, 9-4, 9-5)
**Status:** All stories done
**Sessions:** 4 (sessions 7-10)

---

## Epic Summary

Epic 9 added multi-stack project support to codeharness, enabling monorepos with multiple languages (e.g., Node.js frontend + Rust backend) to get full harness features for every detected stack. The five stories built progressively: 9-1 added detection, 9-2 migrated state, 9-3 wired the init orchestrator, 9-4 handled Dockerfiles, and 9-5 updated docs and remaining consumers.

**Story 9-1 -- Multi-stack detection with subdirectory scanning** introduced `StackDetection` interface and `detectStacks()` function in `stack-detect.ts`. Root and one-level-deep subdirectory scanning with a `SKIP_DIRS` exclusion set (`node_modules`, `.git`, `target`, etc.). `detectStack()` became a backward-compat wrapper delegating to `detectStacks()[0]`. Ordering: root stacks first in priority order, then subdirs alphabetically.

**Story 9-2 -- State schema migration for multi-stack** added `stacks: StackName[]` to `HarnessState`, with automatic migration from old `stack`-only state files. `writeState()` writes both `stacks` array and `stack` scalar for backward compat. `isValidState()` accepts both formats. `recoverCorruptedState()` populates both fields.

**Story 9-3 -- Init orchestrator per-stack iteration** updated `init-project.ts` to iterate over all detected stacks for coverage tool detection and OTLP instrumentation. Per-stack coverage tools stored in `state.coverage.tools` map. `getStackLabel()` extended to accept arrays. Double filesystem scan eliminated by having `detectStacks()` be the single source of truth.

**Story 9-4 -- Multi-stage Dockerfile generation** added `multiStageTemplate()` that composes per-stack build stages (`FROM node:22-slim AS build-nodejs`, `FROM rust:1.82-slim AS build-rust`) with a combined runtime stage. Backward-compat overload: single `StackDetection[]` element produces byte-identical output to old single-stack path. Validator already handled multi-stage (no changes needed).

**Story 9-5 -- Multi-stack docs and remaining consumers** updated `generateAgentsMdContent()` for per-stack build/test command sections, `readmeTemplate()` for multi-stack install commands, `detectProjectType()` to use `detectStacks()`, and `teardown.ts` for `stacks?.includes()` checks. 18 new tests added.

---

## Final Metrics

- **Total unit tests:** 3,153 (all passing)
- **Statement coverage:** 97.05%
- **Branch coverage:** 88.56%
- **Function coverage:** 98.57%
- **Line coverage:** 97.52%
- **Test execution time:** ~8.7s (vitest)
- **Test files:** 115

---

## What Went Well

### 1. Code review caught critical bugs in every story

The sub-agent code review step found HIGH-severity issues in stories 9-2, 9-3, 9-4, and 9-5 -- all fixed before merge. Highlights:
- 9-2: `init-project.ts` never persisted multi-stacks to state (all `detectStacks()` results lost)
- 9-2: `writeState()` mutated caller's state object via side effect
- 9-2: `isValidState()` accepted `stacks: [42, true]` -- no element type checking
- 9-3: Per-stack coverage loop was dead code (called function, discarded return values)
- 9-3: Double filesystem scan (`detectStack()` + `detectStacks()` both called)
- 9-4: Type inconsistency between `DockerfileTemplateResult.stacks` (required) and `InitResult.dockerfile.stacks` (optional)
- 9-5: Single-element `StackDetection[]` bypassed single-stack path

Without code review, stories 9-2 and 9-3 would have shipped with data loss bugs.

### 2. Backward compatibility preserved across all five stories

Every function change used runtime `Array.isArray()` detection to dispatch between old single-value and new array paths. No existing callers broke. The `detectStack()` wrapper, dual `stack`/`stacks` state persistence, and overloaded signatures mean old state files, old callers, and old tests all continue to work unchanged.

### 3. Clean progressive dependency chain

Each story built on the previous one's output without requiring rework:
- 9-1 (`detectStacks`) -> 9-2 (`stacks` in state) -> 9-3 (init iterates stacks) -> 9-4 (Dockerfile per stack) -> 9-5 (docs/consumers per stack)

No story required changes to a predecessor.

### 4. Coverage stayed well above targets

Statement coverage at 97.05% and branch coverage at 88.56% -- both above the 90%/85% floors. This is a significant improvement from the previous sprint's Epic 9 endpoint (93.23% statements, 81.20% branches). The multi-stack epic added coverage-effective tests alongside new code.

### 5. 3,153 tests with zero regressions

Each story ran the full test suite as its final AC. No regressions were introduced despite touching core modules (state, init, stack-detect, dockerfile-template, docs-scaffold, verify/env, teardown).

---

## What Could Be Improved

### 1. Two stories left at "verifying" status due to session time exhaustion

Stories 9-4 and 9-5 both hit session time limits before the verifier could complete. They were left at `verifying` status and picked up by subsequent sessions. This is a recurring pattern -- verification is the most time-consuming phase and gets squeezed when implementation + code review take longer than expected.

### 2. Story file headers show stale statuses

Stories 9-1 through 9-4 still show `Status: verifying` in their headers while sprint-status.yaml shows `done`. This is the same divergence noted in every prior retrospective. The `codeharness sync` command exists but is not wired into the workflow.

### 3. Several LOW-severity issues left unfixed

Across the five stories, 8 LOW-severity issues were flagged and not fixed:
- `migrateState()` casts `raw.stack as StackName` without validating against known stack names
- `recoverCorruptedState()` calls both `detectStack()` and `detectStacks()` (double detection)
- Flaky test in `sprint/__tests__/state.test.ts > writeStateAtomic` (shared file race condition)
- `state.coverage.tools` map persisted but no consumer reads it yet
- `detectAppType` only considers primary root stack in multi-stack
- Stacks field naming collision between `DockerfileTemplateResult.stacks` and `InitResult.stacks`
- Inconsistent non-root user strategy (node vs nobody) in Dockerfiles
- Duplicated stack-to-label mapping between `getStackLabel()` and `stackDisplayName()`
- `verify-env.test.ts` still imports/mocks stale `detectStack` (singular)

### 4. docs-scaffold.ts at 295 lines -- approaching 300-line ceiling

Story 9-5 grew the file from 229 to ~295 lines. This is within the limit but leaves no room for future additions. The file needs extraction of helper functions into a separate module.

### 5. Dead/orphan code persists

`state.coverage.tools` is written but never read. `detectStack()` (singular) remains as a wrapper but some callers still import it directly instead of `detectStacks()`. `verify-env.test.ts` mocks the stale singular function.

---

## Lessons Learned

### L1: Overloaded signatures with runtime type detection scale well for backward compat

The `Array.isArray(second)` pattern -- used in `generateDockerfileTemplate()`, `generateAgentsMdContent()`, `getStackLabel()`, `getInstallCommand()` -- proved effective across all five stories. It preserves the old call signature while adding new capability. The cost is a small amount of runtime branching, but it eliminates the need to update every caller simultaneously.

### L2: State migration must be tested against actual file I/O, not just in-memory transforms

Story 9-2's code review found that `init-project.ts` never persisted multi-stacks to the state file -- the in-memory state was correct but the write path discarded the data. Unit tests that only validated in-memory objects would not have caught this. Integration tests that read back from disk are essential for state migration stories.

### L3: Per-stack iteration loops must have observable side effects

Story 9-3's coverage loop was dead code -- it called `getCoverageTool()` per stack but discarded all return values. The code review caught it because it checked whether loop iterations produced state changes. Any per-item loop in an orchestrator should either modify state, emit output, or return collected results.

### L4: Validation functions need type-level checking, not just shape checking

Story 9-2's `isValidState()` accepted `stacks: [42, true]` as valid because it only checked `Array.isArray()` without verifying element types. Validators should check element types for collection fields, especially when the data comes from user-editable files.

### L5: Session time budgets need explicit allocation for verification

Stories 9-4 and 9-5 both exhausted their session time during verification. The pattern is consistent: implementation takes ~60%, code review takes ~25%, leaving only ~15% for verification. Verification needs a guaranteed minimum time allocation, or it should be split into a separate session.

---

## Action Items

| # | Action | Priority | Notes |
|---|--------|----------|-------|
| A1 | Extract helper functions from `docs-scaffold.ts` (295/300 lines) | High | One more feature addition will hit the ceiling |
| A2 | Wire story status sync into workflow (`codeharness sync` after story completion) | Medium | Carried from every prior retrospective |
| A3 | Remove dead `state.coverage.tools` write or add a consumer | Medium | Written in 9-3 but never read |
| A4 | Consolidate `getStackLabel()` and `stackDisplayName()` duplication | Low | Two functions doing the same mapping |
| A5 | Update `verify-env.test.ts` to mock `detectStacks` (plural) instead of `detectStack` | Low | Stale mock, tests pass but test wrong function |
| A6 | Allocate explicit session time budget for verification phase | Process | 2 of 5 stories hit time limits during verification |

---

## Story-Level Summary

| Story | ACs | Tests Added | HIGH Issues Found (by code review) | Session Time Issue |
|-------|-----|-------------|-------------------------------------|-------------------|
| 9-1 | 6 | ~20 | 0 | No |
| 9-2 | 8 | 19 | 4 (all fixed) | No |
| 9-3 | 4 | ~10 | 2 (all fixed) | No |
| 9-4 | 6 | ~15 | 3 (all fixed) | Yes -- verification timeout |
| 9-5 | 8 | 18 | 2 (all fixed) | Yes -- verification timeout |

**Code review effectiveness:** 11 HIGH-severity bugs caught and fixed across 4 of 5 stories. Zero HIGH issues in 9-1 (simplest story). The code review step is the highest-value quality gate in the pipeline.
