# Story 4.2: Project-Agnostic Verification

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want verification to never refuse a project type,
so that all projects get verified regardless of their stack (CLI, plugin, library, web app, API).

## Acceptance Criteria

1. **Given** a CLI project (Node.js with `dist/` directory), **When** `buildVerifyImage()` is called, **Then** it builds a Docker image using `npm pack` and the Node.js Dockerfile template, returning `Result<BuildResult>` with `success: true`. <!-- verification: cli-verifiable -->

2. **Given** a Claude Code plugin project (no `dist/`, has `.claude-plugin/plugin.json`), **When** `buildVerifyImage()` is called, **Then** it builds a Docker image using `docker exec ... claude --print` as the verification strategy, returning `Result<BuildResult>` with `success: true` instead of throwing "Unsupported stack". <!-- verification: cli-verifiable -->

3. **Given** a Python project (has `requirements.txt` or `pyproject.toml` with `dist/*.tar.gz` or `dist/*.whl`), **When** `buildVerifyImage()` is called, **Then** it builds a Docker image using the Python Dockerfile template, returning `Result<BuildResult>` with `success: true`. <!-- verification: cli-verifiable -->

4. **Given** a project with an unrecognized stack (no `package.json`, no `requirements.txt`, no `pyproject.toml`), **When** `buildVerifyImage()` is called, **Then** it does NOT throw "Unsupported stack" but instead builds a generic Docker image with basic CLI tools (bash, curl, jq) and returns `Result<BuildResult>`. <!-- verification: cli-verifiable -->

5. **Given** a project of any type, **When** the verify prompt is generated via `verifyPromptTemplate()`, **Then** the prompt includes project-type-specific guidance: Docker exec + stdout capture for CLI projects, `docker exec ... claude --print` for Claude plugins, and generic "adapt to available tools" for unknown types. <!-- verification: cli-verifiable -->

6. **Given** `classifyStrategy(description)` is called for any AC description, **When** the AC does not contain escalation keywords (physical hardware, manual human, visual inspection by human, paid external service), **Then** the strategy is `'docker'` — never refuses based on project type. <!-- verification: cli-verifiable -->

7. **Given** an AC tagged with `<!-- verification: integration-required -->`, **When** parsed by `parseVerificationTag()`, **Then** it returns `'integration-required'`. **Given** an AC tagged with `<!-- verification: cli-verifiable -->`, **When** parsed, **Then** it returns `'cli-verifiable'`. No AC is tagged `integration-required` unless it genuinely requires external systems, sprint planning, user sessions, or multi-workflow orchestration. <!-- verification: cli-verifiable -->

8. **Given** the `env.ts` `buildVerifyImage()` function, **When** `detectStack()` returns a value not in `['nodejs', 'python']`, **Then** the function uses a generic fallback Dockerfile template (`templates/Dockerfile.verify.generic`) instead of throwing an error. <!-- verification: cli-verifiable -->

9. **Given** new code in `src/modules/verify/`, **When** unit tests run, **Then** 100% coverage on all new/changed code (NFR14) with tests in `src/modules/verify/__tests__/`. <!-- verification: cli-verifiable -->

10. **Given** all files in `src/modules/verify/`, **When** reviewed, **Then** no file exceeds 300 lines (NFR18) and all types use strict TypeScript with no `any` (NFR19). <!-- verification: cli-verifiable -->

11. **Given** the sprint execution loop orchestrated by ralph, **When** verification is invoked for a project of any type and the verification strategy adapts correctly, **Then** the sprint loop continues without crashing. <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Remove `Unsupported stack` refusal from `env.ts` (AC: #4, #8)
  - [x] Replace the `else { throw new Error('Unsupported stack...') }` branch in `buildVerifyImage()` with a generic fallback
  - [x] Create `templates/Dockerfile.verify.generic` — minimal image with bash, curl, jq, node
  - [x] Add `buildGenericImage()` function in `env.ts`
  - [x] Update `resolveDockerfileTemplate()` to fall back to generic template

- [x] Task 2: Add Claude plugin project type support (AC: #2, #5)
  - [x] Detect plugin projects: check for `.claude-plugin/plugin.json` in `detectStack()` or `buildVerifyImage()`
  - [x] Add `buildPluginImage()` function — copies plugin source into container, installs `claude` CLI
  - [x] Update `verifyPromptTemplate()` to include plugin-specific guidance when project type is detected

- [x] Task 3: Update verify prompt for project-agnostic guidance (AC: #5)
  - [x] Accept optional `projectType` in `VerifyPromptConfig`
  - [x] Add conditional sections: CLI projects get `docker exec + stdout`, plugins get `claude --print`, generic gets "adapt to available tools"
  - [x] Ensure prompt never says "this project type isn't supported"

- [x] Task 4: Ensure `classifyStrategy()` never refuses (AC: #6)
  - [x] Verify current implementation returns `'docker'` by default — already correct per code review
  - [x] Add tests confirming no project-type-based refusal
  - [x] Add tests for edge cases: empty description, unusual project keywords

- [x] Task 5: Write unit tests (AC: #9, #10)
  - [x] Test `buildVerifyImage()` with unknown stack returns success (not throws)
  - [x] Test `buildVerifyImage()` with plugin project type
  - [x] Test `verifyPromptTemplate()` includes project-type-specific sections
  - [x] Test `classifyStrategy()` never returns 'escalate' for project-type descriptions
  - [x] Test generic Dockerfile template resolution
  - [x] Verify all files under 300 lines, no `any`

- [x] Task 6: Build and verify (AC: #9, #10)
  - [x] `npm run build` succeeds
  - [x] `npm test` passes all existing + new tests
  - [x] No file in `src/modules/verify/` exceeds 300 lines
  - [x] No `any` types in new code

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — internal files are not imported from outside the module. Only `index.ts` is the public interface.

### Key FRs & NFRs

- **FR19:** Verification adapts approach based on project type — never refuses any category.
- **FR13:** System can spawn a black-box verifier session in isolated Docker container.
- **FR14:** Verifier can run CLI commands via docker exec and capture output as proof.
- **NFR1:** No module failure crashes the overall system — structured error results.
- **NFR14:** 100% test coverage on new/changed code.
- **NFR18:** No source file exceeds 300 lines.
- **NFR19:** Module interfaces documented with TypeScript types — no `any`.

### What Already Exists (from Story 4.1)

- `src/modules/verify/env.ts` (221 lines) — Contains `buildVerifyImage()` with the `Unsupported stack` error at line 89. This is the primary refusal code. Also has `buildNodeImage()` and `buildPythonImage()` helpers, `prepareVerifyWorkspace()`, `checkVerifyEnv()`, `cleanupVerifyEnv()`.
- `src/modules/verify/parser.ts` (218 lines) — Contains `classifyStrategy()` which already defaults to `'docker'` for all non-escalation ACs. Already project-agnostic. Contains `classifyVerifiability()` and `parseVerificationTag()`.
- `src/modules/verify/orchestrator.ts` (182 lines) — Verification pipeline: preconditions, proof creation, showboat verify, state update.
- `src/modules/verify/proof.ts` (288 lines, near 300 limit) — Proof quality validation and black-box enforcement.
- `src/modules/verify/types.ts` (120 lines) — All verify domain types.
- `src/modules/verify/index.ts` (141 lines) — Public interface delegating to internal modules.
- `src/templates/verify-prompt.ts` (133 lines) — Verification prompt template. Currently assumes Docker exec for all ACs.
- `src/lib/verifier-session.ts` (199 lines) — Spawns claude --print in clean workspace. Already has `--allowedTools`.
- `src/lib/stack-detect.ts` — Stack detection used by `buildVerifyImage()`.
- `templates/Dockerfile.verify` — Current Dockerfile template for Node.js.

### The Specific Refusal Code to Fix

In `src/modules/verify/env.ts` line 89:
```typescript
else { throw new Error(`Unsupported stack for verify-env: ${stack}`); }
```

This is the primary blocker. When `detectStack()` returns something other than `'nodejs'` or `'python'`, the entire verification pipeline crashes. This violates FR19.

### Project Type Strategy Table (from product brief)

| Project Type | Verification Approach | How to Build Image |
|-------------|----------------------|-------------------|
| CLI tool (Node.js) | `docker exec` + stdout capture | `npm pack` + Node Dockerfile |
| CLI tool (Python) | `docker exec` + stdout capture | `dist/*.whl` + Python Dockerfile |
| Claude plugin | `docker exec ... claude --print` | Copy plugin source + claude CLI |
| Library | `docker exec ... node -e` or test runner | Same as CLI for the stack |
| Web app | `docker exec` + curl | Same as CLI + expose ports |
| Unknown | Generic container + adapt | Generic Dockerfile with basic tools |

### Dependencies

- **Story 4.1 (done):** Verify module extraction — all code is in `src/modules/verify/`.
- **Epic 1 (done):** Result<T> types in `src/types/result.ts`.
- **No new npm dependencies.** Uses existing `node:child_process`, `node:fs`, `node:path`, `node:crypto`.

### Existing Patterns to Follow

- **Module structure:** Follow `src/modules/verify/env.ts` patterns for new builder functions.
- **Types:** Follow `src/modules/verify/types.ts` — `readonly` interfaces.
- **Tests:** Follow `src/modules/verify/__tests__/verify-env.test.ts` — mock `child_process`, test all Result paths.

### Scope Boundary

**IN SCOPE:**
- Removing the "Unsupported stack" error in `env.ts` and adding a generic fallback
- Adding Claude plugin project type detection and build support
- Creating `templates/Dockerfile.verify.generic` for unknown stacks
- Updating `verifyPromptTemplate()` with project-type-aware guidance
- Adding unit tests for all new code paths

**OUT OF SCOPE:**
- Verifier session reliability improvements (Story 4.3)
- Agent-browser integration for web projects (Epic 8)
- OpenSearch backend (Epic 7)
- New stack detection logic in `src/lib/stack-detect.ts` (if needed, keep minimal)

### Previous Story Intelligence (from 4.1 completion notes)

- Extracted `src/lib/verify.ts` into `orchestrator.ts` (182 lines) and `proof.ts` (288 lines — near 300 limit, DO NOT add to proof.ts)
- `proof.ts` was compacted to 299 lines in code review — no room for additions
- TypeScript mock objects in tests must include all required fields (e.g., `strategy` field on `ParsedAC`)
- `checkVerifyEnv()` had a bug where readonly fields were mutated — use mutable locals and construct at return time
- Module boundary enforced: no external imports to internal files

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 4.2 — Project-Agnostic Verification]
- [Source: _bmad-output/planning-artifacts/product-brief-codeharness-arch-overhaul-2026-03-17.md#Design Constraint: Project-Agnostic]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md#FR19]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Docker Interaction Pattern]
- [Source: src/modules/verify/env.ts — refusal code at line 89]
- [Source: src/modules/verify/parser.ts — classifyStrategy() already correct]
- [Source: src/templates/verify-prompt.ts — needs project-type sections]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-2-project-agnostic-verification.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/verify/)
- [ ] Exec-plan created in `docs/exec-plans/active/4-2-project-agnostic-verification.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Removed `Unsupported stack` error from `buildVerifyImage()` in `env.ts` — replaced with `detectProjectType()` dispatcher that routes to `buildNodeImage`, `buildPythonImage`, `buildPluginImage`, or `buildGenericImage`
- Added `ProjectType` type (`nodejs | python | plugin | generic`) to `types.ts`
- Created `templates/Dockerfile.verify.generic` — minimal Docker image with bash, curl, jq, git, node, showboat, claude CLI
- Added `detectProjectType()` — checks for `.claude-plugin/plugin.json` first (plugin), then delegates to `detectStack()` for nodejs/python, falls back to generic
- Added `buildPluginImage()` — copies `.claude-plugin/`, `commands/`, `hooks/`, `knowledge/`, `skills/` into container context
- Added `buildGenericImage()` — builds minimal container from generic Dockerfile template
- Updated `resolveDockerfileTemplate()` to accept optional `variant` parameter for selecting generic template
- Updated `verifyPromptTemplate()` with `projectType` config option and `projectTypeGuidance()` function providing type-specific verification instructions
- Added `PromptProjectType` type and exported `projectTypeGuidance()` from `verify-prompt.ts`
- `classifyStrategy()` already returns `docker` by default — confirmed with new edge case tests (empty descriptions, Rust/Go/Java/Ruby keywords)
- Updated `index.ts` to export `detectProjectType` and `ProjectType`
- All 1962 tests pass (73 test files), no regressions
- All verify module files under 300 lines (max: proof.ts at 299)
- No `any` types in new code
- `verify-prompt.ts` coverage: 100%, `env.ts` coverage: 93% (uncovered lines are existing error paths)

### Change Log

- 2026-03-18: Implemented Story 4.2 — project-agnostic verification. Removed stack refusal, added plugin/generic support, updated verify prompt with project-type guidance.

### File List

- src/modules/verify/env.ts (modified) — removed Unsupported stack error, added detectProjectType, buildPluginImage, buildGenericImage, updated resolveDockerfileTemplate
- src/modules/verify/types.ts (modified) — added ProjectType type
- src/modules/verify/index.ts (modified) — exported detectProjectType and ProjectType
- src/templates/verify-prompt.ts (modified) — added projectType config, PromptProjectType type, projectTypeGuidance function
- templates/Dockerfile.verify.generic (new) — generic verification Dockerfile template
- src/modules/verify/__tests__/verify-env.test.ts (modified) — added detectProjectType, plugin build, generic build tests; updated stack-not-detected test
- src/modules/verify/__tests__/verify-prompt.test.ts (modified) — added projectTypeGuidance and per-type prompt tests
- src/modules/verify/__tests__/verify-parser.test.ts (modified) — added classifyStrategy edge case tests for AC #6
