# Epic 5 Retrospective: Ralph Loop Integration

**Epic:** Epic 5 — Ralph Loop Integration
**Date:** 2026-03-15
**Stories Completed:** 2 (5-1, 5-2)
**Status:** All stories done

---

## Epic Summary

Epic 5 delivered the autonomous multi-session execution loop for codeharness. It connected the vendored Ralph bash script to sprint-status.yaml as the task source, replaced the legacy progress.json-based task tracking, and added per-story retry tracking, progress summaries, graceful termination, and crash recovery.

The epic produced: a full `codeharness run` command (src/commands/run.ts: 279 lines) that resolves Ralph, generates iteration prompts, spawns Ralph with correct arguments, and handles JSON output; a Ralph prompt template system (src/templates/ralph-prompt.ts: 84 lines) with retry context and flagged story support; and substantial modifications to ralph/ralph.sh (1,006 lines total) including sprint-status.yaml-based completion detection, story snapshotting and change detection, retry file tracking, flagged story management, progress summary logging, enhanced cleanup with progress reporting, and crash recovery detection.

By the end of Epic 5, the project has 5,807 lines of production TypeScript across 32 source files and 9,772 lines of test code across 33 test files. All 738 unit tests pass. Coverage sits at 92.45% statements, 82.4% branches, 96.8% functions, 92.78% lines. Two new production modules were created (run.ts full implementation, ralph-prompt.ts). Ralph.sh was extended by approximately 280 lines with sprint-status integration, retry tracking, progress summaries, and enhanced termination. verify_gates.sh was deprecated. One new BATS integration test file was added (ralph-sprint-status.bats: 317 lines).

The epic's major contribution is completing the autonomous execution pipeline: `codeharness run` spawns Ralph, which spawns fresh Claude Code sessions that execute `/harness-run`, with sprint-status.yaml as the single source of truth for task progress, and file-based retry tracking for crash recovery.

---

## What Went Well

### 1. Clean Division of Responsibilities Between Ralph and /harness-run

The architectural decision to keep Ralph as a session-spawning wrapper while `/harness-run` owns all task-picking and verification logic was cleanly implemented. Ralph's `get_current_task()` is a no-op. Ralph only observes sprint-status.yaml before and after each iteration to detect changes. This avoids duplicating BMAD workflow logic in bash and keeps a single source of truth in the TypeScript skill.

### 2. Sprint-Status.yaml Integration Is Comprehensive

The replacement of progress.json with sprint-status.yaml touches every relevant layer: `check_sprint_complete()` and `get_task_counts()` in ralph.sh, `countStories()` in run.ts, `readSprintStatus()` from beads-sync.ts. The YAML parsing in bash uses simple `IFS=:` splitting with regex matching for story keys (`^[0-9]+-[0-9]+-`), avoiding a jq/yq dependency for YAML parsing. The `snapshot_story_statuses()` and `detect_story_changes()` functions enable before/after comparison without coupling to the skill's internals.

### 3. Retry and Flagged Story Tracking Is Crash-Resilient

The file-based retry tracking (`.story_retries` and `.flagged_stories`) persists across Ralph restarts. The atomic temp-file-plus-mv pattern in `increment_story_retry()` prevents corruption. The flagged stories flow from Ralph state files through `run.ts` into the prompt template, so subsequent sessions know to skip exhausted stories. This satisfies NFR21 (crash recovery) without any in-memory state.

### 4. Ralph Prompt Template Is Well-Structured

The `generateRalphPrompt()` function cleanly separates the base prompt (always present) from conditional sections (retry context, flagged stories). The template uses simple `{{variable}}` interpolation rather than a templating engine, keeping dependencies minimal. The prompt stays under 1KB as intended. Tests cover all conditional branches (100% branch coverage on ralph-prompt.ts).

### 5. Test Count Growth Continued

From 702 tests (Epic 4) to 738 tests (Epic 5) — a 5.1% increase. Two new test files were created. The ralph-prompt.ts template achieved 100% coverage across all metrics. BATS integration tests were added for the Ralph sprint-status functions (317 lines).

---

## What Could Be Improved

### 1. run.ts Has the Lowest Coverage in the Codebase (29.8% statements, 26.98% branches)

The `codeharness run` command action handler (lines 110-276) is almost entirely uncovered. This is the largest new production module in Epic 5 and contains the core spawn logic, JSON output handling, flagged story reading, and error handling. The exported helper functions (`resolveRalphPath`, `resolvePluginDir`, `countStories`, `buildSpawnArgs`) are likely tested, but the async action handler requires integration-style testing with mocked `child_process.spawn` that was apparently not fully implemented. This is the single worst-covered file in the project.

### 2. Overall Coverage Declined Again (95.94% -> 92.45% statements, 85.5% -> 82.4% branches)

Statement coverage dropped 3.5 percentage points and branch coverage dropped 3.1 percentage points — the fourth consecutive decline across Epics 2-5. The total coverage is now below 93% statements and below 83% branches. The primary contributor is run.ts at 29.8% statements. The pre-existing low-coverage modules (verify.ts at 85.48%, coverage.ts at 87.05%, doc-health.ts at 91.63%) were not improved.

### 3. index.ts Entry Point Still Uncovered (Lines 44-45) — Fifth Epic Running

This finding has now been carried across five consecutive epics. The `if (!process.env['VITEST'])` conditional block in index.ts remains at 89.47% statement coverage. No integration test for the CLI entry point has been created. At this point, this is not a carried action item — it is normalized technical debt that the project's process has demonstrated it will not address organically.

### 4. Story 5-2 File Still Shows "Status: ready-for-dev"

Story 5-1 was updated to `Status: done` but 5-2 still shows `Status: ready-for-dev` despite being marked `done` in sprint-status.yaml. This is the fifth epic where story file statuses diverge from sprint-status.yaml. The `codeharness sync` command exists but continues to not be used in the development workflow.

### 5. verify.ts Remains at 62.79% Branch Coverage

The verification orchestrator, which is the foundation of the quality enforcement pipeline, still has the lowest branch coverage in the codebase. Epic 4's retro flagged this explicitly. Epic 5 did not address it. Lines 68-81 remain uncovered.

### 6. Ralph.sh Modifications Are Extensive but Unmocked in Unit Tests

Ralph.sh grew to 1,006 lines with significant new logic (retry tracking, snapshotting, change detection, progress summaries). The BATS integration tests cover the utility functions (`check_sprint_complete`, `get_task_counts`, retry functions) but the main loop integration — the snapshotting before/after each iteration, the retry increment logic in the case block, the cleanup handler's progress summary — is only testable via end-to-end execution, which is inherently harder to verify.

---

## Lessons Learned

### L1: Async Action Handlers Need Dedicated Test Patterns

The run.ts action handler is the worst-covered code in the project (29.8%). It wraps `child_process.spawn` in a promise and handles multiple exit paths (JSON output with/without status.json, error handling, process exit codes). Testing this requires mocking spawn at the module level and simulating child process events (close, error). The story explicitly listed `Mock child_process.spawn` as a test task (Task 8.6), but the implementation did not achieve meaningful coverage of the handler. Future stories with spawn/exec patterns should include a shared test helper for mocking child processes.

### L2: Coverage Enforcement Must Be Automated Before It Becomes Meaningless

Four consecutive epics of declining coverage (91.3% -> 90.6% -> 85.5% -> 82.4% branches) demonstrates that manual tracking in retrospectives has zero enforcement power. The `codeharness coverage` command (built in Epic 4, Story 4.3) can check coverage against a target, but it has never been wired into the pre-commit gate or CI. The project is building a quality enforcement tool that does not enforce its own quality. The irony is not lost.

### L3: File-Based State Is an Effective Pattern for Crash Recovery

The .story_retries and .flagged_stories files, the sprint-status.yaml as single source of truth, and the status.json for Ralph state all follow the same pattern: simple text/JSON files that persist across process crashes. This worked well for Epic 5's crash recovery requirements. The pattern should be documented as the standard approach for any cross-session state in codeharness.

### L4: Ralph Modifications Should Be Minimal and Clearly Marked

The story's dev notes warned that Ralph is vendored and modifications should be minimal with `# codeharness:` markers. The actual modifications were extensive (~280 new lines) but well-marked. The new functions (retry tracking, snapshotting, progress summaries) are cleanly separated from the original Ralph logic. The `# codeharness:` comment convention was followed consistently. This convention should be maintained in future modifications.

### L5: Two-Story Epics Ship Faster but Test Less Thoroughly

Epic 5 had only 2 stories compared to Epic 4's 4 stories and Epic 3's 4 stories. The smaller scope allowed faster delivery but the coverage decline suggests that test thoroughness correlates with story count per epic — more stories means more review cycles where gaps get caught. The run.ts coverage gap (29.8%) would likely have been flagged and addressed if there had been a dedicated testing story or a third story focused on quality gates.

---

## Action Items for Subsequent Epics

| # | Action | Target Epic | Owner |
|---|--------|-------------|-------|
| A1 | Cover run.ts action handler (lines 110-276) — currently at 29.8% statements. Create a shared spawn mock helper for testing async command handlers that use child_process.spawn. | Epic 6 | Dev |
| A2 | Cover index.ts entry point (lines 44-45) via subprocess integration test — FIVE epics overdue. If not addressed in Epic 6, remove this action item permanently and accept it as a known gap. | Epic 6 | Dev |
| A3 | Raise branch coverage from 82.4% to 90%+ — specifically run.ts (26.98%), verify.ts (62.79%), coverage.ts (76.37%), doc-health.ts (77.12%) | Epic 6 | Dev |
| A4 | Wire `codeharness coverage` into the pre-commit gate or sprint skill so coverage targets are enforced automatically — carried from Epic 4 | Epic 6 | Dev |
| A5 | Run `codeharness sync` after each story completion to keep story file statuses in sync — five epics of divergence | Ongoing | SM |
| A6 | Update architecture spec to reflect actual plugin artifact locations — carried from Epic 2 | Epic 6 | Architect |
| A7 | Update story 5-2 file header from `Status: ready-for-dev` to `Status: done` | Immediate | Dev |

---

## Epic 4 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Integration test for `codeharness init` as subprocess | Not done | Carried for fifth time. |
| A2 | Cover index.ts entry point block (lines 44-45) | Not done | Five epics overdue. |
| A3 | Raise branch coverage to 95%+ | Not done | Coverage declined from 85.5% to 82.4%. Fifth consecutive decline from 91.3%. |
| A4 | Run `codeharness sync` against story files | Not done | Story 5-2 still shows ready-for-dev. |
| A5 | Update architecture spec for plugin artifact locations | Not done | Carried again. |
| A6 | Consider splitting doc-health.ts (710 lines) | Not applicable | No growth in Epic 5. |
| A7 | Wire coverage into pre-commit gate | Not done | Coverage command exists but is not wired into enforcement. |
| A8 | End-to-end smoke test for quality pipeline | Not done | No end-to-end test was created. |
| A9 | Hook debug mode for error logging | Not done | Not addressed in Epic 5. |

**Summary:** 0 of 9 action items from Epic 4 were resolved. 5 items are being carried forward (consolidated). 2 are not applicable. 2 are dropped (A8 and A9 — lower priority given Epic 6's scope).

---

## Next Epic Readiness

**Epic 6: Onboarding & Gap Analysis** is next in the backlog. It covers:
- Story 6-1: Codebase scan & gap analysis
- Story 6-2: Onboarding epic generation & approval

**Prerequisites met:**
- Autonomous execution loop operational (`codeharness run` -> Ralph -> `/harness-run`)
- Sprint-status.yaml as single source of truth for task tracking
- Verification pipeline produces Showboat proof documents
- Hook architecture enforces quality gates
- doc-health.ts `findModules()` designed for reuse by Epic 6's scanner
- 738 passing tests provide a safety net

**Risks for Epic 6:**
- Branch coverage at 82.4% is the lowest it has been. If Epic 6 adds scanner modules with complex error handling, it will drop further. The pre-existing coverage enforcement tooling (coverage command) has never been activated.
- run.ts at 29.8% statement coverage means the primary command users will interact with (`codeharness run`) is essentially untested at the integration level. Bugs in spawn argument handling or JSON output formatting would not be caught by tests.
- Nine action items from Epic 4 were carried with zero resolution. If this pattern continues, the retrospective process itself becomes performative rather than corrective.

---

## Metrics

- **Stories planned:** 2
- **Stories completed:** 2
- **Stories failed:** 0
- **New production TypeScript files created:** 2 (run.ts full implementation replacing stub, ralph-prompt.ts)
- **Modified production TypeScript files:** 1 (index.ts — command registration)
- **Modified shell scripts:** 1 (ralph/ralph.sh — sprint-status integration, retry tracking, progress summaries)
- **Deprecated shell scripts:** 1 (verify_gates.sh)
- **Total production TypeScript files:** 32
- **Total production lines of code:** 5,807 (up from 5,457 in Epic 4, +6.4%)
- **New test files created:** 2 (run.test.ts, ralph-prompt.test.ts)
- **New BATS test files:** 1 (ralph-sprint-status.bats: 317 lines)
- **Total test files:** 33 (vitest)
- **Total unit tests:** 738 (up from 702 in Epic 4, +5.1%)
- **Total test lines:** 9,772 (up from 9,378 in Epic 4, +4.2%)
- **Statement coverage:** 92.45% (down from 95.94%)
- **Branch coverage:** 82.4% (down from 85.5%)
- **Function coverage:** 96.8% (down from 99.04%)
- **Line coverage:** 92.78% (down from 96.4%)
- **Ralph.sh total lines:** 1,006 (up from ~725 estimated at epic start)
- **BATS integration tests:** 2 test files, 651 lines
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~1.35s (vitest)
- **Epic 4 retro actions resolved:** 0 of 9
