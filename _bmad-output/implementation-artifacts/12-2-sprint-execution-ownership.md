# Story 12.2: Sprint Execution Ownership

Status: verified

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using codeharness,
I want harness-run to own git commits and sprint-status updates,
so that git history is coherent and implementation artifacts are tracked.

## Acceptance Criteria

1. **Given** `_bmad-output/implementation-artifacts/` contains sprint-status.yaml, story files, and retros, **when** `git status` runs, **then** these files are trackable (not ignored by `.gitignore`). (AC:1)

2. **Given** harness-run completes a story (status -> `done`), **when** it proceeds to the next story, **then** it commits all changes with message `feat: story {key} — {short title}` **and** the commit includes source code, tests, story file, sprint-status.yaml, and proof. (AC:2)

3. **Given** a subagent (dev-story, code-review, verifier) runs, **when** it makes changes, **then** it does NOT run `git commit` or `git add` **and** it does NOT update sprint-status.yaml directly. (AC:3)

4. **Given** AGENTS.md lists all source files in a module, **when** `codeharness verify` checks staleness, **then** it passes regardless of file modification timestamps **and** it only fails if a source file exists in the directory but is not mentioned in AGENTS.md. (AC:4)

5. **Given** AGENTS.md is missing a reference to a newly added source file, **when** `codeharness verify` runs, **then** it reports `[FAIL] AGENTS.md stale for module: {module} — missing: {filename}`. (AC:5)

## Tasks / Subtasks

- [ ] Task 1: Update `.gitignore` to track implementation artifacts (AC: 1)
  - [ ] 1.1: Change `_bmad-output/` to `_bmad-output/planning-artifacts/research/` (or equivalent pattern that keeps tracking implementation artifacts)
  - [ ] 1.2: Verify that `_bmad-output/implementation-artifacts/sprint-status.yaml`, story files, and retrospective files are no longer ignored
  - [ ] 1.3: Verify that planning research artifacts (if any) remain ignored

- [ ] Task 2: Add git commit step to `commands/harness-run.md` (AC: 2)
  - [ ] 2.1: After Step 3d (story marked `done`) and before Step 4, add a commit step: stage all changes (`git add -A`), commit with message `feat: story {story_key} — {short title}`
  - [ ] 2.2: After Step 5 (epic marked `done`), add a commit step: `feat: epic {N} complete`
  - [ ] 2.3: Commit must include source code, tests, story file, sprint-status.yaml, proof document, and any other changed files
  - [ ] 2.4: If `git commit` fails (e.g., pre-commit hooks), log the error and continue — do not halt the sprint

- [ ] Task 3: Add no-commit/no-status instructions to subagent prompts in `commands/harness-run.md` (AC: 3)
  - [ ] 3.1: In Step 3a (create-story agent prompt), add: `Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.`
  - [ ] 3.2: In Step 3b (dev-story agent prompt), add: `Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.`
  - [ ] 3.3: In Step 3c (code-review agent prompt), add: `Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.`
  - [ ] 3.4: In Step 3d (verifier agent prompt), add: `Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.`
  - [ ] 3.5: In Step 5 (retrospective agent prompt), add: `Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.`

- [ ] Task 4: Refactor `isDocStale()` and `checkAgentsMdForModule()` in `src/lib/doc-health.ts` to use content completeness instead of mtime (AC: 4, 5)
  - [ ] 4.1: Create `getSourceFilesInModule(modulePath: string): string[]` — list all source files (`.ts`, `.js`, `.py`, excluding tests) in the module directory
  - [ ] 4.2: Create `getMentionedFilesInAgentsMd(agentsPath: string): string[]` — parse AGENTS.md and extract all filenames mentioned in the document
  - [ ] 4.3: Create `checkAgentsMdCompleteness(agentsPath: string, modulePath: string): { complete: boolean, missing: string[] }` — compare source files against mentioned files, return any source files not mentioned
  - [ ] 4.4: Update `checkAgentsMdForModule()` to use content completeness check instead of mtime comparison: grade is `stale` when source files are missing from AGENTS.md, `fresh` when all source files are mentioned
  - [ ] 4.5: Update the stale reason to include missing filenames: `AGENTS.md stale for module: {module} — missing: {filename}`
  - [ ] 4.6: Keep `isDocStale()` for non-AGENTS.md documents (exec-plans, generated docs) where mtime comparison is still appropriate
  - [ ] 4.7: Update `scanDocHealth()` to use the new completeness-based check for AGENTS.md files instead of mtime-based `getNewestSourceMtime()` comparison

- [ ] Task 5: Unit tests for content completeness checking (AC: 4, 5)
  - [ ] 5.1: Test `getSourceFilesInModule()` returns `.ts` and `.js` files, excludes test files and `node_modules`
  - [ ] 5.2: Test `getMentionedFilesInAgentsMd()` extracts filenames from various AGENTS.md formats (code blocks, inline code, bullet lists, tables)
  - [ ] 5.3: Test `checkAgentsMdCompleteness()` with complete AGENTS.md — expects `{ complete: true, missing: [] }`
  - [ ] 5.4: Test `checkAgentsMdCompleteness()` with AGENTS.md missing a source file — expects `{ complete: false, missing: ['missing-file.ts'] }`
  - [ ] 5.5: Test `checkAgentsMdForModule()` returns `grade: 'fresh'` when all source files are mentioned (regardless of mtime)
  - [ ] 5.6: Test `checkAgentsMdForModule()` returns `grade: 'stale'` with correct reason when files are missing
  - [ ] 5.7: Test `scanDocHealth()` uses completeness check for AGENTS.md entries
  - [ ] 5.8: Update existing `doc-health.test.ts` tests that rely on mtime-based staleness for AGENTS.md

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). Subagents do not own git or status transitions.
- **All templates are TypeScript string literals** (Architecture Decision 6).
- **Harness-run is the single source of sprint execution logic** — it owns commits, status updates, and orchestration. Subagents produce artifacts; harness-run commits them.

### Existing Code to Reuse

- `isDocStale(docPath, codeDir)` in `src/lib/doc-health.ts:139` — current mtime-based implementation to refactor for AGENTS.md.
- `checkAgentsMdForModule(modulePath, dir)` in `src/lib/doc-health.ts:198` — current mtime-based AGENTS.md check to refactor.
- `scanDocHealth(dir)` in `src/lib/doc-health.ts:267` — full scan function that needs updating.
- `findModules(dir, threshold)` in `src/lib/doc-health.ts:54` — module detection, reuse as-is.
- `getNewestSourceMtime(dir)` in `src/lib/doc-health.ts:150` — keep for non-AGENTS.md docs.
- `SOURCE_EXTENSIONS` in `src/lib/doc-health.ts:43` — `.ts`, `.js`, `.py` file extensions.
- `isTestFile(filename)` in `src/lib/doc-health.ts:123` — test file detection logic.

### Key File Locations

| File | Purpose |
|------|---------|
| `.gitignore` | Change `_bmad-output/` to narrower ignore pattern |
| `commands/harness-run.md` | Add commit steps and no-commit instructions to subagent prompts |
| `src/lib/doc-health.ts` | Refactor AGENTS.md staleness from mtime to content completeness |
| `src/lib/__tests__/doc-health.test.ts` | Add/update tests for completeness checking |
| `src/commands/__tests__/doc-health.test.ts` | Update command-level tests if affected |

### Anti-Patterns to Avoid

- Do NOT let subagents run `git commit` or `git add` — harness-run owns all git operations.
- Do NOT let subagents update sprint-status.yaml — harness-run owns status transitions.
- Do NOT use mtime comparison for AGENTS.md staleness — it causes false positives when files are rebuilt without content changes.
- Do NOT remove mtime checking entirely — it's still appropriate for exec-plans and generated docs.
- Do NOT change the `DocHealthResult` interface shape — keep backward compatibility with existing consumers.

### Project Structure Notes

- `.gitignore` currently ignores all of `_bmad-output/`. This means implementation artifacts (sprint-status.yaml, story files, retro files) are never committed, which breaks story traceability.
- `commands/harness-run.md` currently has no git commit logic — subagents may or may not commit, leading to inconsistent git history.
- `src/lib/doc-health.ts` uses `isDocStale()` which compares mtimes of AGENTS.md vs source files. This produces false staleness when source files are rebuilt or touched without content changes. The fix is to check whether all source filenames appear somewhere in the AGENTS.md content.

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Epic 12, Story 12.2]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 8 (CLI orchestrates verification)]
- [Source: src/lib/doc-health.ts:139 (isDocStale — mtime-based, to refactor)]
- [Source: src/lib/doc-health.ts:198 (checkAgentsMdForModule — mtime-based, to refactor)]
- [Source: commands/harness-run.md (subagent prompts — add no-commit instructions)]
- [Source: .gitignore (change _bmad-output/ to narrower pattern)]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/12-2-sprint-execution-ownership.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/12-2-sprint-execution-ownership.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
