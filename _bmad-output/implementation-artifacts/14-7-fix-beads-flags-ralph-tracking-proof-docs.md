# Story 14-7: Fix Beads Sync, Session Flags, Ralph Story Tracking, Proof Docs

## Status: backlog

## Story

As a developer,
I want chronic infrastructure bugs fixed,
So that sessions stop wasting time on known issues.

## Acceptance Criteria

- [ ] AC1: Given a story file with `## Status: backlog` header, when `readStoryFileStatus()` runs, then it returns `'backlog'` (handles `##` prefix) <!-- verification: cli-verifiable -->
- [ ] AC2: Given `bd` CLI is not installed, when `codeharness sync` runs, then it prints `[INFO] beads CLI not installed -- skipping` (not `[FAIL]`) <!-- verification: cli-verifiable -->
- [ ] AC3: Given `cargo test` passes, when `codeharness.local.md` is checked, then `session_flags.tests_passed` is `true` <!-- verification: cli-verifiable -->
- [ ] AC4: Given ralph times out during a story, when timeout report is generated, then `status.json` contains the correct `story` field (not `unknown`) <!-- verification: cli-verifiable -->
- [ ] AC5: Given the codeharness proof format, when `commands/harness-verify.md` is read, then the expected markdown structure is documented <!-- verification: cli-verifiable -->

## Technical Notes

This is a bug-fix bundle. Five chronic issues that waste session time repeatedly.

### Fix 1: Story file status parsing (AC1)

`readStoryFileStatus()` in `src/lib/beads-sync.ts` (or `src/lib/sync/story-files.ts` after Epic 12) fails to parse `## Status: backlog` because it looks for `# Status:` (single `#`). Fix the regex to handle both `#` and `##` prefixes:

```typescript
const match = content.match(/^#{1,2}\s*Status:\s*(.+)/m);
```

### Fix 2: Beads CLI not installed (AC2)

`src/lib/beads-sync.ts` and `src/lib/beads.ts` throw errors when `bd` CLI is not installed. Use `BeadsNotInstalledError` (Decision 7) and handle gracefully:

```typescript
try {
  execSync('which bd', { stdio: 'pipe' });
} catch {
  output.info('beads CLI not installed — skipping');
  return ok(null);
}
```

The error type `BeadsNotInstalledError` should be defined per Decision 7.

### Fix 3: Session flags for Rust tests (AC3)

After `cargo test` passes during verification or dev, `session_flags.tests_passed` in `codeharness.local.md` is not being set. The flag-setting logic only triggers for `npm test` results. Add cargo test exit code handling:

Check `src/lib/state.ts` or wherever session flags are written. Ensure the test-pass detection works for all stacks, not just Node.js.

### Fix 4: Ralph timeout story tracking (AC4)

When ralph times out, `ralph/status.json` (or `sprint-state.json` `session` field after Epic 11) has `story: 'unknown'` because the story key isn't passed to the timeout handler. Ensure `src/commands/timeout-report.ts` and the ralph timeout handler receive the current story key.

### Fix 5: Proof format documentation (AC5)

Document the expected proof markdown structure in `commands/harness-verify.md` so the verify subagent knows what format to produce. This is a documentation-only change to the Claude Code plugin command file.

## Files to Change

- `src/lib/beads-sync.ts` — Fix `readStoryFileStatus()` regex to handle `##` prefix
- `src/lib/beads-sync.ts` — Add `BeadsNotInstalledError` handling, graceful skip when `bd` not installed
- `src/lib/beads.ts` — Add `BeadsNotInstalledError` class, check `bd` availability before operations
- `src/lib/state.ts` — Fix session flag writing to work for all stacks (cargo test, pytest, npm test)
- `src/commands/timeout-report.ts` — Pass current story key to timeout handler, ensure `status.json` has correct story field
- `src/lib/run-helpers.ts` — Ensure story key is propagated to ralph timeout handling
- `commands/harness-verify.md` — Document the expected proof markdown structure
