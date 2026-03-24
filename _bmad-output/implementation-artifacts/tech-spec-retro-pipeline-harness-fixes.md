---
title: 'Retro-to-Sprint Pipeline + Harness Infrastructure Fixes'
slug: 'retro-pipeline-harness-fixes'
created: '2026-03-24'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['typescript', 'vitest', 'bash']
files_to_modify:
  - commands/harness-run.md
  - src/lib/coverage.ts
  - src/modules/infra/docker-setup.ts
  - src/lib/state.ts
  - src/modules/infra/docs-scaffold.ts
  - src/lib/stack-detect.ts
  - src/commands/teardown.ts
code_patterns:
  - 'Retro Step 8 parses action items → creates stories in sprint-status.yaml'
  - 'Persistent epic-TD in sprint-status.yaml (never done)'
  - 'Dedup: check existing stories before creating new ones'
test_patterns:
  - 'Retro action item parsing tests'
  - 'Coverage module split tests must not regress'
  - 'Docker naming tests with real container name patterns'
---

# Tech-Spec: Retro-to-Sprint Pipeline + Harness Infrastructure Fixes

**Created:** 2026-03-24

## Overview

### Problem Statement

Session retros produce structured action items (`Fix Now`, `Fix Soon`, `Backlog`) that never get actioned — they're write-only markdown files. 12+ infrastructure bugs have accumulated across 9+ epics because there's no mechanism to feed retro findings back into the sprint cycle. Tech debt grows silently while new features ship on top of it.

Additionally: `codeharness init` hardcodes VictoriaMetrics as the observability backend with no choice. Projects using ELK/OpenSearch or remote stacks can't configure this during init. Docker availability isn't checked before verification attempts, wasting ~60 min of compute per missed check. Subagents never update sprint-status.yaml (reported 7+ times). The 30-minute iteration budget is too tight for full story lifecycle (create+dev+review+verify), causing sessions to fail at verification.

### Solution

Extend the session retro step (Step 8 in harness-run) to parse its own action items and auto-create stories under a persistent `epic-TD` (tech debt) epic in sprint-status.yaml. Also fix all 12 accumulated harness infrastructure bugs identified across session retros.

### Scope

**In Scope:**
- Modify harness-run Step 8 retro to auto-create tech debt stories from action items
- Persistent `epic-TD` in sprint-status.yaml (never marked `done`, always accepts new stories)
- Deduplication: don't create stories for issues that already have stories
- 12 harness infrastructure fixes:
  1. Split `coverage.ts` (600+ lines → per-stack modules)
  2. Docker naming alignment (`--check-docker` vs `codeharness-shared-*`)
  3. Fix `codeharness sync` story status header pattern
  4. State tracking reconciliation (`sprint-status.yaml` ↔ `sprint-state.json`)
  5. Extract duplicate stack-to-tool mapping into single utility
  6. Docker container auto-cleanup between sessions
  7. Cargo test regex ordering guard
  8. Fix ~40 pre-existing TS compilation errors in test files
  9. Beads CLI handling (graceful skip or auto-install)
  10. `detectAppType` multi-stack support
  11. TOML `[dependencies.foo]` inline subsection handling
  12. Add `'library'` AppType for Rust `[lib]`-only crates
- Process/runtime fixes from retro pain points:
  13. Observability stack choice during init/onboard (Victoria vs ELK + remote connection info)
  14. Docker pre-check before verification (fail fast instead of burning 30-min session)
  15. Subagent sprint-status.yaml update enforcement
  16. Time budget awareness (adopt 2-session pattern or increase to 45 min)
  17. Architecture doc size guard (warn if >10k tokens, suggest sharding)
  18. Mandatory cleanup session before new epic work (tech debt gate)
  19. Lint rule enforcement via harness (e.g., flag bare `except Exception: pass`)
  20. Document codeharness proof format (parser expects specific markdown structure — undocumented)
  21. Verify container auto-provisioning (Dockerfile.verify must include stack-specific deps: Rust version, system libs, clippy, tarpaulin)
  22. PATH inheritance for `~/.cargo/bin` (and similar per-stack tool paths) in verify containers
  23. Ralph active story tracking on timeout (reports `story: unknown` instead of actual story)
  24. Session flags staleness (tests_passed stays false after cargo test — only updates via codeharness coverage)

**Out of Scope:**
- Nothing from retros is excluded. That's the point of the pipeline.

## Context for Development

### Codebase Patterns

- harness-run Step 8 invokes `/retrospective` via Agent tool with a structured prompt
- Retro output is markdown with `## 6. Action Items` containing `### Fix Now`, `### Fix Soon`, `### Backlog` subsections
- Each action item is a `- [ ] description` checkbox line
- sprint-status.yaml is the single source of truth for story statuses
- Stories follow `N-M-slug` naming pattern

### Files to Reference

| File | Purpose | Lines | Key Touchpoints |
| ---- | ------- | ----- | --------------- |
| `commands/harness-run.md` | Step 8 retro — needs post-retro story creation | 618 | Add Step 8b after retro completes: parse action items, create TD stories |
| `src/lib/coverage.ts` | Coverage detection + parsing + execution | 618 | Split: Node L35-147, Python L173-210, Rust L51-74, common types L1-32, execution L219-395 |
| `src/lib/docker.ts` | Docker compose management | ~200 | L125 `codeharness-shared`, L178 `codeharness-collector`, stopSharedStack L152 missing `-v` |
| `src/commands/status.ts` | Status command + `--check-docker` | ~500 | L146, L247, L359, L481 — container name references |
| `src/modules/sprint/state.ts` | `sprint-state.json` reads/writes | ~100 | `writeStateAtomic()` L71, `getSprintState()` L90 — no sync with sprint-status.yaml |
| `src/lib/beads-sync.ts` | Story status + sprint YAML sync | ~200 | `readStoryFileStatus()` L88 regex `/^Status:\s*(.+)$/m`, `updateSprintStatus()` L153 |
| `src/lib/state.ts` | Harness state + `getDefaultCoverageTool()` L91 | ~180 | Duplicate getCoverageTool mapping |
| `src/modules/infra/docs-scaffold.ts` | `getCoverageTool()` L62 | ~295 | Second copy of stack→tool mapping |
| `src/lib/stack-detect.ts` | `detectAppType()` L181, `getCargoDepsSection()` L151, AppType L5 | 283 | Multi-stack: only checks root. `[lib]` → `'generic'`. `[dependencies.foo]` missed. |
| `src/lib/beads.ts` | `bdCommand()` L40-59 | ~80 | ENOENT not distinguished from command errors |
| `docker-compose.harness.yml` | Container names | ~50 | Hardcoded `codeharness-logs`, `codeharness-metrics`, `codeharness-otel` |

### Technical Decisions

- **Persistent epic-TD:** Never transitions to `done`. New stories append to it. `epic-TD-retrospective: optional` is always present. harness-run Step 5 skips epic completion check when epic key is `epic-TD`.
- **Story creation from retro (Step 8b):** After the retro agent writes the markdown file, Step 8 adds a new substep: read the retro file, parse `## 6. Action Items` section, extract `- [ ]` checkbox items from `### Fix Now` and `### Fix Soon` subsections, generate slugs (`TD-N-slug`), check for duplicates against existing `TD-*` entries in sprint-status.yaml, append new entries as `backlog`. `### Backlog` items go to `_bmad-output/implementation-artifacts/tech-debt-backlog.md` for tracking only.
- **Deduplication:** Normalize action item text (lowercase, strip punctuation, collapse whitespace). Compare against existing `TD-*` story file titles. If 80%+ word overlap, skip as duplicate.
- **coverage.ts split:** Extract into `src/lib/coverage-node.ts` (Node detection + parsing), `src/lib/coverage-python.ts` (Python detection + parsing), `src/lib/coverage-rust.ts` (Rust detection + parsing). Main `coverage.ts` keeps types, orchestrator (`detectCoverageTool`, `runCoverage`, `evaluateCoverage`), and `parseTestCounts`. Target: each file <200 lines.
- **Single stack-to-tool mapping:** Create `src/lib/stack-tools.ts` with `getDefaultCoverageTool(stack)`. Both `docs-scaffold.ts` and `state.ts` import from it. Delete duplicates.
- **Docker naming:** Standardize on `codeharness-shared` as compose project name. Container names in compose file use `container_name: codeharness-shared-{service}`. Update `status.ts` `--check-docker` to check via `docker compose -p codeharness-shared ps`. Add `-v` to `stopSharedStack()`.
- **Docker session cleanup:** Add `cleanupOrphanedContainers()` to harness-run Step 1 (pre-flight). Checks for `codeharness-verify` containers from previous crashed sessions and removes them.
- **State reconciliation:** Add `reconcileSprintState()` function in `modules/sprint/state.ts`. Reads `sprint-status.yaml`, rebuilds `sprint-state.json` counts. Called at harness-run Step 1 pre-flight and after each story completion.
- **Beads handling:** In `beads.ts` `bdCommand()` L50, check `err.code === 'ENOENT'` specifically. Return a `BeadsNotInstalledError` subclass. Callers (sync command) catch this and print `[INFO] beads CLI not installed — skipping sync` instead of `[FAIL]`.
- **Cargo regex guard:** Add comment block above `parseTestCounts()` explaining ordering constraint. Add a unit test that verifies cargo regex runs before pytest regex on mixed output.
- **TS compilation errors:** Run `tsc --noEmit` and fix all errors in test files. Primarily: add explicit types to spread args, add missing properties to mock objects, remove implicit `any`.
- **detectAppType multi-stack:** Change signature to accept `StackDetection[]`. Return `Record<string, AppType>` mapping each stack to its type. Primary `app_type` in state = root stack's type.
- **TOML subsections:** Update `getCargoDepsSection()` regex to also match `[dependencies.*]` sections. New pattern: `/^\[dependencies(?:\.[a-zA-Z0-9_-]+)?\]\s*$/m`. Collect all matching sections.
- **Library AppType:** Add `'library'` to `AppType` union. Change `[lib]`-only detection from returning `'generic'` to `'library'`. Update docs-scaffold to generate library-specific AGENTS.md content.

## Implementation Plan

### Tasks

Tasks ordered by dependency — foundation/shared utilities first, then consumers, then pipeline.

- [ ] Task 1: Create `src/lib/stack-tools.ts` — single source of truth for stack-to-tool mapping
  - File: `src/lib/stack-tools.ts` (new, ~30 lines)
  - Action: Extract `getDefaultCoverageTool(stack)` here. Delete duplicates from `docs-scaffold.ts` L62-66 and `state.ts` L91-95. Both files import from `stack-tools.ts`.
  - Notes: This unblocks coverage.ts split and docs-scaffold cleanup.

- [ ] Task 2: Split `coverage.ts` into per-stack modules
  - Files: `src/lib/coverage.ts` (618→~150), `src/lib/coverage-node.ts` (new, ~120), `src/lib/coverage-python.ts` (new, ~50), `src/lib/coverage-rust.ts` (new, ~80)
  - Action: Extract `detectNodeCoverageTool()` + `getNodeTestCommand()` → `coverage-node.ts`. Extract `detectPythonCoverageTool()` → `coverage-python.ts`. Extract Rust detection + `parseTarpaulinCoverage()` → `coverage-rust.ts`. Keep types, `detectCoverageTool()` orchestrator, `runCoverage()`, `evaluateCoverage()`, `parseTestCounts()`, `checkOnlyCoverage()` in main `coverage.ts`. Import per-stack detectors.
  - Notes: All existing tests must pass unchanged. Add regex ordering guard test for `parseTestCounts()`.

- [ ] Task 3: Add cargo test regex ordering guard
  - File: `src/lib/__tests__/coverage.test.ts`
  - Action: Add test that feeds cargo workspace output + pytest-like output and asserts cargo aggregation wins. Add comment block above `parseTestCounts()` in `coverage.ts` explaining ordering constraint.

- [ ] Task 4: Add `'library'` AppType + TOML subsection handling
  - File: `src/lib/stack-detect.ts`
  - Action: Add `'library'` to `AppType` union (L5). Change `[lib]` return from `'generic'` to `'library'` (L276). Update `getCargoDepsSection()` regex (L152) to match `[dependencies.*]` subsections: `/^\[dependencies(?:\.[a-zA-Z0-9_-]+)?\]\s*$/gm`. Collect all matching sections' content.
  - Notes: Update all consumers of AppType that switch on it (docs-scaffold, init-project).

- [ ] Task 5: `detectAppType` multi-stack support
  - File: `src/lib/stack-detect.ts`
  - Action: Add `detectAppTypes(detections: StackDetection[]): Record<string, AppType>` that calls `detectAppType(dir, stack)` for each detection. `init-project.ts` calls this and stores primary `app_type = types[rootStack]` + `app_types: Record<string, AppType>` in state.
  - Notes: Existing `detectAppType(dir, stack)` stays for backward compat. New function iterates.

- [ ] Task 6: Docker naming alignment
  - Files: `src/lib/docker.ts`, `src/commands/status.ts`, `docker-compose.harness.yml`
  - Action: Standardize compose project name to `codeharness-shared`. Set `container_name: codeharness-shared-{service}` in compose. Update `status.ts` `--check-docker` to use `docker compose -p codeharness-shared ps --format json`. Fix `stopSharedStack()` L152 — add `-v` flag.

- [ ] Task 7: Docker container auto-cleanup
  - File: `commands/harness-run.md` (Step 1 pre-flight), `src/lib/docker.ts`
  - Action: Add `cleanupOrphanedContainers()` function in `docker.ts`. Runs `docker ps -a --filter name=codeharness-verify --format '{{.ID}}'` and removes any found. Called in harness-run Step 1 pre-flight before spawning any work. Also called in `verify-env cleanup`.

- [ ] Task 8: State tracking reconciliation
  - File: `src/modules/sprint/state.ts`
  - Action: Add `reconcileSprintState(projectDir)` function. Reads `sprint-status.yaml` via `readSprintStatus()`, counts done/total/in-progress, writes updated counts to `sprint-state.json`. Called at harness-run Step 1 pre-flight and after each story status change in Step 3/4.
  - Notes: sprint-status.yaml is authoritative. sprint-state.json is derived.

- [ ] Task 9: Fix `codeharness sync` story status pattern
  - File: `src/lib/beads-sync.ts`
  - Action: Update `readStoryFileStatus()` L88 regex to handle `## Status: value` (with `##` prefix) in addition to `Status: value`. New pattern: `/^(?:#{1,3}\s+)?Status:\s*(\S+)/m`. This matches both `Status: backlog` and `## Status: backlog` formats.

- [ ] Task 10: Beads CLI graceful handling
  - File: `src/lib/beads.ts`
  - Action: In `bdCommand()` L50 catch block, check `(err as NodeJS.ErrnoException).code === 'ENOENT'`. If true, throw `BeadsNotInstalledError` (new subclass of `BeadsError`). In `src/lib/beads-sync.ts` and `src/commands/sync.ts`, catch `BeadsNotInstalledError` and print `[INFO] beads CLI not installed — skipping` instead of `[FAIL]`.

- [ ] Task 11: Fix TS compilation errors in test files
  - Files: Multiple test files (`bridge.test.ts`, `run.test.ts`, `stack.test.ts`, `status.test.ts`, etc.)
  - Action: Run `npx tsc --noEmit 2>&1 | head -100` to identify all errors. Fix: add explicit types to spread args, add missing properties to mock objects (`endpoint`, `timeoutSummary`), replace implicit `any` with proper types.
  - Notes: Tests pass at runtime via Vitest despite tsc errors. Fixes are type annotations only — no logic changes.

- [ ] Task 12: Retro-to-Sprint pipeline (Step 8b in harness-run)
  - File: `commands/harness-run.md`
  - Action: Add Step 8b after the retro agent completes. The harness-run orchestrator:
    1. Reads the retro markdown file just written
    2. Parses `## 6. Action Items` section
    3. Extracts `- [ ]` items from `### Fix Now` and `### Fix Soon` subsections
    4. For each item: generate slug (`TD-{next_number}-{slugified-description}`), check if `TD-*` entry with similar description exists in sprint-status.yaml (normalize + 80% word overlap = duplicate)
    5. If not duplicate: append `TD-N-slug: backlog` to sprint-status.yaml under `# Epic TD: Tech Debt` section
    6. If `epic-TD` section doesn't exist, create it with `epic-TD: in-progress` and `epic-TD-retrospective: optional`
    7. Create minimal story file at `_bmad-output/implementation-artifacts/TD-N-slug.md` with title, source retro date, and action item text
    8. Append `### Backlog` items to `_bmad-output/implementation-artifacts/tech-debt-backlog.md`
    9. Print summary: `[INFO] Tech debt: {N} new stories created from retro, {M} duplicates skipped`
  - Notes: This is a command spec change (markdown), not code. The harness-run agent executes this logic using Read/Write/Edit tools. No new TypeScript code needed for the pipeline itself.

- [ ] Task 13: Update harness-run Step 5 to handle persistent epic-TD
  - File: `commands/harness-run.md`
  - Action: In Step 5 (Epic Completion), add guard: `if epic key is 'epic-TD', skip epic completion check — epic-TD is never marked done.` Also skip retrospective for epic-TD (it gets retro'd as part of the session retro already).

- [ ] Task 14: Observability stack choice during init/onboard
  - Files: `src/commands/init.ts`, `src/modules/infra/init-project.ts`, `src/lib/docker.ts`, `commands/harness-init.md`, `commands/harness-onboard.md`
  - Action: Add `--observability-backend` option to `codeharness init` with values `victoria` (default), `elk`, `none`. If `elk`: use OpenSearch/Kibana compose stack instead of VictoriaMetrics. Add `--otel-endpoint`, `--logs-url`, `--metrics-url`, `--traces-url` options for remote endpoints. If remote URLs provided, skip local Docker stack setup entirely. Store choice in `HarnessState.otlp.backend: 'victoria' | 'elk' | 'none'`. Update `harness-onboard` to ask user which backend to use if not already configured. Update `harness-init` command spec to document the options.
  - Notes: Victoria and ELK/OpenSearch have different query APIs. The `codeharness status --check-docker` and observability verification need to know which backend to check. The compose files already exist for both (`docker-compose.harness.yml` for Victoria, separate for OpenSearch).

- [ ] Task 15: Docker pre-check before verification
  - File: `commands/harness-run.md` (Step 3d pre-verification)
  - Action: Before any verification attempt, run `docker info` as first check. If it fails (Docker not running/installed), IMMEDIATELY skip verification with: `[FAIL] Docker not available — skipping verification. Start Docker and re-run.` Do NOT attempt to build images, start containers, or run any Docker commands. This prevents burning 30-min sessions on Docker failures.
  - Notes: The current pre-check (`codeharness status --check-docker`) checks the observability stack but not Docker itself. Add Docker daemon check BEFORE stack check.

- [ ] Task 16: Subagent sprint-status.yaml update enforcement
  - File: `commands/harness-run.md` (Steps 3a, 3b, 3c)
  - Action: After each subagent completes, the orchestrator (not the subagent) reads sprint-status.yaml and verifies the expected status transition happened. If the subagent failed to update status, the orchestrator does it. Add explicit instructions: "CRITICAL: The orchestrator is responsible for status updates. If the subagent response indicates completion but sprint-status.yaml wasn't updated, update it now using the Edit tool." Remove any instructions that tell subagents to update sprint-status.yaml — they can't be trusted to do it reliably.
  - Notes: This was reported 7+ times in one day. The fix is to make the orchestrator solely responsible, not share responsibility with subagents.

- [ ] Task 17: Time budget awareness and 2-session pattern
  - File: `commands/harness-run.md` (Step 2, Step 3)
  - Action: Add time budget checking at the start of each story phase transition. Before starting Step 3b (dev), 3c (review), or 3d (verify), check elapsed time vs budget. If remaining time < estimated phase duration (dev: 15min, review: 10min, verify: 15min), defer the phase to next session: set story status to current phase and print `[INFO] Story {key}: deferring {phase} to next session ({remaining}m left, {phase} needs ~{estimate}m)`. Also add explicit instruction: "A session that completes 1 story fully is better than a session that starts 2 stories and finishes neither."
  - Notes: Ralph already passes time budget in system prompt. This task makes harness-run actually USE it instead of blindly starting work.

- [ ] Task 18: Architecture doc size guard
  - File: `commands/harness-run.md` (Step 3a create-story)
  - Action: Before invoking create-story subagent, check if the architecture doc exceeds 10k tokens (~40k chars). If yes, print `[WARN] Architecture doc exceeds 10k tokens — consider running /shard-doc to split it`. Include in subagent prompt: "If the architecture doc is too large to read in one pass, read only the sections relevant to this story's epic."
  - Notes: Large docs cause context window pressure in subagents, leading to missed requirements.

- [ ] Task 19: Mandatory tech debt gate before new epic work
  - File: `commands/harness-run.md` (Step 2)
  - Action: In Step 2 (Find Next Actionable Story), add a tech debt gate: before selecting ANY Tier D (backlog) story from a NON-TD epic, check if `epic-TD` has stories at `backlog` or `in-progress`. If yes, prioritize TD stories first. Print `[INFO] Tech debt gate: {N} TD stories pending — processing before new feature work`. This ensures accumulated debt gets addressed before new features start. TD stories sort into existing priority tiers (A/B/C/D) like any other story.
  - Notes: This is the "mandatory cleanup session" the retro recommended. It's not a separate command — it's baked into the prioritization logic.

- [ ] Task 20: Lint rule enforcement via harness hooks
  - File: `commands/harness-run.md` (Step 3c code-review), `hooks/post-write-check.sh`
  - Action: In the code-review subagent prompt, add: "Check for bare `except Exception: pass` patterns (or equivalent in the project's language). Flag any such pattern as HIGH severity. These swallow errors silently and have caused confirmed production incidents." In `post-write-check.sh`, add a grep check: if the written file contains `except Exception: pass` (Python) or `catch { }` with empty body (TS), print a warning.
  - Notes: This caught 2 confirmed incidents in the user's project. Making it a standard review check prevents it across all projects.

- [ ] Task 21: Document codeharness proof format
  - File: `commands/harness-verify.md`
  - Action: Add a `## Proof Document Format` section documenting the exact markdown structure the proof parser expects: AC sections (`## AC N: description`), verdict line (`**Verdict:** PASS/FAIL/ESCALATE`), evidence blocks (` ```bash ` command + ` ```output ` result), `**Tier:** unit-testable | cli-verifiable | integration-required`. Include a complete example proof document.

- [ ] Task 22: Verify container auto-provisioning for Rust
  - File: `templates/Dockerfile.verify.rust`, `src/modules/verify/env.ts`
  - Action: Update `Dockerfile.verify.rust` to: install system libs for Bevy/GPU-adjacent projects (wayland-dev, libudev-dev, libasound2-dev, libx11-dev, libxkbcommon-dev, libfontconfig-dev), install clippy component, ensure cargo-tarpaulin is installed, add `ENV PATH="/root/.cargo/bin:$PATH"` explicitly. In `env.ts`, add logic to detect if project uses Bevy (check Cargo.toml for `bevy` dependency) and select the appropriate verify Dockerfile.

- [ ] Task 23: PATH inheritance in verify containers
  - Files: `templates/Dockerfile.verify`, `templates/Dockerfile.verify.rust`
  - Action: Add `ENV PATH="/root/.cargo/bin:/usr/local/bin:$PATH"` to all verify Dockerfiles. Also add `ENV CARGO_HOME="/root/.cargo"` for Rust containers. This ensures cargo, tarpaulin, clippy, and other tools are available without manual `source` commands.

- [ ] Task 24: Fix ralph story tracking on timeout
  - File: `ralph/ralph.sh`
  - Action: Ensure `status.json` always has the current `story` field set. Search for where `status.json` is written during timeout handling — the `portable_timeout` handler likely doesn't update story state before writing the timeout report. Add `story=$CURRENT_STORY` to the status write in the timeout/exit handler.

- [ ] Task 25: Fix session flags staleness
  - Files: `src/lib/state.ts`, `hooks/post-test-verify.sh`
  - Action: The `post-test-verify.sh` PostToolUse hook already runs after Bash commands. Update it to detect test commands (`cargo test`, `npm test`, `pytest`) in the tool input and set `session_flags.tests_passed = true` when they succeed. Currently it only triggers on `codeharness coverage`. Also update `src/lib/state.ts` to add a `markTestsPassed(projectDir)` helper.

### Acceptance Criteria

- [ ] AC1: Given a retro file with `### Fix Now` items, when Step 8b runs, then new `TD-N-slug: backlog` entries appear in sprint-status.yaml under `# Epic TD: Tech Debt`
- [ ] AC2: Given a retro item that matches an existing TD story (80%+ word overlap), when Step 8b runs, then the duplicate is skipped with `[INFO]` message
- [ ] AC3: Given `epic-TD` doesn't exist in sprint-status.yaml, when Step 8b creates the first TD story, then `epic-TD: in-progress` and `epic-TD-retrospective: optional` are also created
- [ ] AC4: Given `epic-TD` has all stories at `done`, when harness-run Step 5 checks epic completion, then epic-TD is NOT marked `done` (persistent)
- [ ] AC5: Given `coverage.ts` is split, when `npm test` runs, then all 3153+ existing tests pass with 0 regressions
- [ ] AC6: Given `coverage.ts` is split, when each new file is checked, then no file exceeds 300 lines
- [ ] AC7: Given cargo test workspace output mixed with pytest-like output, when `parseTestCounts()` runs, then cargo aggregation fires (not pytest single-match)
- [ ] AC8: Given `[lib]` in Cargo.toml without `[[bin]]`, when `detectAppType()` runs, then it returns `'library'`
- [ ] AC9: Given `[dependencies.openai]` subsection in Cargo.toml, when `getCargoDepsSection()` runs, then `openai` is found in deps
- [ ] AC10: Given multi-stack project (nodejs root + rust subdir), when `detectAppTypes()` runs, then it returns `{ nodejs: 'cli', rust: 'server' }` (per-stack types)
- [ ] AC11: Given Docker containers named `codeharness-shared-logs` etc., when `codeharness status --check-docker` runs, then it detects them correctly
- [ ] AC12: Given a leftover `codeharness-verify` container from a crashed session, when harness-run Step 1 pre-flight runs, then the orphaned container is removed
- [ ] AC13: Given `sprint-status.yaml` shows story X as `done` but `sprint-state.json` shows it as `verifying`, when `reconcileSprintState()` runs, then `sprint-state.json` is updated to match
- [ ] AC14: Given story file has `## Status: backlog` header, when `readStoryFileStatus()` runs, then it returns `'backlog'`
- [ ] AC15: Given `bd` CLI is not installed, when `codeharness sync` runs, then it prints `[INFO] beads CLI not installed — skipping` (not `[FAIL]`)
- [ ] AC16: Given `npx tsc --noEmit` is run, then 0 compilation errors (down from ~40)
- [ ] AC17: Given all changes, when `npm test` runs, then all tests pass with 0 regressions
- [ ] AC18: Given `codeharness init --observability-backend elk`, when init runs, then state stores `otlp.backend: 'elk'` and OpenSearch compose is used instead of Victoria
- [ ] AC19: Given `codeharness init --otel-endpoint https://remote.otel:4318`, when init runs, then no local Docker stack is started and state stores the remote endpoint
- [ ] AC20: Given Docker daemon is not running, when harness-run Step 3d verification starts, then it fails fast with `[FAIL] Docker not available` without attempting image builds
- [ ] AC21: Given a subagent completes dev-story but doesn't update sprint-status.yaml, when the orchestrator checks, then it updates the status itself
- [ ] AC22: Given 10 minutes remaining in time budget and next phase is verification (~15min), when harness-run checks budget, then it defers with `[INFO] deferring verify to next session`
- [ ] AC23: Given architecture doc is >10k tokens, when create-story subagent is invoked, then the prompt includes a warning to read only relevant sections
- [ ] AC24: Given `epic-TD` has 3 backlog stories and a new feature epic has 5 backlog stories, when harness-run Step 2 selects next story, then TD stories are processed first
- [ ] AC25: Given code-review subagent reviews Python code, when it finds `except Exception: pass`, then it flags it as HIGH severity
- [ ] AC26: Given a Rust project, when `Dockerfile.verify.rust` is built, then it includes the correct Rust version (matching project's `rust-toolchain.toml` or latest stable), system libs for Bevy (wayland, udev, alsa, x11, xkbcommon, fontconfig), clippy, and cargo-tarpaulin
- [ ] AC27: Given codeharness proof format, when a developer reads `commands/harness-verify.md`, then the expected markdown structure (`\`\`\`bash` + `\`\`\`output` blocks, `**Tier:**` marker, AC section format) is documented
- [ ] AC28: Given a verify container is spawned, when `~/.cargo/bin` exists in the container, then PATH includes it automatically (not requiring manual `source "$HOME/.cargo/env"`)
- [ ] AC29: Given ralph times out during a story, when the timeout report is generated, then `status.json` contains the correct `story` field (not `unknown`)
- [ ] AC30: Given `cargo test` passes in a Rust project, when `codeharness.local.md` is checked, then `session_flags.tests_passed` is `true` (not stale `false`)

## Additional Context

### Dependencies

- No new npm dependencies. All fixes use existing Node.js APIs.
- Docker CLI required for container cleanup (already a dependency).
- `bd` (beads) remains optional — the fix makes it fail gracefully.

### Testing Strategy

- **coverage.ts split:** Move existing test cases to per-stack test files. Main coverage.test.ts keeps orchestrator + parseTestCounts tests. Zero test deletion — only reorganization.
- **Regex ordering guard:** Dedicated test with mixed cargo+pytest output.
- **Docker naming:** Mock `execFileSync` with expected `docker compose -p codeharness-shared` args.
- **State reconciliation:** Create sprint-status.yaml fixture with known counts, run reconcile, assert sprint-state.json matches.
- **Beads ENOENT:** Mock `execFileSync` to throw ENOENT, assert `BeadsNotInstalledError` is caught.
- **TS errors:** `npx tsc --noEmit` as CI gate (add to test script or pre-commit).
- **Retro pipeline:** Manual test — run a real retro, verify TD stories appear in sprint-status.yaml.

### Notes

- **Retro pipeline is a command spec change, not code.** The harness-run agent already has Read/Write/Edit tools. Step 8b just adds instructions for it to parse and write. No new TypeScript module needed.
- **epic-TD is a convention, not enforced in code.** The `epic-TD` prefix and persistent-never-done behavior are enforced by the harness-run command spec (Step 5 guard + Step 8b creation). No schema validation needed.
- **coverage.ts split is the riskiest change.** 618 lines with interleaved Node/Python/Rust logic. Must preserve all import paths. Existing callers import from `coverage.ts` — re-export from there.
- **TS error fixes are low-risk but tedious.** ~40 errors across 5-6 test files. Each is a type annotation fix, not a logic change. Could be a good first story for warm-up.
- **Observability backend choice is a significant change.** Init/onboard currently assume Victoria everywhere — compose files, query URLs, status checks. ELK support means a parallel set of compose files and different query endpoints. The state field `otlp.backend` tells all consumers which backend to use.
- **Tech debt gate is the single highest-ROI process change.** The retro said "every session adds 2-3 items and resolves 0-1." Making TD stories auto-prioritized before feature work breaks this cycle.
- **Time budget awareness prevents the #1 session failure mode.** 3 out of 11 sessions failed because they started verification with insufficient time. Checking budget before each phase is cheap and prevents waste.
- **Subagent status update was reported 7+ times in ONE DAY.** The fix is architectural: orchestrator owns all status writes, subagents are read-only on sprint-status.yaml.
