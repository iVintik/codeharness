---
title: 'Verification Tier Rework'
slug: 'verification-tier-rework'
created: '2026-03-26'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['typescript', 'vitest']
files_to_modify:
  - commands/harness-run.md
  - src/modules/verify/types.ts
  - src/modules/verify/parser.ts
  - src/modules/verify/proof.ts
  - src/modules/verify/validation-acs.ts
  - src/modules/verify/validation-runner.ts
  - src/modules/verify/validation-runner-types.ts
  - patches/dev/enforcement.md
  - patches/review/enforcement.md
  - patches/verify/story-verification.md
  - knowledge/verification-patterns.md
code_patterns:
  - 'Replace 3 overlapping systems with single VerificationTier enum'
  - 'Story tier = max(AC tiers) — highest tier wins'
  - 'Tier determines verification method, not the other way around'
test_patterns:
  - 'Update classifyStrategy tests to use new tier names'
  - 'Test tier derivation from AC tags'
  - 'Test each verification path dispatches correctly'
---

# Tech-Spec: Verification Tier Rework

**Created:** 2026-03-26

## Overview

### Problem Statement

Codeharness has three overlapping, disconnected verification classification systems:
1. `Verifiability` type: `'cli-verifiable' | 'integration-required'` (per-AC, in `verify/types.ts`)
2. `VerificationStrategy`: `'docker' | 'escalate'` (per-AC, from `classifyStrategy()` in `verify/parser.ts`)
3. `verification-tier` HTML comment: `'unit-testable'` or default black-box (per-story, manual tag)

The naming confuses mechanism (Docker, CLI, unit-test) with what's being proven. Agents guess which tier to use — sometimes wrong (tried Docker for a pure test-provable story). No clear criteria exist beyond vague prompt text.

### Solution

Replace all three systems with one `VerificationTier` enum based on what evidence is needed to prove the ACs work:

| Tier | What it proves | How to verify | Examples |
|------|---------------|---------------|----------|
| `test-provable` | Code structure + passing tests = sufficient | Build, run tests, grep/read code. No running app. | Refactoring, type changes, new utility functions, test additions, config changes, documentation |
| `runtime-provable` | Running the built artifact = sufficient | Build → run binary/server → interact → check output. Local execution. | CLI commands, API endpoints, file processors, REPL behavior |
| `environment-provable` | Full environment with services = needed | Docker stack, databases, message queues, observability. | Observability integration, distributed workflows, data pipelines, multi-service interactions |
| `escalate` | Cannot be proven automatically | Human judgment, hardware, paid services. | GPU rendering, visual inspection, physical device testing |

Story-level tier is auto-derived: highest tier among all ACs wins. No manual tagging.

## Context for Development

### Codebase Patterns

Current system locations:
- `src/modules/verify/types.ts` L10: `type Verifiability = 'cli-verifiable' | 'integration-required'`
- `src/modules/verify/parser.ts` L84: `classifyStrategy()` returns `'docker' | 'escalate'`
- `src/modules/verify/proof.ts` L116: checks `unit-testable` string in proof `**Tier:**` line
- `commands/harness-run.md` L263: checks `<!-- verification-tier: unit-testable -->` HTML comment
- `commands/harness-run.md` L158: create-story prompt tells agent to add `<!-- verification: cli-verifiable -->` per AC

### Files to Reference

| File | Purpose | What changes |
| ---- | ------- | ------------ |
| `src/modules/verify/types.ts` | `Verifiability` type | Replace with `VerificationTier` enum |
| `src/modules/verify/parser.ts` | `classifyStrategy()`, `classifyVerifiability()`, `parseVerificationTag()` | Rewrite to use new tiers + clear keyword matching |
| `src/modules/verify/proof.ts` | Checks `**Tier:** unit-testable` in proofs | Update to check new tier names |
| `src/modules/verify/validation-acs.ts` | Groups ACs by verifiability | Use new tier |
| `src/modules/verify/validation-runner.ts` | Runs verification per tier | Dispatch on new tiers |
| `src/modules/verify/validation-runner-types.ts` | Runner type definitions | Update tier references |
| `commands/harness-run.md` | Step 3a (create-story AC tagging) + Step 3d (verification dispatch) | Rewrite both with new tiers, criteria, examples |
| `patches/dev/enforcement.md` | Dev workflow enforcement | Update tier references |
| `patches/review/enforcement.md` | Review workflow enforcement | Update tier references |
| `patches/verify/story-verification.md` | Verification enforcement | Update tier references |
| `knowledge/verification-patterns.md` | Agent knowledge about verification | Rewrite with new tier guide |

### Technical Decisions

- **Single enum:** `VerificationTier = 'test-provable' | 'runtime-provable' | 'environment-provable' | 'escalate'`
- **Per-AC tagging stays:** `<!-- verification: test-provable -->` etc. But the tag is now one of the four tiers, not a different vocabulary.
- **Story tier = max(AC tiers):** If any AC is `environment-provable`, the story is `environment-provable`. If all ACs are `test-provable`, the story is `test-provable`. Hierarchy: `escalate > environment-provable > runtime-provable > test-provable`.
- **No manual story-level tag:** Remove `<!-- verification-tier: unit-testable -->`. The story tier is DERIVED from its ACs automatically by `harness-run` Step 3d.
- **`classifyStrategy()` removed:** Replaced by `classifyTier(description: string): VerificationTier` which uses clear keyword matching.
- **Tier criteria for create-story agent:** The harness-run prompt includes explicit decision tree with examples so the agent tags consistently.
- **Backward compat:** Old tags (`cli-verifiable`, `integration-required`, `unit-testable`) map to new tiers during parsing. No story file migration needed.

## Implementation Plan

### Tasks

- [ ] Task 1: Define new `VerificationTier` type and update `types.ts`
  - File: `src/modules/verify/types.ts`
  - Action: Replace `Verifiability = 'cli-verifiable' | 'integration-required'` with `VerificationTier = 'test-provable' | 'runtime-provable' | 'environment-provable' | 'escalate'`. Add `TIER_HIERARCHY` const for tier ordering. Add `maxTier(tiers: VerificationTier[]): VerificationTier` utility. Add backward compat mapping: `'cli-verifiable' → 'test-provable'`, `'integration-required' → 'environment-provable'`, `'unit-testable' → 'test-provable'`.

- [ ] Task 2: Rewrite `parser.ts` tier classification
  - File: `src/modules/verify/parser.ts`
  - Action: Replace `classifyStrategy()` with `classifyTier(description: string): VerificationTier`. Replace `classifyVerifiability()` with tier-based logic. Update `parseVerificationTag()` to read new tag format `<!-- verification: test-provable -->` with backward compat for old tags. Update `parseStoryACs()` to return `VerificationTier` per AC. Clear keyword lists:
    - `test-provable`: "file exists", "export", "type", "interface", "test passes", "line count", "coverage", "refactor", "rename", "documentation"
    - `runtime-provable`: "CLI command", "API endpoint", "HTTP", "server", "output shows", "exit code", "binary", "runs and produces"
    - `environment-provable`: "Docker", "container", "observability", "telemetry", "database", "queue", "distributed", "multi-service", "end-to-end"
    - `escalate`: "physical hardware", "human visual", "paid service", "GPU", "manual inspection"

- [ ] Task 3: Update proof validation
  - File: `src/modules/verify/proof.ts`
  - Action: Update `**Tier:**` parsing (L116) to recognize all four tier names. Update enforcement skip logic: `test-provable` and `runtime-provable` skip Docker enforcement. Only `environment-provable` requires Docker evidence.

- [ ] Task 4: Update validation ACs and runner
  - Files: `src/modules/verify/validation-acs.ts`, `validation-runner.ts`, `validation-runner-types.ts`
  - Action: Replace all `cli-verifiable`/`integration-required` references with new tier names. Update grouping logic to group by tier instead of binary verifiability.

- [ ] Task 5: Rewrite harness-run verification dispatch (Step 3d)
  - File: `commands/harness-run.md`
  - Action: Replace the binary `unit-testable` vs `black-box` dispatch with four-tier dispatch:
    - **Step 3d-0:** Parse all AC tags from story file. Derive story tier = `maxTier(all AC tiers)`.
    - **test-provable:** Subagent runs build + tests + code inspection. No running app. No Docker.
    - **runtime-provable:** Subagent builds artifact, runs it locally, interacts with it, checks behavior. No Docker stack needed but may run the binary.
    - **environment-provable:** Full Docker verification (existing black-box flow).
    - **escalate:** Mark ACs as escalated, check if remaining non-escalated ACs pass. If all non-escalated pass, story is done with escalated notes.

- [ ] Task 6: Update create-story prompt with tier criteria
  - File: `commands/harness-run.md` (Step 3a)
  - Action: Replace the current vague AC tagging instruction with explicit decision tree:
    ```
    For each AC, determine the verification tier:

    Is this AC about code structure, types, file existence, test passing, or documentation?
    → test-provable

    Does this AC require running the built application and checking its output/behavior?
    → runtime-provable

    Does this AC require Docker, databases, observability stack, or multiple services?
    → environment-provable

    Does this AC require physical hardware, human visual judgment, or paid external services?
    → escalate

    Tag: <!-- verification: {tier} -->

    EXAMPLES:
    - "Given function X exists, when called with Y, then returns Z" → test-provable (unit test proves it)
    - "Given the CLI is run with --flag, when output is checked, then it shows X" → runtime-provable (need to run the binary)
    - "Given the server is running, when POST /api/users is called, then logs appear in VictoriaLogs" → environment-provable (needs observability stack)
    - "Given the game renders at 60fps on a 4K display" → escalate (needs GPU hardware)
    ```

- [ ] Task 7: Update knowledge and enforcement docs
  - Files: `knowledge/verification-patterns.md`, `patches/dev/enforcement.md`, `patches/review/enforcement.md`, `patches/verify/story-verification.md`
  - Action: Replace all old tier terminology with new. Add tier decision guide to knowledge file.

- [ ] Task 8: Update all tests
  - Files: `src/modules/verify/__tests__/verify-parser.test.ts`, `validation-acs.test.ts`, `verify.test.ts`, `index.test.ts`, etc.
  - Action: Update all tier references. Update `classifyStrategy` tests to `classifyTier`. Add tests for backward compat mapping. Add tests for `maxTier()` derivation.

### Acceptance Criteria

- [ ] AC1: Given `VerificationTier` type, when inspected, then it's `'test-provable' | 'runtime-provable' | 'environment-provable' | 'escalate'`
- [ ] AC2: Given an AC tagged `<!-- verification: test-provable -->`, when story tier is derived, then story uses test-provable verification (no Docker)
- [ ] AC3: Given a story with 5 `test-provable` ACs and 1 `runtime-provable` AC, when story tier is derived, then it's `runtime-provable` (highest wins)
- [ ] AC4: Given an AC tagged with old format `<!-- verification: cli-verifiable -->`, when parsed, then it maps to `test-provable` (backward compat)
- [ ] AC5: Given `classifyTier("Given function X exists")`, when called, then returns `'test-provable'`
- [ ] AC6: Given `classifyTier("Given the CLI outputs JSON")`, when called, then returns `'runtime-provable'`
- [ ] AC7: Given `classifyTier("Given logs appear in VictoriaLogs")`, when called, then returns `'environment-provable'`
- [ ] AC8: Given `classifyTier("Given 60fps on physical display")`, when called, then returns `'escalate'`
- [ ] AC9: Given harness-run Step 3d, when story tier is `test-provable`, then verification runs via subagent with build+test+code-inspection only
- [ ] AC10: Given harness-run Step 3d, when story tier is `environment-provable`, then full Docker verification flow runs
- [ ] AC11: Given create-story prompt in Step 3a, when agent creates ACs, then each AC has `<!-- verification: {tier} -->` tag with one of the four tiers
- [ ] AC12: Given all changes, when `npm test` runs, then all tests pass with 0 regressions

## Additional Context

### Dependencies
- No new npm dependencies.

### Testing Strategy
- Update all `classifyStrategy` tests to `classifyTier` with new tier values
- Add backward compat tests for old tag formats
- Add `maxTier()` derivation tests
- Proof validation tests for all four tier names

### Notes
- **Backward compat is cheap:** Old tags map to new tiers in one function. No story file migration.
- **`runtime-provable` is new territory.** Currently nothing handles "run the binary locally." The subagent prompt needs to know how to build and run the project (cargo run, npm start, python main.py). The stack provider's `getBuildCommands()` / `getTestCommands()` already exist — extend with `getRunCommand()`.
- **Most codeharness stories are `test-provable`.** The analysis showed 60% of verification cost was Docker, but most stories just needed build+test. Proper tier classification will save significant tokens.
- **StackProvider needs `getRunCommand()`.** Currently has `getBuildCommands()` and `getTestCommands()` but no run command. For `runtime-provable` verification, the subagent needs to know how to start the app (e.g., `cargo run`, `npm start`, `python -m app`). Add `getRunCommand?(): string[]` as optional method to StackProvider interface — not all stacks have a runnable artifact (libraries don't).
