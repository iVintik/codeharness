# Story 8.1: Stable Issue Identity & Beads-Level Deduplication

Status: ready-for-dev

## Story

As a developer running onboard or bridge multiple times,
I want the system to never create duplicate beads issues for the same gap,
So that my issue list stays clean and I don't waste time on already-tracked work.

## Acceptance Criteria

1. **Given** a gap like "coverage below 80% in src/lib/scanner.ts", **When** any code path creates a beads issue for it, **Then** the issue description contains a tag like `[gap:coverage:src/lib/scanner.ts]`.

2. **Given** a beads issue already exists with tag `[gap:coverage:src/lib/scanner.ts]` and status `open`, **When** onboard or bridge tries to create another issue for the same gap, **Then** the existing issue is returned, no duplicate is created, **And** `[INFO] Already tracked: <title> (ISSUE-NNN)` is printed.

3. **Given** the `bridge` command imports stories from BMAD epics, **When** importing, each story gets a deterministic gap-id based on epic number + story number, **Then** re-running `bridge` with the same epics file creates no duplicates.

4. **Given** the `post-test-verify` hook creates a beads issue for a test failure, **When** the same test fails again in the next iteration, **Then** no duplicate issue is created.

## Tasks / Subtasks

- [ ] Task 1: Implement gap-id tagging system in `src/lib/beads.ts` (AC: #1, #2)
  - [ ] 1.1: Define the gap-id format as `[gap:<category>:<identifier>]`. Categories are: `coverage`, `docs`, `verification`, `bridge`, `test-failure`. The tag is embedded in the beads issue description field.
  - [ ] 1.2: Add a new function `buildGapId(category: string, identifier: string): string` that returns the formatted `[gap:<category>:<identifier>]` string.
  - [ ] 1.3: Add a new function `findExistingByGapId(gapId: string, issues: BeadsIssue[]): BeadsIssue | undefined` that scans an array of beads issues and returns the first one whose `description` field contains the given gap-id tag. Only match issues with status !== `'done'` (i.e., only check open issues).
  - [ ] 1.4: Add a new function `createOrFindIssue(title: string, gapId: string, opts?: BeadsCreateOpts): { issue: BeadsIssue; created: boolean }` that:
    - Calls `listIssues()` to get all current issues.
    - Calls `findExistingByGapId(gapId, issues)` to check for an existing match.
    - If found, returns `{ issue: existingIssue, created: false }`.
    - If not found, calls `createIssue(title, { ...opts, description: appendGapId(opts?.description, gapId) })` and returns `{ issue: newIssue, created: true }`.
  - [ ] 1.5: Add helper `appendGapId(existingDescription: string | undefined, gapId: string): string` that appends the gap-id tag to an existing description (or returns just the tag if description is empty/undefined). Use newline separator.

- [ ] Task 2: Update `importStoriesToBeads` in `src/lib/bmad.ts` to use gap-id dedup (AC: #3)
  - [ ] 2.1: Change `importStoriesToBeads` to generate a deterministic gap-id for each story: `[gap:bridge:<epicNumber>.<storyNumber>]` (e.g., `[gap:bridge:3.2]`).
  - [ ] 2.2: Replace the current title-based dedup (`existingTitlesNormalized` set) with gap-id-based dedup. Use `findExistingByGapId()` from `src/lib/beads.ts` to check if an issue already exists for the given gap-id.
  - [ ] 2.3: When creating a new issue, pass the gap-id-augmented description to `beadsFns.createIssue()` by appending the gap-id tag to the story file path description.
  - [ ] 2.4: Update the `beadsFns` interface parameter to include the new `findExistingByGapId` dependency, or import it directly since it operates on `BeadsIssue[]` data.

- [ ] Task 3: Update `importOnboardingEpic` in `src/lib/epic-generator.ts` to use gap-id dedup (AC: #1, #2)
  - [ ] 3.1: The `wrappedBeadsFns.createIssue` in `importOnboardingEpic` should generate gap-ids based on story type and module. For coverage stories: `[gap:coverage:<module-path>]`. For docs stories: `[gap:docs:<doc-name>]`. For cleanup: `[gap:docs:bmalph-cleanup]`.
  - [ ] 3.2: Since `importOnboardingEpic` delegates to `importStoriesToBeads`, the gap-id generation from Task 2 will apply. Ensure the epic number (0 for onboarding) and story number produce correct gap-ids like `[gap:bridge:0.1]`.

- [ ] Task 4: Update bridge command in `src/commands/bridge.ts` (AC: #2, #3)
  - [ ] 4.1: Update the info message for existing issues to include the beads issue ID: change from `info('Story already exists in beads: ...')` to `info('Already tracked: <title> (<issue-id>)')`.
  - [ ] 4.2: The `BridgeImportResult` should carry the beads ID of existing issues (not just `null`). Update `importStoriesToBeads` to populate `beadsId` from the found existing issue when dedup matches.

- [ ] Task 5: Update `post-test-verify.sh` hook to use gap-id dedup (AC: #4)
  - [ ] 5.1: When the hook creates a beads issue for test failures, add a gap-id tag to the description. Use `[gap:test-failure:session-<date>]` as the gap-id. Since the hook uses `bd create` directly, append `--description "[gap:test-failure:$(date +%Y-%m-%d)]"` to the command.
  - [ ] 5.2: Before creating, check if an issue with that gap-id already exists. Run `bd list --json` and grep for the gap-id pattern in the output. If found, skip creation.

- [ ] Task 6: Write unit tests (AC: #1-#4)
  - [ ] 6.1: Add tests in `src/lib/__tests__/beads.test.ts` for `buildGapId` — verify format `[gap:category:identifier]` for various category/identifier combinations.
  - [ ] 6.2: Add tests for `findExistingByGapId` — verify it finds matching issues by description content, returns undefined when no match, and ignores closed/done issues.
  - [ ] 6.3: Add tests for `createOrFindIssue` — verify it returns existing issue without creating when gap-id matches, creates new issue when no match, and correctly appends gap-id to description.
  - [ ] 6.4: Add tests for `appendGapId` — verify it handles empty description, existing description, and already-present gap-id.
  - [ ] 6.5: Update tests in `src/lib/__tests__/bmad.test.ts` for `importStoriesToBeads` — verify gap-id-based dedup replaces title-based dedup, verify re-import with same epics file produces no duplicates, verify `beadsId` is populated for existing issues.
  - [ ] 6.6: Add integration-style test: create issues via `createOrFindIssue`, then call `importStoriesToBeads` with the same stories — verify no duplicates.

- [ ] Task 7: Build and verify (AC: #1-#4)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully with new exports.
  - [ ] 7.2: Run `npm run test:unit` — verify all unit tests pass including new dedup tests.
  - [ ] 7.3: Run `npm run test:coverage` — verify 100% test coverage is maintained.

## Dev Notes

### Architecture Context

The current deduplication in `importStoriesToBeads` (in `src/lib/bmad.ts`) uses title-based matching: it normalizes titles to lowercase and checks against a Set of existing issue titles. This is fragile — title changes break dedup, and different code paths (bridge, onboard, hooks) have no shared dedup mechanism.

This story introduces a `gap-id` system: a structured tag embedded in the beads issue description field. The format `[gap:<category>:<identifier>]` is deterministic and shared across all issue-creation code paths. The key insight is that the *identity* of a gap is separate from its *title* — the gap-id captures identity, while the title is for human readability.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/beads.ts` | Add `buildGapId`, `findExistingByGapId`, `createOrFindIssue`, `appendGapId` functions |
| `src/lib/bmad.ts` | Replace title-based dedup with gap-id-based dedup in `importStoriesToBeads` |
| `src/lib/epic-generator.ts` | Ensure onboarding epic import uses gap-id through the `importStoriesToBeads` path |
| `src/commands/bridge.ts` | Update info messages to show issue ID for existing issues |
| `hooks/post-test-verify.sh` | Add gap-id to `bd create` calls, add dedup check before creation |
| `src/lib/__tests__/beads.test.ts` | New tests for gap-id functions |
| `src/lib/__tests__/bmad.test.ts` | Update dedup tests for gap-id-based approach |

### Existing Code to Leverage

- `src/lib/beads.ts` — `listIssues()` returns `BeadsIssue[]` with `id`, `title`, `status`, `type`, `priority`, `description`. The `description` field is where gap-id tags will be embedded.
- `src/lib/bmad.ts` — `importStoriesToBeads()` already has dedup logic (title-based) that needs to be replaced. The function accepts `beadsFns` for dependency injection, making it testable.
- `src/lib/epic-generator.ts` — `importOnboardingEpic()` wraps `importStoriesToBeads()`, so gap-id changes propagate automatically.
- `src/commands/bridge.ts` — Passes `{ listIssues, createIssue }` to `importStoriesToBeads`. May need to also pass `findExistingByGapId` or rely on internal imports.
- `hooks/post-test-verify.sh` — Currently creates issues with `bd create "Test failures detected..." --type bug` without any dedup. Needs both gap-id tagging and pre-creation check.

### Gap-ID Format Reference

| Category | Example Gap-ID | Source |
|----------|---------------|--------|
| `bridge` | `[gap:bridge:3.2]` | BMAD epic 3, story 2 imported via bridge |
| `coverage` | `[gap:coverage:src/lib/scanner.ts]` | Coverage gap in onboard scan |
| `docs` | `[gap:docs:ARCHITECTURE.md]` | Missing doc in onboard audit |
| `test-failure` | `[gap:test-failure:2026-03-15]` | Test failure detected by hook |
| `verification` | `[gap:verification:4-1-test]` | Missing verification proof |

### Backward Compatibility

Existing beads issues created before this story will not have gap-id tags. The `findExistingByGapId` function will not match them, which means the first run after this change could potentially create duplicates of pre-existing issues. This is acceptable — the old title-based dedup was already imperfect, and a one-time bridge re-run is a known trade-off. After this story, all new issues will have gap-id tags and dedup will be reliable going forward.

### Hook Dedup Constraint

The `post-test-verify.sh` hook runs in bash and must complete within 500ms (NFR1). The dedup check (`bd list --json | grep gap-id`) adds a `bd list` call. If `bd list` is slow, the hook should skip dedup and create the issue anyway (fail open on dedup, not on creation). Priority: don't break the hook's latency contract.
