# Showboat Proof: 11-3 GitHub Issue Creation from Retro Findings

## Test Environment

- **Type:** Local development (macOS)
- **Runtime:** Node.js, Vitest 4.1.0
- **Date:** 2026-03-15

## Test 1: Unit Tests — github.ts (27 tests)

**Scope:** `isGhAvailable()`, `ghIssueCreate()`, `ghIssueSearch()`, `findExistingGhIssue()`, `getRepoFromRemote()`, `parseRepoFromUrl()`, `ensureLabels()`, `GitHubError`

**Results:**
- `isGhAvailable`: true on `which gh` success, false on failure
- `ghIssueCreate`: creates issue, passes labels, throws GitHubError on failure (Error and non-Error)
- `ghIssueSearch`: returns parsed JSON array, empty array for empty output, GitHubError on failure
- `findExistingGhIssue`: returns match when gap-id in body, undefined when no match, undefined on search failure (no throw)
- `getRepoFromRemote`: HTTPS with/without .git, SSH with/without .git, undefined on failure
- `parseRepoFromUrl`: HTTPS and SSH URL parsing, undefined for unrecognized
- `ensureLabels`: calls gh label create per label, ignores errors, handles empty array
- `GitHubError`: includes command and originalMessage, is instanceof Error

**Coverage:** 100% Stmts / 90% Branch / 100% Funcs / 100% Lines

**Verdict:** PASS

## Test 2: Command Tests — retro-import.ts GitHub integration (13 tests)

**Scope:** GitHub issue creation phase in retro-import command

**Results:**
- Creates GitHub issues when `retro_issue_targets` configured: ensureLabels + ghIssueCreate called
- Skips GitHub when `retro_issue_targets` not configured: `[INFO] No retro_issue_targets configured`
- Skips GitHub when `gh` CLI unavailable: `[WARN] gh CLI not available`
- Dedup: skips existing GitHub issues with `[INFO] GitHub issue exists: repo#N`
- JSON output includes `github` field: `{ created, skipped, errors }`
- No state file: beads import succeeds, GitHub skipped with `[INFO] No state file found`
- Other state errors: skipped with `[INFO] Could not read state file`
- Repo routing: harness findings -> iVintik/codeharness, project -> auto-detected repo
- Harness fallback: non-auto target when no codeharness target, auto as last resort
- Project fallback: first target when no auto target
- ghIssueCreate failure: graceful error with `[FAIL] GitHub issue failed for`
- Auto repo unresolvable: `[WARN] Cannot resolve repo`

**Coverage:** 98.38% Stmts / 86.11% Branch / 100% Funcs / 100% Lines

**Verdict:** PASS

## Test 3: Full Regression Suite

**Scope:** All 1332 tests across 44 test files

**Results:** All passing, zero regressions

**Verdict:** PASS

## Acceptance Criteria Verification

| AC | Description | Evidence | Status |
|----|-------------|----------|--------|
| AC:1 | Project-classified findings create issues on project repo, harness-classified on codeharness | Tests verify repo routing by classification | PASS |
| AC:2 | Duplicate issues detected by gap-id, no duplicate created | `findExistingGhIssue` dedup test, skip message verified | PASS |
| AC:3 | Missing `gh` CLI gracefully skipped, beads import succeeds | `isGhAvailable` false -> warn + skip, beads still works | PASS |
| AC:4 | Missing `retro_issue_targets` -> beads only, info message | State without targets -> info message, no GitHub calls | PASS |
