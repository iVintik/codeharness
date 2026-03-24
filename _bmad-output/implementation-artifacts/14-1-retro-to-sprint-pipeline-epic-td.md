# Story 14-1: Retro-to-Sprint Pipeline (Step 8b) + Persistent epic-TD

## Status: backlog

## Story

As a developer running harness-run,
I want retro action items to auto-create stories under epic-TD,
So that tech debt gets tracked and prioritized automatically.

## Acceptance Criteria

- [ ] AC1: Given a retro file with `### Fix Now` items, when Step 8b runs, then new `TD-N-slug: backlog` entries appear in sprint-state.json under epic-TD <!-- verification: cli-verifiable -->
- [ ] AC2: Given `epic-TD` doesn't exist, when Step 8b creates the first TD story, then `epic-TD` is created with `status: in-progress` (never transitions to `done`) <!-- verification: cli-verifiable -->
- [ ] AC3: Given a duplicate action item (80%+ word overlap with existing TD story), when Step 8b processes it, then it's skipped with `[INFO]` message <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 6 (Retro-to-Sprint Pipeline).** Three mechanisms: persistent epic-TD, retro auto-creates stories, tech debt gate. This story covers the first two.

### Step 8b Implementation

After the session retro subagent writes the retro markdown file, harness-run parses the `## 6. Action Items` section.

The retro parser already exists at `src/lib/retro-parser.ts`. Extend it to:
1. Parse `### Fix Now` and `### Fix Soon` items from the action items section
2. For each item, generate a story key: `TD-{N}-{slug}` where N is auto-incremented
3. Check for duplicates: normalize both the new item text and existing TD story titles (lowercase, remove punctuation, split into words), compute word overlap percentage. If >= 80%, skip with `[INFO] Skipping duplicate: "{item}" matches existing "{existing}"`
4. Create new story entries in `sprint-state.json` under `epics['epic-TD'].stories`
5. `### Backlog` items append to `tech-debt-backlog.md` for tracking only (not active stories)

### Persistent epic-TD

In `src/modules/sprint/state.ts`, add special handling:
- `epic-TD` is auto-created when the first TD story is added
- `epic-TD.status` is always `'in-progress'` -- the epic completion logic in Step 5 must skip it
- New TD stories append to it from any source (retro, audit, manual)

Modify the epic completion check in `src/modules/sprint/selector.ts` or wherever epics are marked `done` to exclude `epic-TD`.

### Retro file location

Retro files are written to `_bmad-output/implementation-artifacts/session-retro-YYYY-MM-DD.md`. The parser reads the most recent one.

## Files to Change

- `src/lib/retro-parser.ts` — Extend to parse `### Fix Now` / `### Fix Soon` action items, generate TD story keys, deduplication logic
- `src/modules/sprint/state.ts` — Add `createTdStory()`, `ensureEpicTd()` functions. Prevent epic-TD from transitioning to `done`
- `src/modules/sprint/selector.ts` — Skip epic-TD in epic completion checks
- `src/commands/run.ts` — Add Step 8b: after retro, call retro parser and create TD stories
- `src/lib/retro-parser.ts` or new `src/lib/retro-to-sprint.ts` — Deduplication logic with 80% word overlap detection
