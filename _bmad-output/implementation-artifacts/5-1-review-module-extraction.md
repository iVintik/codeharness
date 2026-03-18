# Story 5.1: Review Module Extraction

Status: verifying

## Story

As a developer,
I want code review extracted into `src/modules/review/`,
so that review is isolated and failures don't crash sprint execution.

## Acceptance Criteria

1. **Given** `reviewStory(key)` is called with a valid story key, **When** the BMAD code-review workflow completes successfully, **Then** it returns `Result<ReviewResult>` with `approved: true`, the story key, and any review comments. <!-- verification: cli-verifiable -->
2. **Given** `reviewStory(key)` is called and the code-review workflow fails (non-zero exit, crash, missing file), **When** the error is caught, **Then** it returns a `Result` with `success: false` and a descriptive error message — it never throws an uncaught exception. <!-- verification: cli-verifiable -->
3. **Given** `reviewStory(key)` is called and the code-review workflow returns findings that require changes (review rejects the story), **When** the result is processed by the sprint loop, **Then** the story status transitions back to `in-progress` with the review findings attached so the dev module can address them. <!-- verification: integration-required -->
4. **Given** the review module boundary, **When** any file outside `src/modules/review/` imports from the review module, **Then** it imports only from `review/index.ts` — no imports from internal files like `orchestrator.ts` or `types.ts`. <!-- verification: cli-verifiable -->
5. **Given** `reviewStory(key)` is called and the code-review workflow times out, **When** the timeout is detected, **Then** it returns `fail()` with a timeout-specific error message including the story key and elapsed duration, and preserves any partial output. <!-- verification: cli-verifiable -->
6. **Given** `src/modules/review/orchestrator.ts` exists, **When** it invokes the BMAD code-review workflow, **Then** it uses `claude --print` with the code-review workflow instruction, a configurable timeout, and captures stdout/stderr. <!-- verification: cli-verifiable -->
7. **Given** the review module files (`index.ts`, `orchestrator.ts`, `types.ts`), **When** line counts are measured, **Then** no file exceeds 300 lines (NFR18). <!-- verification: cli-verifiable -->
8. **Given** the `ReviewResult` type, **When** inspected, **Then** it includes `key: string`, `approved: boolean`, `comments: string[]`, `duration: number`, and `output: string` fields. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Update `src/modules/review/types.ts` (AC: #8)
  - [x] Add `duration: number` field (milliseconds elapsed during review)
  - [x] Add `output: string` field (captured stdout/stderr summary, truncated)
- [x] Task 2: Create `src/modules/review/orchestrator.ts` (AC: #2, #5, #6)
  - [x] Implement `invokeBmadCodeReview(key: string, opts?: { timeoutMs?: number }): Result<ReviewResult>`
  - [x] Use `execFileSync('claude', ['--print', ...])` with configurable timeout (default 25 min)
  - [x] Capture stdout/stderr, truncate to last 200 lines
  - [x] Detect timeout (killed/SIGTERM) and return `fail()` with timeout details
  - [x] Detect non-zero exit and return `fail()` with error details
  - [x] Parse review output to determine `approved` status (look for rejection/change-request signals)
  - [x] Capture files changed via git diff after review
  - [x] Wrap all logic in try/catch — never throw
- [x] Task 3: Update `src/modules/review/index.ts` (AC: #1, #4)
  - [x] Import `invokeBmadCodeReview` from `./orchestrator.js`
  - [x] Replace `reviewStory()` stub with real delegation to orchestrator
  - [x] Accept optional `opts?: { timeoutMs?: number }` parameter
- [x] Task 4: Write unit tests in `src/modules/review/__tests__/orchestrator.test.ts` (AC: #1, #2, #5, #6)
  - [x] Test successful review returns `ok(ReviewResult)` with correct fields
  - [x] Test failed review returns `fail()` with error — never throws
  - [x] Test timeout returns `fail()` with timeout-specific message
  - [x] Test custom timeout passed through to execFileSync
  - [x] Test output truncation to last 200 lines
  - [x] Test git failure handled gracefully (empty filesChanged)
  - [x] Test all code paths return `Result<T>` — never throw
- [x] Task 5: Update `src/modules/review/__tests__/index.test.ts` (AC: #1, #4)
  - [x] Update tests to verify `reviewStory()` no longer returns `fail('not implemented')`
  - [x] Test delegation to orchestrator
- [x] Task 6: Verify import boundary test passes (AC: #4)
- [x] Task 7: Verify build (`npm run build`) succeeds
- [x] Task 8: Verify all existing tests pass (`npm test`)
- [x] Task 9: Verify no file exceeds 300 lines (AC: #7, NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — `orchestrator.ts` is internal to review module. Only `index.ts` is the public interface.

### Pattern to Follow: Dev Module

This story follows the exact same pattern as story 3-2 (Graceful Dev Module). The dev module has:
- `index.ts` — thin public interface, delegates to orchestrator
- `orchestrator.ts` — invokes `claude --print` with BMAD workflow, handles timeout/error/success
- `types.ts` — typed result interface
- `__tests__/orchestrator.test.ts` — mocks `child_process`, tests all paths

The review module should mirror this structure, substituting the code-review workflow for the dev-story workflow.

### BMAD Code-Review Workflow

The review workflow is at: `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml`
The patch target for review enforcement is `review-enforcement` in `src/lib/bmad.ts`.

The `claude --print` invocation should reference the code-review workflow:
```
claude --print "Run the BMAD code-review workflow for story at _bmad-output/implementation-artifacts/${key}.md — review all changes, check quality, and provide findings."
```

### ReviewResult Type (Updated)

```typescript
export interface ReviewResult {
  readonly key: string;
  readonly approved: boolean;
  readonly comments: string[];
  readonly duration: number;
  readonly output: string;
}
```

### Review Module Structure After This Story

```
src/modules/review/
├── index.ts              # Re-exports: reviewStory (real implementation)
├── orchestrator.ts       # NEW: invokeBmadCodeReview()
├── types.ts              # ReviewResult (updated with duration, output)
└── __tests__/
    ├── index.test.ts     # Updated
    └── orchestrator.test.ts  # NEW
```

### Dependencies

- **Epic 1 (done):** Result<T> types, module skeleton with index.ts pattern
- **Story 3.2 (done):** Dev module orchestrator pattern to follow
- **No external dependencies needed.** Uses `child_process` to invoke `claude --print`.

### Review → Dev Feedback Loop (AC #3)

AC #3 covers the integration between review returning findings and dev re-processing. The actual sprint loop logic that transitions story status back to `in-progress` and re-triggers dev lives in the sprint module (ralph/sprint loop). This story provides the `ReviewResult` with `approved: false` and `comments` — the sprint loop is responsible for acting on it.

This AC is tagged `integration-required` because it requires the sprint loop to be running and processing review results end-to-end.

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 5.1]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md — review module]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR21, FR22, FR23]
- [Source: src/modules/dev/orchestrator.ts — pattern to follow]
- [Source: src/lib/bmad.ts — PATCH_TARGETS.review-enforcement]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/5-1-review-module-extraction.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/5-1-review-module-extraction.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
