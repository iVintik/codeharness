# Epic 22 Retrospective: Flow Configuration Format & Parser

**Epic:** Epic 22 — Flow Configuration Format & Parser
**Date:** 2026-04-05
**Stories Completed:** 3 (22-1, 22-2, 22-3)
**Status:** All stories marked done; 22-3 failed code review
**Previous Retro:** Epic 12 (last documented retrospective)

---

## Epic Summary

Epic 22 extended the workflow parser to accept a new YAML configuration format (`workflow:` / `for_each:` / `gate:`) alongside the legacy `story_flow` / `epic_flow` / `loop:` format, then migrated the default template to the new format. This is epic 1 of 7 in the XState engine redesign (epics 21–27), following Epic 21's extraction of workflow-machine.ts into separate modules.

**Story 22-1 — Parse `for_each` blocks** (7 attempts) extended `workflow-parser.ts` and `workflow.schema.json` to accept `workflow:` keys containing `for_each` blocks with arbitrary nesting depth. Added `ForEachBlock` and `ForEachFlowStep` types. Validation rejects empty steps, missing scope values, and unknown task references. Backward compatibility preserved for old-format files.

**Story 22-2 — Parse named `gate` blocks** (13 attempts) added `GateBlock` parsing for negotiation gates with `check:` / `fix:` / `pass_when:` / `max_retries:` / `circuit_breaker:` semantics. Parser validates gate names, non-empty check lists, unknown task references, and valid `pass_when` enum values (`consensus`, `majority`, `any_pass`). Defaults applied for optional fields.

**Story 22-3 — Update default.yaml to new format** (7 attempts) rewrote `templates/workflows/default.yaml` from legacy format to the new `workflow:` / `for_each:` / `gate:` structure. Tasks section unchanged (9 tasks). Updated tests referencing the default template. Build and all 4991 tests pass.

By the end of Epic 22: 192 test files, 4991 tests passing, build clean.

---

## What Went Well

### 1. Clean Parser Extension Without Breaking Existing Files

The parser correctly accepts both old and new formats. Old-format YAML files still validate and execute. The format detection is clean: presence of `workflow:` key triggers the new path, presence of `story_flow:` / `epic_flow:` triggers the old path, and having both is an error. This is the right approach — dual-format support during migration.

### 2. Schema and Parser Stay in Sync

The JSON schema (`workflow.schema.json`) was updated alongside the parser for each story. Validation errors reference the schema constraints. This prevents drift between what the schema allows and what the parser accepts.

### 3. Test Count Grew, No Regressions

From a baseline of ~4960 tests (pre-epic), the suite grew to 4991 with zero regressions. The 14+ new tests from 22-1 and the gate-specific tests from 22-2 cover the new parsing paths. The default template migration (22-3) updated existing test assertions rather than breaking them.

### 4. Default Template Matches Architecture Spec

The migrated `default.yaml` exactly matches the reference YAML from `architecture-xstate-engine.md`: `for_each: epic` → `for_each: story` with steps, `gate: quality` for check/review/retry, `gate: verification` at epic level. The task definitions are unchanged.

---

## What Failed

### 1. CRITICAL: Parser Accepts New Format But Runtime Cannot Execute It

The codex review of 22-3 identified the most significant issue: **the runtime (`workflow-execution.ts`, `workflow-machines.ts`, `workflow-runner.ts`, `epic-flow-executor.ts`) still drives entirely from `storyFlow` and `epicFlow` arrays.** The parser returns these arrays as empty for `workflow:`-format files. The new default template validates but would produce a no-op if executed through the current engine.

This means Epic 22 created a *configuration that cannot run*. The parser extension is correct, but the pipeline is broken end-to-end: parse → ??? → execute. The missing middle (compilation of `ForEachBlock`/`GateBlock` into executable flow) is Epic 24's responsibility, but the default template was migrated *before* the execution path exists. This ordering problem means that anyone running `codeharness init` today gets a workflow that validates but won't execute.

**20 source files** still reference `storyFlow`/`epicFlow`:
- `workflow-execution.ts` — the primary flow resolver, still requires `story_flow` and `epic_flow` keys
- `workflow-machines.ts`, `workflow-runner.ts`, `epic-flow-executor.ts` — all consume the old flow arrays
- Multiple test files assert on the old structure

### 2. Story 22-2 Required 13 Attempts

13 attempts for a parser extension story is excessive. This suggests the gate parsing requirements were under-specified or the implementation kept failing on edge cases. For comparison, 22-1 and 22-3 each took 7 attempts. The gate block has more constraints (named, non-empty checks, enum validation, defaults) but 13 iterations indicates either the story spec was ambiguous or the quality gate kept rejecting valid implementations.

### 3. No Commits Attributable to Epic 22 in Git History

The git log shows no commits with `22-1`, `22-2`, or `22-3` in the message. All Epic 22 work appears to have landed within autonomous harness runs without being committed as discrete story completions. This breaks traceability — there's no way to `git log` for what changed per story.

### 4. Sprint State Inconsistency

`sprint-state.json` shows `epic-22: in-progress` with `storiesDone: 1`, while `sprint-status.yaml` shows all three stories as `done` and `epic-22: done`. These two tracking systems are out of sync. The derived view (sprint-status.yaml) says the epic is complete; the source of truth (sprint-state.json) says it's not.

---

## Patterns Observed

### P1: Parser-First, Execution-Later Creates Unrunnable Configurations

The XState engine redesign plan (epics 21-27) sequences parser work (Epic 22) before compiler (Epic 24) and machines (Epic 25). This ordering means the parser accepts structures that nothing downstream can consume. The risk was known (the epic plan says "compiler converts parsed output into XState definitions"), but migrating the *default template* in Epic 22 rather than waiting for Epic 24 created a real regression: `codeharness init` now produces unrunnable workflows.

**Pattern:** When building a pipeline in layers, don't migrate the canonical input to a new format until the full pipeline can process it.

### P2: High Attempt Count Correlates With Complex Validation Logic

| Story | Attempts | Complexity |
|-------|----------|-----------|
| 22-1 (for_each) | 7 | Recursive nesting, scope validation |
| 22-2 (gate) | 13 | Named blocks, enum validation, defaults, cross-references |
| 22-3 (template) | 7 | Template rewrite + test updates |

The most constrained parsing story (gates with 6+ validation rules) required nearly 2x the attempts. Stories with more validation constraints should either be split further or have explicit test-first specifications.

### P3: Dual Sprint Tracking Creates Drift

`sprint-state.json` (source of truth for the harness) and `sprint-status.yaml` (derived view for humans) are not automatically synchronized. This has been flagged in previous retros. The story status headers in story files also drift (some show `draft` while sprint-status shows `done`).

---

## Lessons Learned

### L1: Don't Migrate the Default Template Until the Full Pipeline Works

Migrating `templates/workflows/default.yaml` to the new format was premature. The parser validates it, but the execution engine can't run it. The correct sequencing would be:
1. Epic 22: Extend parser (done — correctly)
2. Epic 24: Build compiler that converts ForEachBlock/GateBlock to XState definitions
3. Epic 25: Build machines that execute the compiled output
4. *Then* migrate the default template

The template migration should have been deferred to Epic 25 or a follow-up story after the runtime can handle both formats. This is the single highest-priority fix coming out of this retro.

### L2: Review Must Check Runtime Integration, Not Just Parsing

The 22-3 story ACs were all satisfied at the parser/validation level: the file validates, the build passes, tests pass. But no AC checked whether `codeharness run` would actually execute the new-format workflow. The code review (codex) caught this, which validates the review step, but the ACs themselves should have included a runtime integration check.

### L3: 13 Attempts Is a Signal to Split the Story

Story 22-2's 13 attempts consumed significant compute and time. A story with 6+ distinct validation rules (named gates, non-empty checks, unknown task refs, enum pass_when, default application, fix list validation) could have been split into "parse gate structure" and "validate gate constraints" — each with fewer failure modes.

---

## Action Items

| # | Action | Owner | Target |
|---|--------|-------|--------|
| A1 | **Revert default.yaml to old format or add runtime bridge** — the new-format default template is unrunnable. Either revert `templates/workflows/default.yaml` to old format until Epic 25 completes, OR add a temporary bridge in `workflow-execution.ts` that compiles `ForEachBlock`/`GateBlock` into `storyFlow`/`epicFlow` arrays. | Dev | Before next release |
| A2 | **Sync sprint-state.json** — update `epic-22` to `done` with `storiesDone: 3` to match sprint-status.yaml. | SM | Immediate |
| A3 | **Add runtime integration AC to future template stories** — any story that changes the default template must include an AC that verifies `codeharness run` can execute the resulting workflow, not just parse it. | PM | Epic 23+ story specs |
| A4 | **Commit epic 22 work as discrete commits** — retrospectively tag or document what changed per story so git history has traceability. | Dev | Next session |
| A5 | **Set attempt threshold for story splitting** — if a story exceeds 8 attempts, pause and consider splitting. Add this as a harness-run circuit breaker or SM review trigger. | SM | Epic 23 |
| A6 | **Fix sprint-state.json ↔ sprint-status.yaml sync** — the derived view should not contradict the source of truth. Either automate reconciliation or remove one tracking system. | Dev | Epic 23 |

---

## Epic 12 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Raise branch coverage to 85%+ | Not checked | Coverage not measured this epic — focus was parser extension, not coverage improvement. |
| A2 | Fix showboat format mismatch | N/A | Showboat/proof references removed from codebase (commit `528bbb0`). No longer applicable. |

**Summary:** A2 is resolved by removal. A1 remains unchecked. Showboat and proof verification infrastructure was removed during the v0.37.x release cycle, making several previous action items moot.

---

## Next Epic Preparation

**Epic 23: Dispatch Actor Module** — 4 stories focused on the actor dispatch layer:
- 23-1: Dispatch actor module
- 23-2: Null task actor
- 23-3: Contract chaining + verify flag propagation
- 23-4: Error classification + WorkflowError

**Critical dependency from this retro:** Action item A1 (revert or bridge default.yaml) should be resolved *before* Epic 23 begins. Epic 23 is about dispatch, not parsing — but if the default template is unrunnable, integration testing across the pipeline becomes impossible.

**Risk:** Epics 23-25 build the compiler and machines that consume the parser output from Epic 22. If the `ForEachBlock`/`GateBlock` types from Epic 22 need revision during compilation (Epic 24), the parser will need rework. Keep parser types flexible.
