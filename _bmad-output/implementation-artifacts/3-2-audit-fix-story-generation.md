# Story 3.2: Audit Fix Story Generation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want `codeharness audit --fix` to generate stories for every gap,
so that compliance issues become actionable work.

## Acceptance Criteria

1. **Given** audit found N gaps across dimensions, **When** `--fix` is passed, **Then** N fix stories are generated as markdown files in `_bmad-output/implementation-artifacts/`, each with a user story, Given/When/Then ACs referencing the specific gap, and a suggested fix section. <!-- verification: cli-verifiable -->
2. **Given** generated fix stories, **When** saved, **Then** each story is also added to `sprint-state.json` as a backlog story entry (key matching the story filename), with `status: 'backlog'`, `attempts: 0`, and sprint counts recomputed. <!-- verification: cli-verifiable -->
3. **Given** a gap about missing logging in a specific file (e.g., `src/lib/docker.ts`), **When** the story is generated, **Then** the AC text references the specific file path and gap description from the audit dimension result. <!-- verification: cli-verifiable -->
4. **Given** `--fix` is passed but audit found 0 gaps, **When** the command runs, **Then** it prints `[OK] No gaps found -- nothing to fix` and generates no story files. <!-- verification: cli-verifiable -->
5. **Given** `--fix` is passed with `--json`, **When** the command runs, **Then** JSON output includes a `fixStories` array with `{ key, filePath, gap }` for each generated story, alongside the normal audit result. <!-- verification: cli-verifiable -->
6. **Given** a story file already exists at the target path for a gap, **When** `--fix` runs again, **Then** it skips that gap and reports it as already tracked, avoiding duplicate story generation. <!-- verification: cli-verifiable -->
7. **Given** `--fix` generates stories, **When** the stories are written, **Then** each story follows BMAD format: markdown with `# Story` header, `Status: backlog`, user story, numbered ACs with Given/When/Then, Dev Notes section referencing the audit gap. <!-- verification: cli-verifiable -->
8. **Given** `--fix` writes to `sprint-state.json`, **When** writing, **Then** it uses the atomic write pattern (write to temp file, rename) via the existing `writeStateAtomic()` function from `src/modules/sprint/state.ts`. <!-- verification: cli-verifiable -->
9. **Given** `sprint-state.json` does not exist, **When** `--fix` writes stories to state, **Then** it creates a new state with `defaultState()` and adds the backlog stories -- no crash on missing state file. <!-- verification: cli-verifiable -->
10. **Given** `--fix` is run as part of `codeharness audit --fix` (full audit flow), **When** the harness is not initialized, **Then** it exits with `[FAIL] Harness not initialized -- run codeharness init first` -- same precondition as `audit` without `--fix`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Define fix story types in `src/modules/audit/fix-types.ts` (AC: #1, #7)
  - [x] 1.1: Define `FixStoryResult` interface: `{ key: string; filePath: string; gap: AuditGap; skipped: boolean; skipReason?: string; }`
  - [x] 1.2: Define `FixGenerationResult` interface: `{ stories: FixStoryResult[]; created: number; skipped: number; }`

- [x] Task 2: Implement fix story generator in `src/modules/audit/fix-generator.ts` (AC: #1, #3, #6, #7)
  - [x] 2.1: `generateFixStories(auditResult: AuditResult): Result<FixGenerationResult>` -- iterates all gaps from all dimensions, generates a story file for each.
  - [x] 2.2: `buildStoryKey(gap: AuditGap, index: number): string` -- generates a deterministic key from dimension + gap description hash (e.g., `audit-fix-observability-1`).
  - [x] 2.3: `buildStoryMarkdown(gap: AuditGap, key: string): string` -- renders BMAD-format markdown with user story, Given/When/Then AC referencing the specific file/function, Dev Notes with audit gap details.
  - [x] 2.4: Skip generation if file already exists at target path (AC #6). Return `skipped: true` with reason.
  - [x] 2.5: Write story file to `_bmad-output/implementation-artifacts/{key}.md`.

- [x] Task 3: Implement sprint state integration in `src/modules/audit/fix-generator.ts` (AC: #2, #8, #9)
  - [x] 3.1: `addFixStoriesToState(stories: FixStoryResult[]): Result<void>` -- reads current sprint state (or creates default), adds each non-skipped story as a backlog entry, recomputes sprint counts, writes atomically.
  - [x] 3.2: Use `getSprintState()`, `computeSprintCounts()`, `writeStateAtomic()` from `src/modules/sprint/state.ts`.
  - [x] 3.3: Handle missing sprint-state.json by using `defaultState()` (AC #9).

- [x] Task 4: Wire `--fix` flag into CLI command in `src/commands/audit.ts` (AC: #4, #5, #10)
  - [x] 4.1: Add `--fix` option to the audit command registration.
  - [x] 4.2: After `runAudit()`, if `--fix` is passed and gaps > 0, call `generateFixStories(result.data)` then `addFixStoriesToState(fixResult.stories)`.
  - [x] 4.3: If `--fix` and gaps == 0, print `[OK] No gaps found -- nothing to fix` (AC #4).
  - [x] 4.4: If `--json` and `--fix`, include `fixStories` array in JSON output (AC #5).

- [x] Task 5: Re-export from barrel `src/modules/audit/index.ts` (AC: all)
  - [x] 5.1: Export `generateFixStories`, `addFixStoriesToState` from barrel.
  - [x] 5.2: Export `FixStoryResult`, `FixGenerationResult` types from barrel.

- [x] Task 6: Write unit tests (AC: all)
  - [x] 6.1: Create `src/modules/audit/__tests__/fix-generator.test.ts`:
    - Test `generateFixStories` with 0 gaps returns empty result (AC #4)
    - Test `generateFixStories` with 3 gaps creates 3 story files
    - Test generated story contains specific file path from gap description (AC #3)
    - Test generated story follows BMAD format with Given/When/Then (AC #7)
    - Test story key is deterministic (same gap produces same key)
    - Test skips existing story files and returns `skipped: true` (AC #6)
    - Test `addFixStoriesToState` adds stories to sprint-state.json as backlog (AC #2)
    - Test `addFixStoriesToState` creates default state when file missing (AC #9)
    - Test `addFixStoriesToState` uses atomic write (AC #8)
    - Test `addFixStoriesToState` recomputes sprint counts
  - [x] 6.2: Update `src/commands/__tests__/audit.test.ts`:
    - Test `--fix` option registered
    - Test `--fix` calls `generateFixStories` when gaps found
    - Test `--fix` prints OK message when no gaps
    - Test `--fix --json` includes `fixStories` in output
    - Test `--fix` blocked by precondition check (AC #10)
  - [x] 6.3: Mock all I/O: filesystem (writeFileSync, existsSync, readFileSync), sprint state module
  - [x] 6.4: Target 100% coverage on new files

- [x] Task 7: Integration verification (AC: all)
  - [x] 7.1: `npm run build` -- verify tsup compiles new files
  - [x] 7.2: `npm run test:unit` -- all tests pass, no regressions
  - [x] 7.3: Verify module boundaries: only barrel `index.ts` exports public API
  - [x] 7.4: Verify no file exceeds 300 lines (NFR9)
  - [x] 7.5: Verify `codeharness audit --fix` runs end-to-end and produces story files

## Dev Notes

### Architecture References

This story implements FR15 (`audit --fix` generates stories for gaps) and NFR6 (generated stories follow BMAD format). It extends the audit coordinator from Story 3.1 with the `generateFixStories()` function called out in Architecture Decision 4.

### Key Implementation Details

**Generator pattern:** `generateFixStories()` takes an `AuditResult` (from `runAudit()`), iterates all `gaps` across all `dimensions`, and produces a markdown story file for each gap. This follows the existing `createFixStory()` pattern from `src/modules/verify/validation-runner.ts` but adapted for audit gaps instead of validation ACs.

**Story key generation:** Each gap needs a deterministic, unique key. Use format: `audit-fix-{dimension}-{index}` where index is a sequential counter within the dimension. The key must be filesystem-safe and unique across runs.

**BMAD format (NFR6):** Generated stories must follow the template:
```markdown
# Fix: {dimension} — {description}

Status: backlog

## Story

As an operator, I need {gap description} fixed so that audit compliance improves.

## Acceptance Criteria

1. **Given** {gap context}, **When** the fix is applied, **Then** {expected outcome from suggestedFix}.

## Dev Notes

This is an auto-generated fix story created by `codeharness audit --fix`.
**Audit Gap:** {dimension}: {description}
**Suggested Fix:** {suggestedFix}
```

**Sprint state integration (AC #2):** Use the existing `getSprintState()` / `writeStateAtomic()` / `computeSprintCounts()` functions from `src/modules/sprint/state.ts`. Read current state, add each new story key with `status: 'backlog'`, recompute counts, write atomically. Do NOT import from internal sprint module files — use barrel exports only.

**Idempotency (AC #6):** Before writing a story file, check if it already exists. If so, skip and report. This prevents duplicate stories on re-runs of `audit --fix`.

**No-gaps path (AC #4):** When audit finds 0 gaps, `--fix` should print a success message and exit cleanly — no files created, no state modified.

**JSON output (AC #5):** When `--json` and `--fix` are combined, the output includes both the audit result and the fix story list. The `fixStories` array contains `{ key, filePath, gap }` for each generated story (including skipped ones with a `skipped: true` flag).

### Existing Code to Reuse

- `src/modules/audit/index.ts` — `runAudit()` returns `AuditResult` with `dimensions` containing `gaps: AuditGap[]`
- `src/modules/audit/types.ts` — `AuditResult`, `AuditGap`, `DimensionResult` types
- `src/modules/verify/validation-runner.ts` — `createFixStory()` as reference pattern for file writing
- `src/modules/sprint/state.ts` — `getSprintState()`, `writeStateAtomic()`, `computeSprintCounts()`, `defaultState()`
- `src/types/state.ts` — `SprintState`, `StoryState`, `StoryStatus`
- `src/lib/output.ts` — `ok()`, `fail()`, `info()`, `jsonOutput()` for output formatting
- `src/types/result.ts` — `Result<T>`, `ok()`, `fail()` for return types

### What This Story Does NOT Include

- No `onboard` alias — that's Story 3.3
- No interactive approval prompt — `--fix` generates and writes immediately (unlike `onboard epic` which prompts)
- No beads import — generated stories go to sprint-state.json only, not beads (beads integration is an existing pattern in onboard but out of scope here)
- No re-running of audit — `--fix` operates on the audit result already computed in the same command invocation
- No story prioritization or ordering — stories are generated in gap iteration order

### Dependencies

- **Depends on:** Story 3.1 (audit coordinator, `runAudit()`, `AuditResult`) — DONE
- **Depended on by:** Story 3.3 (onboard alias, must support `--fix` flag forwarding)

### File Size Constraint

Each new file must be under 300 lines per NFR9.
- `src/modules/audit/fix-types.ts` — ~20-30 lines
- `src/modules/audit/fix-generator.ts` — ~120-160 lines (generator + state integration)
- `src/commands/audit.ts` — ~90-100 lines (extended with --fix logic, up from 66)
- `src/modules/audit/__tests__/fix-generator.test.ts` — ~200-250 lines

### Previous Story Intelligence (Story 3.1)

- **`runAudit()` returns `Result<AuditResult>`** with `dimensions: Record<string, DimensionResult>`, each containing `gaps: AuditGap[]` with `{ dimension, description, suggestedFix }`.
- **`AuditGap.description` contains file paths** when applicable (e.g., `src/lib/docker.ts:42 — Missing error logging`). The fix story generator should preserve these references verbatim in ACs (AC #3).
- **Barrel imports only.** Import from `../audit/index.js` or `../sprint/state.js`, never internal files.
- **Mock all I/O in tests.** Filesystem, sprint state reads/writes all mocked.
- **Atomic write pattern** for sprint-state.json (read-modify-write with temp+rename via `writeStateAtomic()`).
- **`dimensions.ts` is 197 lines, `index.ts` is 85 lines.** Both well under NFR9 limit. New fix-generator.ts should also stay under 300.
- **`audit.ts` command is 66 lines.** Adding `--fix` will extend it but should stay under 300 if logic is delegated to fix-generator.
- **57 existing audit tests** across 4 files. New tests should not regress these.

### Git Intelligence

Recent commits show story 3.1 completed. The project uses:
- Commander for CLI commands (`--fix` added as `.option('--fix', '...')`)
- `Result<T>` discriminated union for error handling
- tsup for building
- Vitest for testing (2779+ tests as of story 3.1)
- Barrel exports (`index.ts`) for module boundaries
- Atomic writes for state file modifications

### References

- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 4] — `generateFixStories()` function signature
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 3.2] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#FR15] — `audit --fix` generates stories for gaps
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#NFR6] — Generated stories follow BMAD format
- [Source: src/modules/audit/types.ts] — AuditResult, AuditGap, DimensionResult types
- [Source: src/modules/audit/index.ts] — runAudit() barrel export
- [Source: src/modules/verify/validation-runner.ts#createFixStory] — Reference pattern for fix story file writing
- [Source: src/modules/sprint/state.ts] — getSprintState(), writeStateAtomic(), computeSprintCounts()
- [Source: src/commands/audit.ts] — Existing audit command to extend with --fix

### Project Structure Notes

- New files: `src/modules/audit/fix-types.ts`, `src/modules/audit/fix-generator.ts`, `src/modules/audit/__tests__/fix-generator.test.ts`
- Modified files: `src/commands/audit.ts` (add --fix option), `src/modules/audit/index.ts` (add barrel exports)
- No patches created in this story
- Module follows existing conventions: barrel exports, Result<T> returns, <300 line files

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-2-audit-fix-story-generation.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/audit/AGENTS.md)
- [ ] Exec-plan created in `docs/exec-plans/active/3-2-audit-fix-story-generation.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] All I/O mocked (filesystem, subprocess, HTTP)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
