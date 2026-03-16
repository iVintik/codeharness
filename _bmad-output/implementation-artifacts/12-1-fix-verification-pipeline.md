# Story 12.1: Fix Verification Pipeline

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer using codeharness,
I want the verification pipeline to reject empty or fake proof documents at every layer,
so that stories marked `done` actually have real, reproducible evidence.

## Acceptance Criteria

1. **Given** a proof file with all ACs showing `PENDING` and `<!-- No evidence captured yet -->`, **when** `codeharness verify --story <id>` runs, **then** it exits 1 with `[FAIL] Proof quality check failed: 0/N ACs verified` **and** does NOT mark the story as verified. (AC:1)

2. **Given** a proof file where all ACs have `showboat exec` evidence blocks, **when** `codeharness verify --story <id>` runs, **then** it passes the proof quality check **and** proceeds to showboat verify and state update. (AC:2)

3. **Given** the verifier agent is spawned for a story, **when** it produces evidence for each AC, **then** each AC has a `showboat exec bash "..."` block running real CLI commands (e.g., `codeharness verify --retro --epic 1`, `cat .claude/codeharness.local.md | grep key`) **and** NO AC uses unit test output (`npm run test:unit`) as its primary evidence. (AC:3)

4. **Given** the verifier agent completes, **when** harness-run Step 3d checks the proof, **then** it parses the proof file and counts AC statuses **and** if any AC is PENDING, it rejects and re-spawns the verifier (up to max_retries) **and** it runs `showboat verify` in the main session and checks exit code (not agent's claim). (AC:4)

5. **Given** `--json` flag on `codeharness verify`, **when** proof quality is checked, **then** output includes `"proofQuality": {"verified": N, "pending": M, "total": K}`. (AC:5)

## Tasks / Subtasks

- [ ] Task 1: Replace `proofHasContent()` with `validateProofQuality()` in `src/lib/verify.ts` (AC: 1, 2, 5)
  - [ ] 1.1: Create `validateProofQuality(proofPath: string)` function that reads the proof file and regex-parses AC sections
  - [ ] 1.2: Count ACs by status — look for `PENDING` / `<!-- No evidence captured yet -->` markers vs `<!-- /showboat exec -->` evidence blocks
  - [ ] 1.3: Return `{ verified: number, pending: number, total: number, passed: boolean }` — `passed` is true only when `pending === 0 && verified > 0`
  - [ ] 1.4: Keep `proofHasContent()` as a deprecated alias calling `validateProofQuality().passed` for backward compatibility during transition
  - [ ] 1.5: Export `ProofQuality` type interface

- [ ] Task 2: Integrate `validateProofQuality()` into verify command (AC: 1, 2, 5)
  - [ ] 2.1: In `src/commands/verify.ts`, replace `proofHasContent(proofPath)` call with `validateProofQuality(proofPath)`
  - [ ] 2.2: If `!quality.passed`, print `[FAIL] Proof quality check failed: {verified}/{total} ACs verified` and exit 1
  - [ ] 2.3: If `quality.passed`, proceed to showboat verify and state update as before
  - [ ] 2.4: When `--json` flag is set, include `proofQuality` object in JSON output: `{ verified, pending, total }`
  - [ ] 2.5: Ensure verify does NOT mark the story as verified when proof quality fails

- [ ] Task 3: Update verifier agent prompt in harness-run (AC: 3)
  - [ ] 3.1: Edit `commands/harness-run.md` Step 3d verifier prompt to add explicit instruction: `showboat exec` is mandatory for every AC, unit test output (`npm run test:unit`) is NEVER valid as primary AC evidence
  - [ ] 3.2: Add instruction: each AC must have a real CLI command proving the feature works (e.g., `codeharness verify ...`, `cat <file> | grep <expected>`, running the actual binary)
  - [ ] 3.3: Add instruction: valid evidence examples vs invalid evidence examples (same list from Technical Notes)

- [ ] Task 4: Add proof parsing to harness-run Step 3d post-verifier check (AC: 4)
  - [ ] 4.1: In `commands/harness-run.md` Step 3d "After the verifier completes" section, add step between step 1 (confirm proof exists) and step 2 (run showboat verify): parse proof file, count AC statuses using `validateProofQuality()` logic
  - [ ] 4.2: Add instruction: if any AC is PENDING, re-spawn the verifier (up to max_retries) before proceeding
  - [ ] 4.3: Add instruction: run `codeharness verify --story {story_key} --json` and check `proofQuality.pending === 0` in output

- [ ] Task 5: Unit tests (AC: 1, 2, 4, 5)
  - [ ] 5.1: Test `validateProofQuality()` with skeleton proof (all PENDING) — expects `{ verified: 0, pending: N, total: N, passed: false }`
  - [ ] 5.2: Test `validateProofQuality()` with fully verified proof (all showboat exec blocks) — expects `{ verified: N, pending: 0, total: N, passed: true }`
  - [ ] 5.3: Test `validateProofQuality()` with mixed proof (some verified, some PENDING) — expects `passed: false`
  - [ ] 5.4: Test `validateProofQuality()` with nonexistent file — expects `{ verified: 0, pending: 0, total: 0, passed: false }`
  - [ ] 5.5: Test verify command rejects skeleton proof with exit code 1 and correct failure message
  - [ ] 5.6: Test verify command accepts fully verified proof and proceeds to showboat verify
  - [ ] 5.7: Test verify command `--json` output includes `proofQuality` object
  - [ ] 5.8: Test `proofHasContent()` still works as deprecated alias
  - [ ] 5.9: Update existing verify tests that mock `proofHasContent` to use `validateProofQuality` instead

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). The verify command owns proof quality checks — agents do not self-certify.
- **All templates are TypeScript string literals** (Architecture Decision 6).
- **Critical rule:** Unit test output is NEVER valid AC evidence. All ACs must be verified by simulating how a user or consuming system sees it — run the actual binary, check real output, inspect real file changes.

### Existing Code to Reuse

- `proofHasContent(proofPath)` in `src/lib/verify.ts:160` — current implementation checks for `<!-- /showboat exec -->` or `<!-- showboat image:` markers. Replace with `validateProofQuality()`.
- `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` from `src/lib/output.ts` — standard CLI output helpers.
- `updateSprintStatus(key, status, dir)` in `src/lib/beads-sync.ts` — for state transitions.
- `readStateWithBody(dir)` in `src/lib/verify.ts` — for reading verification state.
- `extractAcs(filePath)` in `src/lib/verify.ts` — extracts AC list from story files (may be useful for cross-referencing).

### Key File Locations

| File | Purpose |
|------|---------|
| `src/lib/verify.ts` | Replace `proofHasContent()` with `validateProofQuality()` here |
| `src/commands/verify.ts` | Integrate proof quality check into verify flow |
| `commands/harness-run.md` | Update Step 3d verifier prompt and post-verifier checks |
| `src/lib/__tests__/verify.test.ts` | Add `validateProofQuality()` tests |
| `src/commands/__tests__/verify.test.ts` | Update verify command tests |
| `src/templates/showboat-template.ts` | Reference for proof document format/markers |

### Anti-Patterns to Avoid

- Do NOT let the verifier agent self-certify — the CLI must independently validate proof quality.
- Do NOT accept unit test output as valid AC evidence. Tests prove code works; ACs prove features work for users.
- Do NOT remove `proofHasContent()` immediately — deprecate it first so any external references still work.
- Do NOT hardcode AC count expectations — parse the actual proof file dynamically.
- Do NOT trust agent claims about showboat verify results — run it in the main session.

### Project Structure Notes

- The proof document format uses showboat markers: `<!-- showboat exec ... -->` for evidence blocks and `<!-- /showboat exec -->` for closing.
- Skeleton proofs contain `<!-- No evidence captured yet -->` placeholders.
- The verify command currently only checks for the presence of showboat markers (binary check), not the quality or completeness of evidence.
- `proofHasContent()` is called at `src/commands/verify.ts:175` and is the single gate between "has evidence" and "no evidence".

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Epic 12, Story 12.1]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 8 (CLI orchestrates verification)]
- [Source: src/lib/verify.ts:160 (proofHasContent — function to replace)]
- [Source: src/commands/verify.ts:175 (proofHasContent call site)]
- [Source: commands/harness-run.md, Step 3d (verifier agent prompt and post-verifier checks)]
- [Source: src/templates/showboat-template.ts (proof document format)]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/12-1-fix-verification-pipeline.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/12-1-fix-verification-pipeline.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
