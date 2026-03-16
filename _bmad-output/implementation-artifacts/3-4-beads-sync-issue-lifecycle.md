# Story 3.4: Beads Sync & Issue Lifecycle

Status: ready-for-dev

## Story

As a developer,
I want beads status and story file status to stay in sync,
So that I have a single source of truth regardless of whether I check beads or story files.

## Acceptance Criteria

1. **Given** Ralph completes a story and calls `bd close <id>`, **When** the close is processed by the CLI, **Then** the linked story file status is also updated to "done", **And** both beads and story file reflect the same state.

2. **Given** a story's status changes in beads (e.g., `bd update <id> --status in_progress`), **When** the CLI processes the update, **Then** the linked story file status is updated to match, **And** sync is bidirectional: story file status changes also update beads.

3. **Given** `codeharness onboard` generates findings, **When** findings are created, **Then** they are imported as beads issues with `type=task` and priority from severity, **And** each issue links to the relevant finding details.

4. **Given** sprint planning workflow runs, **When** the team triages the backlog, **Then** `bd ready` shows the next unblocked tasks in priority order, **And** the sprint-beads patch integrates this into the BMAD sprint planning workflow.

## Tasks / Subtasks

- [ ] Task 1: Implement beads-to-story-file sync functions in `src/lib/beads-sync.ts` (AC: #1, #2)
  - [ ] 1.1: Define `SyncResult` interface: `{ storyKey: string, beadsId: string, previousStatus: string, newStatus: string, synced: boolean, error?: string }`
  - [ ] 1.2: Define status mapping between beads statuses and story file statuses (beads `open` -> story `ready-for-dev` or `in-progress`, beads `closed` -> story `done`, story `backlog` -> beads issue not yet created or `open`, story `done` -> beads `closed`)
  - [ ] 1.3: Implement `resolveStoryFilePath(beadsIssue: BeadsIssue): string | null` — extract story file path from beads issue description field (set by bridge in Story 3.3). Return null if description doesn't contain a valid path.
  - [ ] 1.4: Implement `readStoryFileStatus(filePath: string): string | null` — read the `Status:` line from a story markdown file (second line, format: `Status: <status>`). Return null if file doesn't exist or has no Status line.
  - [ ] 1.5: Implement `updateStoryFileStatus(filePath: string, newStatus: string): void` — update the `Status:` line in a story markdown file in-place. If no `Status:` line exists, insert one after the title line. Use `readFileSync`/`writeFileSync` — no external dependencies.
  - [ ] 1.6: Implement `syncBeadsToStoryFile(beadsId: string): SyncResult` — read beads issue status, resolve story file path from description, read story file status, update story file if statuses differ. Translate beads statuses to story file statuses using the mapping from 1.2.
  - [ ] 1.7: Implement `syncStoryFileToBeads(storyKey: string): SyncResult` — read story file status, find matching beads issue (by description path containing story key), update beads issue status if statuses differ. Translate story file statuses to beads statuses.

- [ ] Task 2: Implement `syncClose` wrapper in `src/lib/beads-sync.ts` (AC: #1)
  - [ ] 2.1: Implement `syncClose(beadsId: string): SyncResult` — calls `closeIssue(beadsId)` from `beads.ts`, then updates the linked story file status to `done`. This is the primary path used by Ralph/sprint execution when completing a story.
  - [ ] 2.2: Handle missing story file gracefully — if story file path not found in beads description or file doesn't exist, log warning and return result with `synced: false` and error message.
  - [ ] 2.3: Handle already-closed issues — if beads issue is already closed, still update story file to `done` (idempotent).

- [ ] Task 3: Implement `syncAll` bulk sync function in `src/lib/beads-sync.ts` (AC: #2)
  - [ ] 3.1: Implement `syncAll(direction: 'beads-to-files' | 'files-to-beads' | 'bidirectional'): SyncResult[]` — iterate all beads issues via `listIssues()`, sync each one in the specified direction. For `bidirectional`, beads is the source of truth (beads status wins on conflict).
  - [ ] 3.2: Handle bulk operations efficiently — single call to `listIssues()` up front, batch file reads.
  - [ ] 3.3: Return per-issue results array for reporting.

- [ ] Task 4: Add `codeharness sync` CLI subcommand in `src/commands/sync.ts` (AC: #1, #2)
  - [ ] 4.1: Create `src/commands/sync.ts` with Commander.js command accepting `--direction <dir>` (optional, default `bidirectional`), `--story <key>` (optional, sync single story), and global `--json` flag.
  - [ ] 4.2: If `--story` provided, sync only that story. Otherwise, run `syncAll` with the specified direction.
  - [ ] 4.3: Print per-story sync results: `[OK] <story-key>: <old-status> → <new-status>` or `[INFO] <story-key>: already in sync (<status>)`.
  - [ ] 4.4: Print summary: `[OK] Sync: <N> stories synced, <M> already in sync, <K> errors`.
  - [ ] 4.5: For `--json`, output a `SyncCommandResult` JSON object: `{ status: 'ok' | 'fail', synced: number, already_in_sync: number, errors: number, results: SyncResult[] }`.
  - [ ] 4.6: Register the command in `src/index.ts`.

- [ ] Task 5: Integrate sync into existing beads operations (AC: #1)
  - [ ] 5.1: In `src/lib/beads.ts`, add an optional `sync` parameter to `closeIssue()` — when `sync: true`, call `syncClose()` from beads-sync.ts after closing. Default to `false` to maintain backward compatibility.
  - [ ] 5.2: In `src/lib/beads.ts`, add an optional `sync` parameter to `updateIssue()` — when `sync: true`, call `syncBeadsToStoryFile()` after updating. Default to `false`.
  - [ ] 5.3: Alternatively, keep beads.ts unchanged and document that callers (Ralph, sprint execution skill, verify command) should call sync functions explicitly after beads operations. Choose the approach that is simpler and avoids circular dependencies.

- [ ] Task 6: Implement sprint-status.yaml awareness (AC: #4)
  - [ ] 6.1: Implement `readSprintStatus(dir?: string): Record<string, string>` in `src/lib/beads-sync.ts` — parse `_bmad-output/implementation-artifacts/sprint-status.yaml` to read the `development_status` map.
  - [ ] 6.2: Implement `updateSprintStatus(storyKey: string, newStatus: string, dir?: string): void` — update a single story's status in sprint-status.yaml while preserving structure and comments.
  - [ ] 6.3: When `syncClose()` or `syncBeadsToStoryFile()` updates a story file to `done`, also update sprint-status.yaml if the story key exists there.
  - [ ] 6.4: Handle missing sprint-status.yaml gracefully — log warning, skip update.

- [ ] Task 7: Write unit tests for beads-sync module (AC: #1, #2)
  - [ ] 7.1: Create `src/lib/__tests__/beads-sync.test.ts`
  - [ ] 7.2: Test `resolveStoryFilePath()` — extracts path from beads issue description, returns null for invalid descriptions
  - [ ] 7.3: Test `readStoryFileStatus()` — reads Status line from markdown, handles missing file, handles no Status line
  - [ ] 7.4: Test `updateStoryFileStatus()` — updates existing Status line, inserts Status line if missing, preserves rest of file content
  - [ ] 7.5: Test `syncBeadsToStoryFile()` — updates story file when statuses differ, skips when in sync, handles missing file gracefully
  - [ ] 7.6: Test `syncStoryFileToBeads()` — updates beads when statuses differ, skips when in sync
  - [ ] 7.7: Test `syncClose()` — closes beads issue and updates story file to done, handles missing file
  - [ ] 7.8: Test `syncAll()` — syncs multiple issues, returns correct counts, handles errors per-issue without aborting
  - [ ] 7.9: Test status mapping — beads `open` <-> story `in-progress`, beads `closed` <-> story `done`
  - [ ] 7.10: Mock beads.ts functions (`closeIssue`, `updateIssue`, `listIssues`) and file system operations

- [ ] Task 8: Write unit tests for sync command (AC: #1, #2)
  - [ ] 8.1: Create `src/commands/__tests__/sync.test.ts`
  - [ ] 8.2: Test sync command with `--story <key>` — syncs single story
  - [ ] 8.3: Test sync command without options — runs bidirectional sync on all stories
  - [ ] 8.4: Test sync command with `--direction beads-to-files` — syncs only in one direction
  - [ ] 8.5: Test sync command `--json` output structure
  - [ ] 8.6: Test sync command handles errors gracefully (beads unavailable, file system errors)

- [ ] Task 9: Build and verify (AC: #1, #2, #3, #4)
  - [ ] 9.1: Run `npm run build` — verify tsup compiles successfully with new beads-sync.ts and sync.ts
  - [ ] 9.2: Run `npm run test:unit` — all tests pass including new sync tests
  - [ ] 9.3: Run `npm run test:coverage` — verify 100% coverage for new sync code, maintain overall coverage
  - [ ] 9.4: Manual test: create a test beads issue with description pointing to a story file, run `codeharness sync --story <key>`, verify story file status updates
  - [ ] 9.5: Manual test: `codeharness sync --json` — verify JSON output structure
  - [ ] 9.6: Manual test: `codeharness sync --direction beads-to-files` — verify one-directional sync

## Dev Notes

### This Story Completes Epic 3's Beads Integration

Stories 3.1-3.3 established the foundation: beads CLI wrapper (`src/lib/beads.ts`), BMAD patching (`src/lib/bmad.ts`, `src/lib/patch-engine.ts`), and the bridge command that imports BMAD stories into beads with links to story files. This story closes the loop by maintaining sync between beads issue status and story file status throughout the development lifecycle.

### What Already Exists (from Epics 1-3.3)

- `src/lib/beads.ts` — Full beads CLI wrapper: `createIssue()`, `getReady()`, `closeIssue()`, `updateIssue()`, `listIssues()`, `initBeads()`, `detectBeadsHooks()`, `configureHookCoexistence()`. The sync module extends this by adding story-file-aware wrappers.
- `src/lib/bmad.ts` — BMAD install/patch engine plus epics parser with `ParsedStory`, `ParsedEpic`, `getStoryFilePath()`, `parseEpicsFile()`, `importStoriesToBeads()`. The sync module uses `getStoryFilePath()` for path resolution.
- `src/commands/bridge.ts` — Full bridge command. Creates beads issues with description = story file path. This is the link that sync relies on.
- `src/lib/state.ts` — State file read/write with YAML frontmatter parsing. The sync module uses a similar pattern for reading story file status from markdown.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` utilities.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Sprint status tracking file with story keys and statuses. The sync module can update this.

### Architecture Decisions That Apply

- **Decision 3 (Beads Integration):** Two-layer model: beads = status/ordering, story files = content. This story implements the sync mechanism that keeps these two layers consistent. "When Ralph completes a story: CLI runs `bd close <id>` AND updates story file status."
- **Decision 1 (CLI ↔ Plugin Boundary):** Sync is CLI-only. The plugin does not read/write story files or beads directly.
- **FR38:** "System can maintain bidirectional sync between beads issue status and story file status."

### Status Mapping

Beads has a simpler status model than story files. The mapping:

| Beads Status | Story File Status | Notes |
|-------------|-------------------|-------|
| `open` | `ready-for-dev` or `in-progress` | Beads doesn't distinguish pre/during work |
| `closed` | `done` | Clear 1:1 mapping |

When syncing beads → story file: `open` maps to `in-progress` (assumes work has started if beads issue exists). When syncing story file → beads: `backlog` and `ready-for-dev` map to `open`, `in-progress` maps to `open`, `review` maps to `open`, `done` maps to `closed`.

### Story File Format

Story files follow the format established in Stories 3.1-3.3:

```markdown
# Story N.M: Title

Status: ready-for-dev

## Story
...
```

The `Status:` line is always the second non-empty line, after the `# Story` title. The sync module reads and writes this line.

### Sprint-Status.yaml Integration

The sprint-status.yaml file at `_bmad-output/implementation-artifacts/sprint-status.yaml` tracks all story statuses in a flat YAML map. When beads sync updates a story file to a new status, it should also update the corresponding entry in sprint-status.yaml if the story key exists there. This keeps three data stores consistent: beads, story files, sprint-status.yaml.

Use the `yaml` package (already a project dependency via `src/lib/state.ts`) for reading/writing sprint-status.yaml.

### Circular Dependency Avoidance

The sync module (`beads-sync.ts`) imports from `beads.ts` but NOT vice versa. To avoid circular dependencies:
- `beads.ts` stays unchanged — it does not import from `beads-sync.ts`
- Callers that want sync behavior call `beads-sync.ts` functions directly
- The sync command (`src/commands/sync.ts`) imports from both `beads.ts` and `beads-sync.ts`

### Onboard Findings Integration (AC #3)

AC #3 mentions onboard findings imported as beads issues. The actual implementation of `codeharness onboard` is in Epic 6. For this story, the sync module's `syncAll()` function should handle issues of any type (story, task, bug) — not just stories. This way, when onboard creates task-type issues in Epic 6, the sync mechanism already handles them.

### What NOT To Do

- **Do NOT modify `src/lib/beads.ts` API** — keep the existing wrapper unchanged. Add sync-aware functions in the new `beads-sync.ts` module.
- **Do NOT implement the `codeharness onboard` command** — that's Epic 6. Only ensure sync handles non-story issue types.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT introduce external dependencies** — use Node.js built-ins and the existing `yaml` package.

### Scope Boundaries

**IN SCOPE (this story):**
- New module `src/lib/beads-sync.ts` with sync functions
- New command `src/commands/sync.ts` for the `codeharness sync` CLI subcommand
- Registration of sync command in `src/index.ts`
- Sprint-status.yaml read/update functions
- Unit tests for sync module and sync command
- Status mapping between beads and story file statuses

**OUT OF SCOPE (later stories):**
- Verification pipeline — Epic 4
- Hook enforcement — Epic 4 (Story 4.2)
- Ralph/sprint execution integration — Epic 5 (callers of sync functions)
- Onboard command — Epic 6 (creates issues that sync handles)
- Status command with beads summary — Epic 7

### Dependencies

- **Depends on:** Story 3.1 (beads CLI wrapper — `closeIssue`, `updateIssue`, `listIssues`) — DONE. Story 3.3 (bridge creates beads issues with story file paths in description) — DONE.
- **Depended on by:** Story 5.1 (Ralph loop calls `syncClose` after story completion), Story 4.2 (hooks may trigger sync), Story 7.1 (status command reads sync state).

### New npm Dependencies

None. Uses Node.js built-ins (`fs`, `path`) and the existing `yaml` package.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 3 (Beads Integration), Beads Interaction Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR38 (bidirectional sync)]
- [Source: src/lib/beads.ts — closeIssue(), updateIssue(), listIssues() API]
- [Source: src/lib/bmad.ts — getStoryFilePath()]
- [Source: src/lib/state.ts — YAML frontmatter parsing pattern]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-4-beads-sync-issue-lifecycle.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib module — beads-sync.ts, src/commands — sync.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/3-4-beads-sync-issue-lifecycle.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
