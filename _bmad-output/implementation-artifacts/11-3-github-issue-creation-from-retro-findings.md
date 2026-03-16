# Story 11.3: GitHub Issue Creation from Retro Findings

Status: verified

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want retro findings to create GitHub issues on the appropriate repos,
so that findings are tracked in the project's issue tracker and visible to collaborators.

## Acceptance Criteria

1. **Given** retro findings have been imported to beads (Story 11.2 completed), **when** `codeharness retro-import --epic N` runs with `retro_issue_targets` configured in state file, **then** project-classified findings create issues on the project repo (auto-detected from `git remote get-url origin`) **and** harness-classified findings create issues on `iVintik/codeharness` repo **and** each issue body includes the retro context, epic number, and source project name. (AC:1)

2. **Given** a GitHub issue with the same gap-id already exists on the target repo, **when** `retro-import` runs, **then** no duplicate issue is created **and** CLI prints `[INFO] GitHub issue exists: owner/repo#N`. (AC:2)

3. **Given** `gh` CLI is not installed or not authenticated, **when** `retro-import` attempts GitHub issue creation, **then** beads import still succeeds **and** GitHub creation is skipped with `[WARN] gh CLI not available — skipping GitHub issue creation`. (AC:3)

4. **Given** `retro_issue_targets` is not configured in state file, **when** `retro-import` runs, **then** only beads import happens (no GitHub issues) **and** CLI prints `[INFO] No retro_issue_targets configured — skipping GitHub issues`. (AC:4)

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/github.ts` — GitHub CLI wrapper (AC: 1, 2, 3)
  - [x] 1.1: Create `src/lib/github.ts` with `isGhAvailable(): boolean` — runs `which gh` via `execFileSync`, returns boolean
  - [x] 1.2: Implement `ghIssueCreate(repo: string, title: string, body: string, labels: string[]): { number: number; url: string }` — wraps `gh issue create --repo <repo> --title <title> --body <body> --label <label>... --json number,url`
  - [x] 1.3: Implement `ghIssueSearch(repo: string, query: string): GhIssue[]` — wraps `gh issue list --repo <repo> --search <query> --json number,title,body,url`
  - [x] 1.4: Implement `findExistingGhIssue(repo: string, gapId: string): GhIssue | undefined` — searches for issues containing the gap-id string in body text
  - [x] 1.5: Implement `getRepoFromRemote(): string | undefined` — runs `git remote get-url origin`, parses `owner/repo` from HTTPS or SSH URL
  - [x] 1.6: Implement `ensureLabels(repo: string, labels: string[]): void` — runs `gh label create` for each label, ignores failures (label may already exist)
  - [x] 1.7: All external calls wrapped in try/catch. Throw `GitHubError` (custom error class) on failure.
  - [x] 1.8: Export types: `GhIssue`, `GitHubError`, `RetroIssueTarget`

- [x] Task 2: Add `retro_issue_targets` to state file (AC: 1, 4)
  - [x] 2.1: Add optional `retro_issue_targets` field to `HarnessState` interface in `src/lib/state.ts`:
    ```typescript
    retro_issue_targets?: Array<{ repo: string; labels: string[] }>;
    ```
  - [x] 2.2: No change to `getDefaultState()` — field is optional, absent by default (no GitHub issues unless configured)

- [x] Task 3: Extend `retro-import` command with GitHub issue creation (AC: 1, 2, 3, 4)
  - [x] 3.1: After the existing beads import loop in `src/commands/retro-import.ts`, add GitHub issue creation phase
  - [x] 3.2: Read state file via `readState()` to check for `retro_issue_targets`
  - [x] 3.3: If `retro_issue_targets` is undefined/empty, print `[INFO] No retro_issue_targets configured — skipping GitHub issues` and skip
  - [x] 3.4: Call `isGhAvailable()` — if false, print `[WARN] gh CLI not available — skipping GitHub issue creation` and skip
  - [x] 3.5: For each imported item (from beads phase), determine target repo:
    - Classification `project` → use target with `repo: "auto"` (resolve via `getRepoFromRemote()`)
    - Classification `harness` → use target with `repo: "iVintik/codeharness"` (or first non-auto target)
    - Classification `tool:<name>` → treat same as `project`
  - [x] 3.6: For each item+repo pair, call `findExistingGhIssue(repo, gapId)` — if found, print `[INFO] GitHub issue exists: {repo}#{number}` and skip
  - [x] 3.7: If not found, call `ensureLabels()` then `ghIssueCreate()` with:
    - Title: same as beads issue title
    - Body: retro context + `\n\n<!-- gap-id: {gapId} -->` (enables dedup search)
    - Labels: from matching `retro_issue_targets` entry
  - [x] 3.8: Update JSON output to include `github` field: `{"imported": N, "skipped": M, "issues": [...], "github": {"created": X, "skipped": Y, "errors": Z}}`
  - [x] 3.9: Handle `StateFileNotFoundError` — if no state file, skip GitHub phase with info message (beads import still works without state file)

- [x] Task 4: Unit tests (AC: 1, 2, 3, 4)
  - [x] 4.1: Test `isGhAvailable()` — mock `execFileSync` success → true, mock failure → false
  - [x] 4.2: Test `ghIssueCreate()` — mock `execFileSync` returning JSON, verify args passed correctly
  - [x] 4.3: Test `ghIssueSearch()` — mock `execFileSync` returning JSON array
  - [x] 4.4: Test `findExistingGhIssue()` — issue with gap-id in body returns match; no match returns undefined
  - [x] 4.5: Test `getRepoFromRemote()` — parse HTTPS URL `https://github.com/owner/repo.git` → `owner/repo`; parse SSH URL `git@github.com:owner/repo.git` → `owner/repo`; handle failure → undefined
  - [x] 4.6: Test `ensureLabels()` — calls `gh label create` for each label, ignores errors
  - [x] 4.7: Test retro-import with `retro_issue_targets` configured: beads import + GitHub issue creation
  - [x] 4.8: Test retro-import without `retro_issue_targets`: beads import only, info message printed
  - [x] 4.9: Test retro-import with `gh` unavailable: beads import succeeds, warn message printed
  - [x] 4.10: Test retro-import with existing GitHub issue (dedup): info message, no creation
  - [x] 4.11: Test retro-import `--json` output includes `github` field
  - [x] 4.12: Test retro-import with no state file: beads import still works, GitHub phase skipped
  - [x] 4.13: Test `GitHubError` error class structure

## Dev Notes

### Architecture Constraints

- **Architecture Decision 10** governs this story. Retro findings flow through beads first, then optionally to GitHub. Beads import must NEVER fail because of GitHub issues.
- **Architecture Decision 3**: Beads is the universal store. GitHub is supplementary. Beads import is the primary operation; GitHub is secondary/optional.
- **`gh` CLI is external**: Detected at runtime via `which gh`. If unavailable, GitHub operations are skipped with warning. This is by design per architecture Decision 10.

### Existing Code to Reuse

| Function | File | Purpose |
|----------|------|---------|
| `createOrFindIssue(title, gapId, opts)` | `src/lib/beads.ts:177` | Beads issue creation with dedup. Already used in retro-import — do NOT modify. |
| `buildGapId(category, identifier)` | `src/lib/beads.ts:147` | Builds `[gap:category:identifier]` strings. |
| `readState()` | `src/lib/state.ts:106` | Reads `HarnessState` from `.claude/codeharness.local.md` YAML frontmatter. |
| `StateFileNotFoundError` | `src/lib/state.ts:185` | Thrown when no state file exists. Catch this to gracefully skip GitHub phase. |
| `ok()`, `fail()`, `info()`, `warn()`, `jsonOutput()` | `src/lib/output.ts` | CLI output helpers. Note: `warn()` exists at line 21 — use it for `gh` unavailable message. |
| `classifyFinding()`, `derivePriority()` | `src/lib/retro-parser.ts` | Already called in retro-import loop. Classification result drives repo targeting. |
| `classificationToString()` | `src/commands/retro-import.ts:22` | Converts `Classification` to string like `tool:showboat`. Already exists. |
| `execFileSync` | `node:child_process` | Used extensively in `beads.ts` — follow same pattern for `gh` CLI calls. |

### Config Schema

`retro_issue_targets` in `codeharness.local.md` YAML frontmatter:

```yaml
retro_issue_targets:
  - repo: auto                          # auto-detect from git remote
    labels: ["retro-finding", "sprint-candidate"]
  - repo: iVintik/codeharness           # explicit repo for harness findings
    labels: ["user-retro", "auto-filed"]
```

Repo resolution rules:
- `repo: "auto"` → call `getRepoFromRemote()` to detect from `git remote get-url origin`
- Any other value → use as-is (e.g., `iVintik/codeharness`)

Classification → target mapping:
- `project` or `tool:*` → first target with `repo: "auto"` (or first target if none is auto)
- `harness` → target with `repo: "iVintik/codeharness"` (or first non-auto target, or auto as fallback)

### GitHub Issue Body Format

```markdown
## Retro Action Item {number} — Epic {epicNum}

**Source project:** {projectName} (auto-detected from git remote)
**Classification:** {classification}
**Original status:** {status}
**Notes:** {notes}

{description}

<!-- gap-id: [gap:retro:epic-N-item-M] -->
```

The `<!-- gap-id: ... -->` HTML comment enables dedup search via `gh issue list --search`.

### Dedup Strategy

GitHub issue dedup uses `gh issue list --repo <repo> --search "gap:retro:epic-N-item-M" --json number,title,body,url`. The gap-id is embedded in the issue body as an HTML comment. Search returns issues whose body contains the gap-id string.

### Anti-Patterns to Avoid

- Do NOT modify `src/lib/beads.ts` — beads logic is stable, reuse as-is.
- Do NOT make beads import depend on GitHub success — GitHub failures must not affect beads.
- Do NOT use `octokit` or any GitHub API library — use `gh` CLI via `execFileSync` per architecture Decision 10.
- Do NOT hardcode repo URLs — use `retro_issue_targets` config + `getRepoFromRemote()`.
- Do NOT create a separate command for GitHub issues — extend existing `retro-import`.
- Do NOT register any new commands in `src/index.ts` — this story only extends `retro-import` and adds `src/lib/github.ts`.
- Do NOT use `console.log` directly — use `ok()`, `fail()`, `info()`, `warn()` from `output.ts`.

### Previous Story Intelligence (11.2)

Story 11.2 established:
- `retro-import` command structure in `src/commands/retro-import.ts` — extend this, don't rewrite
- `parseRetroActionItems()` and `classifyFinding()` in `src/lib/retro-parser.ts` — reuse as-is
- Commander.js registration pattern: `registerRetroImportCommand(program: Command)`
- Test patterns: `vi.mock()` for module mocking, separate test files per module
- JSON output pattern: `jsonOutput({ imported, skipped, issues })` — extend with `github` field
- Error handling: all external calls in try/catch, `fail()` with `{ json: isJson }` in all modes
- Code review findings: always wrap external calls in try/catch, validate inputs, use `as unknown as Type` for complex casts

Story 11.1 established:
- `--retro` and `--epic` flags on verify command — similar flag patterns
- Epic number validation: `epicNum < 1` check
- `updateSprintStatus()` in `src/lib/beads-sync.ts` for YAML status updates

### Key File Locations

| File | Purpose |
|------|---------|
| `src/lib/github.ts` | **NEW** — `gh` CLI wrapper: `isGhAvailable`, `ghIssueCreate`, `ghIssueSearch`, `findExistingGhIssue`, `getRepoFromRemote`, `ensureLabels` |
| `src/commands/retro-import.ts` | **MODIFY** — Add GitHub issue creation phase after beads import loop |
| `src/lib/state.ts` | **MODIFY** — Add `retro_issue_targets` to `HarnessState` interface |
| `src/lib/__tests__/github.test.ts` | **NEW** — Unit tests for github.ts |
| `src/commands/__tests__/retro-import.test.ts` | **MODIFY** — Add tests for GitHub integration |
| `src/lib/AGENTS.md` | **MODIFY** — Add github.ts entry |

### Project Structure Notes

- New lib module follows existing pattern: `src/lib/github.ts` alongside `src/lib/beads.ts`
- Tests in `src/lib/__tests__/github.test.ts` following existing `src/lib/__tests__/*.test.ts` pattern
- Build: `tsup` ESM bundle. Imports use `.js` extension (e.g., `import { ... } from '../lib/github.js'`)
- Test framework: Vitest with `vi.mock()` for module mocking
- No new commands registered — only extending existing `retro-import`

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Story 11.3 (lines 1683-1721)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 10 (GitHub Integration & Retro Issue Loop)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 3 (Beads as universal issue store)]
- [Source: src/commands/retro-import.ts (existing command to extend)]
- [Source: src/lib/beads.ts (execFileSync pattern, createOrFindIssue)]
- [Source: src/lib/state.ts (HarnessState interface, readState)]
- [Source: src/lib/output.ts (ok, fail, info, warn, jsonOutput)]
- [Source: src/lib/retro-parser.ts (classifyFinding, Classification type)]
- [Source: _bmad-output/implementation-artifacts/11-2-retro-finding-classification-beads-import.md (previous story)]
- [Source: _bmad-output/implementation-artifacts/11-1-fix-retro-status-lifecycle.md (previous story)]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`docs/exec-plans/active/11-3-github-issue-creation-from-retro-findings.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100% lines for github.ts, 100% lines for retro-import.ts)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (src/lib/AGENTS.md — added github.ts entry)
- [x] Exec-plan created in `docs/exec-plans/active/11-3-github-issue-creation-from-retro-findings.proof.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [x] Coverage target: 100% lines (github.ts: 100%, retro-import.ts: 100%)
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context) on 2026-03-15
**Outcome:** Approved with fixes applied

### Issues Found: 0 High, 5 Medium, 2 Low

#### MEDIUM Issues (all fixed)

1. **Dedup search misses closed issues** — `ghIssueSearch` did not pass `--state all` to `gh issue list`, so issues that were created then closed would not be found by dedup, causing duplicate creation. **Fixed:** Added `--state all` to search args. Updated corresponding test.

2. **GitHub issue body missing status/notes fields** — `buildGitHubIssueBody` omitted `Original status` and `Notes` fields specified in the story's body format template. **Fixed:** Added `status` and `notes` to `ImportedIssue` interface, populated them during construction, and included them in the body template. Added test verifying body content.

3. **`ImportedIssue` missing required fields** — The interface lacked `status` and `notes` properties needed to populate the GitHub issue body per spec. **Fixed:** Added fields to interface and populated them from `item.status`/`item.notes`.

4. **Missing branch coverage in retro-import.ts** — JSON-mode code paths for repo-resolution warnings, existing-issue info messages, gh-unavailable warnings, and creation error reporting were not tested (86.11% branch). **Fixed:** Added 7 new tests covering JSON-mode suppression of console output for all `!isJson` branches. Branch coverage improved to 95.83%.

5. **Missing branch coverage in github.ts** — `ghIssueSearch` error handler's `err instanceof Error` false branch and `findExistingGhIssue`'s `body?.includes` null-body branch were not covered (90% branch). **Fixed:** Added 2 tests (non-Error throw in `ghIssueSearch`, null body in `findExistingGhIssue`). Branch coverage improved to 100%.

#### LOW Issues (not fixed — acceptable)

6. **`isGhAvailable` uses `which` instead of `command -v`** — `which` is not POSIX on all systems. Acceptable since this targets macOS/Linux dev machines.

7. **No input validation on `repo` parameter** — Functions like `ghIssueCreate` don't validate repo format. Invalid values will fail at the `gh` CLI level with a clear error. Acceptable given the `try/catch` wrapping.

### Coverage After Review

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| github.ts | 100% | 100% | 100% | 100% |
| retro-import.ts | 98.38% | 95.83% | 100% | 100% |
| **Overall** | **95.01%** | **83.98%** | **98%** | **95.49%** |

Per-file floor: All 42 files above 80% statement coverage.
Overall target: 95.01% (above 90% requirement).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug sessions required.

### Completion Notes List

- Task 1: Created `src/lib/github.ts` with 7 exported functions and 3 types. All `gh` CLI calls use `execFileSync` (same pattern as beads.ts). `findExistingGhIssue` silently returns undefined on search failure (per architecture Decision 10 — GitHub failures must not block). Added `parseRepoFromUrl` as a testable helper for URL parsing.
- Task 2: Added `retro_issue_targets?: Array<{ repo: string; labels: string[] }>` to `HarnessState` interface. No changes to `getDefaultState()` — field absent by default.
- Task 3: Extended `retro-import` with GitHub issue creation phase after beads loop. Key design: `createGitHubIssues()` is a standalone function that never throws — all errors are caught and reported. `resolveTargetRepo()` handles classification-to-repo routing with fallback chains. Beads import is completely isolated from GitHub phase.
- Task 4: 27 unit tests for github.ts, 13 integration tests for GitHub phase in retro-import. Total 60 tests for this story (40 new + 20 existing updated). Full regression suite: 1332 tests passing.

### Change Log

- 2026-03-15: Implemented Story 11.3 — GitHub issue creation from retro findings
- 2026-03-15: Code review — fixed 5 MEDIUM issues, added 11 tests (60 -> 71), branch coverage improved

### File List

- src/lib/github.ts (NEW)
- src/lib/state.ts (MODIFIED — added retro_issue_targets to HarnessState)
- src/commands/retro-import.ts (MODIFIED — added GitHub issue creation phase)
- src/lib/__tests__/github.test.ts (NEW)
- src/commands/__tests__/retro-import.test.ts (MODIFIED — added GitHub integration tests)
- src/lib/AGENTS.md (MODIFIED — added github.ts entry)
- docs/exec-plans/active/11-3-github-issue-creation-from-retro-findings.proof.md (NEW)
