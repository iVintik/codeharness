# Epic 11 Retrospective: Retrospective Integration & GitHub Issue Loop

**Epic:** Epic 11 — Retrospective Integration & GitHub Issue Loop
**Date:** 2026-03-15
**Stories Completed:** 5 (11-1, 11-2, 11-3, 11-4, 11-5)
**Status:** All stories done
**Previous Retro:** Epic 9 (Epic 10 had no retrospective)

---

## Epic Summary

Epic 11 closed the feedback loop between retrospectives, issue tracking, and sprint planning. The five stories built a pipeline: 11-1 fixed the retro status lifecycle so sprint-status.yaml reflects completed retrospectives, 11-2 added a retro parser and `retro-import` command that converts retro action items into beads issues, 11-3 extended `retro-import` to create GitHub issues from classified findings, 11-4 added a `github-import` command to pull labeled GitHub issues into beads, and 11-5 updated the sprint-planning BMAD patches to orchestrate all three import sources before triage.

**Story 11.1 — Fix Retro Status Lifecycle** extended the `verify` command with `--retro` and `--epic` flags. When a retrospective file exists, the CLI updates `epic-N-retrospective` status from `optional` to `done` in sprint-status.yaml. The `--story` option was changed from `requiredOption` to conditionally required. A new `sprintPlanningRetroPatch()` was added to surface unresolved retro action items during sprint planning. The harness-run Step 5 instruction was verified as already containing explicit retro status update instructions.

**Story 11.2 — Retro Finding Classification & Beads Import** created `src/lib/retro-parser.ts` with `parseRetroActionItems()`, `classifyFinding()`, and `derivePriority()`. A new `codeharness retro-import --epic N` command parses retro markdown tables, classifies each action item as `project`, `harness`, or `tool:<name>`, and creates beads issues with `[gap:retro:epic-N-item-M]` gap-ids for dedup. The command handles duplicate detection and supports `--json` output.

**Story 11.3 — GitHub Issue Creation from Retro Findings** created `src/lib/github.ts` wrapping all `gh` CLI operations (`isGhAvailable`, `ghIssueCreate`, `ghIssueSearch`, `findExistingGhIssue`, `getRepoFromRemote`, `ensureLabels`). The `retro-import` command was extended with a GitHub issue creation phase that activates when `retro_issue_targets` is configured in the state file. Beads import is fully isolated from GitHub — GitHub failures never block beads. Dedup uses gap-id strings embedded as HTML comments in issue bodies.

**Story 11.4 — GitHub Issue Import to Beads** added `codeharness github-import [--repo owner/repo] [--label sprint-candidate]`. The command queries GitHub for labeled issues, maps labels to beads types (`bug`, `enhancement` -> `story`, default -> `task`) and priorities (`priority:high` -> 1, `priority:low` -> 3), and imports via `createOrFindIssue` with `[source:github:owner/repo#N]` gap-ids. The `GhIssue` interface was extended with a `labels` field.

**Story 11.5 — Sprint Planning Retro & Issue Integration** updated the `sprintPlanningRetroPatch()` and `sprintBeadsPatch()` template functions to add a 6-step pre-triage workflow: scan retro files, run `retro-import`, run `github-import`, display combined backlog via `bd ready`, identify unresolved items, and verify uniform triage across all sources. Snapshot tests were added for regression protection.

By the end of Epic 11, the project has 10,529 lines of production TypeScript across 43 source files and 20,054 lines of test code across 45 test files. All 1,390 unit tests pass. Coverage sits at 95.10% statements, 84.21% branches, 98.02% functions, 95.57% lines. Test execution time is ~2.25s.

---

## What Went Well

### 1. Clean Five-Story Pipeline Architecture

Each story delivered a discrete, composable piece of the feedback pipeline: parse retros -> classify findings -> create beads issues -> create GitHub issues -> import GitHub issues -> unified sprint planning. No story required rework of a predecessor. The progressive layering pattern established in Epic 9 was replicated successfully.

### 2. Coverage Recovered Across All Four Metrics

| Metric | Epic 9 (End) | Epic 11 (End) | Delta |
|--------|-------------|--------------|-------|
| Statement | 93.23% | 95.10% | +1.87 pts |
| Branch | 81.20% | 84.21% | +3.01 pts |
| Function | 97.85% | 98.02% | +0.17 pts |
| Line | 93.62% | 95.57% | +1.95 pts |

The coverage regression from Epic 9 was reversed across all four metrics. Branch coverage recovered by 3 points, though it still sits below the 85% target. Statement and line coverage returned above 95%.

### 3. Code Review Drove Substantial Quality Improvements

Every story had a Senior Developer Review that found and fixed real issues:
- 11.1: 6 issues (2 HIGH) — stale comments, type assertion bugs, missing error handling, epic-0 validation
- 11.2: 7 issues (2 HIGH) — silent error swallowing in JSON mode, dead code, missing proof docs
- 11.3: 7 issues (0 HIGH, 5 MEDIUM) — dedup missing closed issues, missing body fields, branch coverage gaps
- 11.4: 7 issues (2 HIGH) — missing exit codes on errors, missing title truncation, no summary output
- 11.5: 7 issues — added structural tests, step ordering verification, snapshot tests

Total: 34 issues found and fixed across 5 code reviews. The review process consistently caught real bugs (not just style issues), particularly around error handling and dedup correctness.

### 4. Test Count Grew by 14.9%

From 1,210 tests (Epic 9 end) to 1,390 tests — 180 new tests across the five stories. This is the second-largest absolute test count increase after Epic 9 (+209). The new `retro-parser.test.ts`, `retro-import.test.ts`, `github.test.ts`, and `github-import.test.ts` files contributed the bulk.

### 5. Reuse of Existing Abstractions Was Excellent

Every story heavily reused existing infrastructure:
- `createOrFindIssue()` and `buildGapId()` from `beads.ts` — used in both `retro-import` and `github-import` without modification
- `ok()`, `fail()`, `info()`, `warn()`, `jsonOutput()` from `output.ts` — consistent CLI output across all new commands
- `updateSprintStatus()` from `beads-sync.ts` — reused in verify's retro mode
- Patch engine markers — reused for both updated patches without engine changes
- Commander.js registration pattern — identical across all new commands

No existing library module was modified for functionality changes (only `github.ts` gained `labels` on the interface, and `state.ts` gained one optional field).

---

## What Could Be Improved

### 1. Branch Coverage Still Below 85% Target

Branch coverage at 84.21% is 0.79 points below the 85% target that was set as a goal in Epic 8. While it recovered significantly from Epic 9's 81.20%, the target remains unmet. The gap is driven by multi-path logic in commands with multiple failure modes and JSON/non-JSON output branches.

### 2. Story File Status Headers Still Show Inconsistent States

Stories 11-1 through 11-5 show `Status: verified` in their headers (a step better than earlier epics which showed `ready-for-dev`), but sprint-status.yaml shows `done`. The `codeharness sync` command has never been integrated into the workflow. This has been flagged in every retrospective since Epic 1.

### 3. Epic 10 Had No Retrospective

Epic 10 (documentation/housekeeping with 14 stories) was completed without a retrospective. This breaks the feedback chain — any lessons from that work are unrecorded. The retro status lifecycle fix in Story 11.1 would have caught this if it had existed earlier.

### 4. Verification Checkboxes Incomplete on Story 11.4

Story 11.4's verification requirements section still has unchecked boxes (Showboat proof doc, AGENTS.md, exec-plan), despite the story being marked `done` and having passed code review. The verification patch content and actual verification discipline diverged.

### 5. All Stories Completed on Same Date

All five stories show `2026-03-15` as their implementation date. While fast execution is positive, single-day completion of 5 stories raises questions about whether the review-fix-verify cycle had adequate separation between implementation and review perspectives.

---

## Lessons Learned

### L1: The Feedback Loop Was the Missing Piece

For nine epics, retrospective action items were written down and immediately forgotten. Zero of five Epic 8 action items were resolved in Epic 9. The `retro-import` command and sprint-planning patch created in this epic are the mechanism that prevents that — action items now flow into beads as tracked issues with gap-id dedup. The lesson: documenting what to improve is worthless without a system that surfaces those documents at decision points.

### L2: Beads as Universal Store Simplifies Multi-Source Integration

Three different sources (retro findings, GitHub issues, manual issues) all converge through `createOrFindIssue()` with distinct gap-id namespaces (`gap:retro:*`, `source:github:*`). Sprint planning queries a single `bd ready` backlog. The universal store pattern eliminated any need for source-specific triage logic. This validates Architecture Decision 3.

### L3: GitHub CLI Wrapper Pattern Scales Well

The `src/lib/github.ts` module mirrors `src/lib/beads.ts` in structure: thin wrappers around `execFileSync` calls, custom error class, try/catch on every external call. Both modules are testable via `vi.mock()` of `child_process`. This pattern — wrap external CLIs in a dedicated module, never call `execFileSync` directly from commands — should be the standard for any future external tool integration.

### L4: Code Reviews Found 34 Real Issues Across 5 Stories

The review process was not ceremonial. Issues included: a dedup query that missed closed GitHub issues (`--state all` omission), silent error swallowing in JSON mode, a validation bug accepting epic 0, missing exit codes on partial failures, and a type assertion that wouldn't compile. These would have been bugs in production. The lesson: reviews pay for themselves even when the author is experienced.

### L5: Patch Templates Are an Effective Extension Mechanism

Stories 11.1 and 11.5 extended sprint-planning behavior purely through patch template updates — no changes to the patch engine, no changes to BMAD workflow files, no new patch targets. The marker-based patching system (Architecture Decision 7) absorbed two rounds of content changes via idempotent replacement. The investment in a proper patch engine in earlier epics continues to compound.

---

## Epic 9 Retro Action Item Status

(Note: Epic 10 had no retrospective, so we track against the last available retro — Epic 9.)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Carried since Epic 5. Permanent technical debt. |
| A2 | Raise scanner.ts branch coverage from 74.1% to 90%+ | Not done | Carried since Epic 8. Permanent technical debt. |
| A3 | Raise overall branch coverage from 82.32% to 85%+ | Improved | Recovered from 81.20% to 84.21% — still 0.79 pts below target. |
| A4 | Wire `codeharness coverage` into pre-commit gate or CI | Not done | Carried since Epic 4. Permanent technical debt. |
| A5 | Run `codeharness sync` after story completion | Not done | Carried since Epic 1. Story headers show `verified` not `done`. |

**Summary:** 0 of 5 action items fully resolved. A3 made meaningful progress (recovered 3 points) but has not yet crossed the 85% threshold. All others remain permanent carries.

---

## Action Items for Next Epic

| # | Action | Owner | Target |
|---|--------|-------|--------|
| A1 | Raise branch coverage from 84.21% to 85%+ — focus on `retro-import.ts` (95.83% branch) and `github-import.ts` (97.36% branch) remaining gaps | Dev | Next epic |
| A2 | Run `codeharness retro-import --epic 11` to import this retrospective's action items into beads — proving the pipeline works end-to-end | SM | Immediate |
| A3 | Add Epic 10 retrospective or formally document the decision to skip it | SM | Next sprint |
| A4 | Wire `codeharness coverage` into CI (GitHub Actions workflow already exists) | Dev | Next epic |
| A5 | Complete Story 11.4 verification checkboxes (Showboat proof doc) or remove the checkbox requirement | Dev | Immediate |

---

## Metrics

- **Stories planned:** 5
- **Stories completed:** 5
- **Stories failed:** 0
- **New production TypeScript files created:** 4 (retro-parser.ts, retro-import.ts, github.ts, github-import.ts)
- **Production files substantially modified:** 5 (verify.ts, bmad-patches.ts, bmad.ts, state.ts, index.ts)
- **Total new production lines:** ~849 (10,529 - 9,680)
- **Total production TypeScript files:** 43 (up from 39)
- **Total production lines of code:** 10,529
- **Test files created:** 4 (retro-parser.test.ts, retro-import.test.ts, github.test.ts, github-import.test.ts)
- **Total new test lines:** ~3,138 (20,054 - 16,916)
- **Total test files:** 45 (up from 41)
- **Total unit tests:** 1,390 (up from 1,210, +14.9%)
- **Total test lines:** 20,054 (up from 16,916, +18.6%)
- **Statement coverage:** 95.10% (up from 93.23%)
- **Branch coverage:** 84.21% (up from 81.20%)
- **Function coverage:** 98.02% (up from 97.85%)
- **Line coverage:** 95.57% (up from 93.62%)
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~2.25s (vitest)
- **Code review issues found and fixed:** 34 across 5 stories
- **Epic 9 retro actions resolved:** 0 of 5 (A3 improved but not fully resolved)

### Growth Across Epics

| Metric | Epic 9 (End) | Epic 11 (End) | Delta |
|--------|-------------|--------------|-------|
| Production lines | 9,680 | 10,529 | +849 (+8.8%) |
| Test lines | 16,916 | 20,054 | +3,138 (+18.6%) |
| Unit tests | 1,210 | 1,390 | +180 (+14.9%) |
| Source files | 39 | 43 | +4 |
| Test files | 41 | 45 | +4 |
| Statement coverage | 93.23% | 95.10% | +1.87 pts |
| Branch coverage | 81.20% | 84.21% | +3.01 pts |
| Function coverage | 97.85% | 98.02% | +0.17 pts |
| Line coverage | 93.62% | 95.57% | +1.95 pts |

### Test-to-Production Ratio

- **Test lines per production line:** 1.90x (20,054 / 10,529) — up from 1.75x at Epic 9
- **Tests per source file:** 30.9 (1,390 / 45)
