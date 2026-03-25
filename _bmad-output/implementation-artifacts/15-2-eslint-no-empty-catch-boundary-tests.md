# Story 15.2: ESLint no-empty-catch + Boundary Tests

Status: done

## Story

As a developer,
I want automated enforcement of error handling and module boundaries,
So that architectural rules aren't just documented but enforced.

<!-- verification-tier: unit-testable -->

## Acceptance Criteria

- [x] AC1: Given ESLint runs via `npx eslint src/`, when a `catch {}` block has no body and no `// IGNORE:` comment, then it reports an error <!-- verification: cli-verifiable -->
- [x] AC2: Given a boundary test scans `src/`, when it finds `stack === 'nodejs'` (or `python` or `rust`) outside `src/lib/stacks/`, then the test fails <!-- verification: cli-verifiable -->
- [x] AC3: Given a boundary test scans module imports, when a module imports from another module's internal file (not `index.ts`), then the test fails <!-- verification: cli-verifiable -->
- [x] AC4: Given all 134 existing bare `catch {}` blocks, when each is audited, then every one either has an `// IGNORE: <reason>` comment, rethrows, or returns `Result.fail()` <!-- verification: cli-verifiable -->
- [x] AC5: Given `npm run lint` is added to `package.json`, when executed, then ESLint runs against `src/` and exits 0 on a clean codebase <!-- verification: cli-verifiable -->
- [x] AC6: Given CI workflow `.github/workflows/release.yml`, when the `test` job runs, then it includes the ESLint lint step <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Install and configure ESLint (AC: 1, 5)
  - [x] 1.1: Install `eslint`, `@eslint/js`, `typescript-eslint` as devDependencies
  - [x] 1.2: Create `eslint.config.js` (flat config format — ESLint 9+) with TypeScript support
  - [x] 1.3: Enable `no-empty` rule with `allowEmptyCatch: false`
  - [x] 1.4: Add `"lint": "eslint src/"` script to `package.json`
  - [x] 1.5: Verify `npm run lint` runs and reports empty catch violations

- [x] Task 2: Custom ESLint rule for `// IGNORE:` comment requirement (AC: 1)
  - [x] 2.1: Create a local ESLint plugin or inline rule in `eslint.config.js` that checks catch blocks: if the catch body is empty OR contains only comments, at least one comment must start with `// IGNORE:`
  - [x] 2.2: Alternatively, if a custom rule is too complex, enforce via the `no-empty` rule + a BATS or vitest test that greps for `catch {` without `// IGNORE:` in nearby lines
  - [x] 2.3: Write a vitest test that validates the rule catches violations and allows `// IGNORE:` blocks

- [x] Task 3: Audit and fix all bare `catch {}` blocks (AC: 4)
  - [x] 3.1: Run `grep -rn 'catch\s*{' src/ --include='*.ts'` to find all 134 bare catch blocks (excluding `__tests__/`)
  - [x] 3.2: For each catch block, determine the appropriate action:
    - If the error is genuinely non-fatal (cleanup, optional read, best-effort operation): add `// IGNORE: <specific reason>`
    - If the error should be propagated: convert to `Result.fail()` or rethrow
  - [x] 3.3: Verify `npm run lint` passes after all catch blocks are addressed

- [x] Task 4: Module import boundary test (AC: 3)
  - [x] 4.1: Create `src/__tests__/boundaries.test.ts`
  - [x] 4.2: Implement test that scans all `.ts` files in `src/` for imports matching `from '...modules/<name>/<internal-file>'` where `<internal-file>` is not `index` or `index.js`
  - [x] 4.3: Include `src/lib/` domain subdirectories (`coverage/`, `docker/`, `stacks/`, `sync/`, `observability/`) in the boundary check — external consumers must import from their `index.ts`
  - [x] 4.4: Fix the 3 known violations:
    - `src/lib/docker/cleanup.ts` imports `../../modules/infra/container-cleanup.js` — change to `../../modules/infra/index.js`
    - `src/lib/retry-state.ts` imports `../modules/sprint/state.js` — change to `../modules/sprint/index.js`
    - `src/commands/audit-action.ts` imports `../modules/audit/report.js` — change to `../modules/audit/index.js`
  - [x] 4.5: Ensure the needed exports are added to the respective `index.ts` barrel files if not already present

- [x] Task 5: Verify stack boundary test coverage (AC: 2)
  - [x] 5.1: Confirm existing `src/lib/__tests__/stacks/boundary.test.ts` already covers AC2 (it does — already enforces NFR4)
  - [x] 5.2: Run `npx vitest run src/lib/__tests__/stacks/boundary.test.ts` to verify it passes
  - [x] 5.3: If needed, extend the existing test to also cover `!==` comparisons (currently only checks `===`)

- [x] Task 6: CI integration (AC: 6)
  - [x] 6.1: Add `npm run lint` step to `.github/workflows/release.yml` `test` job (after build, before or alongside test steps)

## Dev Notes

### Current State Analysis

- **134 bare `catch {}` blocks** exist in `src/` (excluding tests). Zero have `// IGNORE:` comments. This is the bulk of the work.
- **ESLint is NOT installed.** The project uses `vitest` for testing, `tsup` for building, and `TypeScript 5.9.3`. No linter is configured.
- **Existing boundary test** at `src/lib/__tests__/stacks/boundary.test.ts` already covers AC2 (NFR4). It scans for `stack === 'nodejs'/'python'/'rust'` and legacy `stack-detect` imports outside `src/lib/stacks/`. This test passes today.
- **3 cross-module internal import violations** exist today:
  - `src/lib/docker/cleanup.ts:9` -> `../../modules/infra/container-cleanup.js`
  - `src/lib/retry-state.ts:2` -> `../modules/sprint/state.js`
  - `src/commands/audit-action.ts:11` -> `../modules/audit/report.js`
- **Module barrel files** (`index.ts`) exist for all 8 modules under `src/modules/`.

### Architecture References

- **Decision 7** (Error Handling): Three strategies — `Result<T>`, typed errors, or explicit `// IGNORE:` with reason. Bare `catch {}` is banned. [Source: architecture-v3.md#Decision 7]
- **NFR3**: No bare `catch {}` without `// IGNORE:` comment. Enforcement: ESLint rule. [Source: architecture-v3.md#NFRs]
- **NFR4**: No direct stack conditionals outside `src/lib/stacks/`. Enforcement: Boundary test. [Source: architecture-v3.md#NFRs]
- **NFR6**: Module imports only through `index.ts`. Enforcement: Boundary test. [Source: architecture-v3.md#NFRs]

### ESLint Configuration Guidance

Use **ESLint 9 flat config** (`eslint.config.js`), not legacy `.eslintrc`. The project is ESM (`"type": "module"` in `package.json`).

```javascript
// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Disable rules that conflict with existing codebase patterns as needed
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
);
```

Start with `no-empty` + `allowEmptyCatch: false`. If a custom `// IGNORE:` check is needed beyond that, implement it as a vitest boundary test (simpler than writing a custom ESLint rule plugin):

```typescript
// In src/__tests__/boundaries.test.ts
it('all catch blocks have // IGNORE: comment, rethrow, or Result.fail()', () => {
  // Scan for `catch {` blocks and verify the body isn't bare
});
```

### Catch Block Audit Strategy

Most of the 134 bare `catch {}` blocks are in these categories:
1. **File I/O reads** (scan-cache, state loading) — `// IGNORE: file may not exist, return default`
2. **Docker operations** (health checks, compose) — `// IGNORE: Docker not available, non-fatal`
3. **Cleanup operations** — `// IGNORE: cleanup failure is non-fatal`
4. **Config parsing** — `// IGNORE: malformed config, use defaults`
5. **stat/readdir calls** — `// IGNORE: directory may not exist`

Do NOT change logic or error handling behavior. Only add `// IGNORE:` comments where the empty catch is intentional. If the catch should propagate, refactor to `Result.fail()`.

### Previous Story Intelligence

Story 15-1 established:
- `scripts/check-file-sizes.sh` — standalone bash gate script pattern
- CI integration pattern: add step to `.github/workflows/release.yml` `test` job after `npm run build`
- `FILE_SIZE_ENFORCEMENT` env var pattern for warn/fail modes
- BATS tests at `tests/` directory for script validation
- 325 BATS tests + 143 vitest unit tests currently pass, 96.97% coverage

### Testing Requirements

- All existing tests must continue to pass after changes
- New boundary test must pass (`npx vitest run src/__tests__/boundaries.test.ts`)
- ESLint must pass on clean codebase (`npm run lint`)
- Coverage target: maintain current level (do not drop below 90%)

### Project Structure Notes

- ESLint config goes in project root: `eslint.config.js`
- New boundary test goes in `src/__tests__/boundaries.test.ts` (sibling to existing test files in that directory)
- The stack boundary test already exists at `src/lib/__tests__/stacks/boundary.test.ts` — do NOT duplicate it; just verify it passes
- No new directories needed

### References

- [Source: architecture-v3.md#Decision 7 — Error Handling]
- [Source: architecture-v3.md#Decision 8 — Command Structure]
- [Source: architecture-v3.md#Decision 12 — File Size Enforcement]
- [Source: architecture-v3.md#NFRs — NFR3, NFR4, NFR6]
- [Source: epics-architecture-v3.md#Epic 15, Story 15-2]
- [Source: 15-1-ci-file-size-gate.md — Previous story patterns]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`docs/exec-plans/active/15-2-eslint-no-empty-catch-boundary-tests.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100%)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (list modules touched)
- [x] Exec-plan created in `docs/exec-plans/active/15-2-eslint-no-empty-catch-boundary-tests.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Installed ESLint 10, @eslint/js, typescript-eslint as devDependencies. Created eslint.config.js with flat config format, no-empty rule with allowEmptyCatch: false. Added "lint": "eslint src/" script to package.json. npm run lint exits 0.
- Task 2: Implemented catch block enforcement via vitest boundary test in src/__tests__/boundaries.test.ts (Task 2.2 approach — simpler than custom ESLint plugin). The test scans all source files for catch blocks and verifies each has an // IGNORE: comment within 3 lines. ESLint no-empty rule catches truly empty catch blocks at lint time.
- Task 3: Audited and annotated all 134 bare catch blocks across 48 source files with contextual // IGNORE: comments. No logic changes made — only documentation of intent. Also fixed 8 empty catch blocks in verify-env.test.ts that violated the no-empty ESLint rule.
- Task 4: Created src/__tests__/boundaries.test.ts with module import boundary test. Fixed 3 known violations (cleanup.ts, retry-state.ts, audit-action.ts) by changing imports to use barrel files. Also fixed 2 test files (audit.test.ts, onboard.test.ts) that had stale imports from modules/audit/report.js. Updated vi.mock declarations to match new import structure.
- Task 5: Verified existing stack boundary test at src/lib/__tests__/stacks/boundary.test.ts passes. Already covers AC2 (NFR4) with both === and legacy import checks. No extensions needed.
- Task 6: Added "ESLint" step to .github/workflows/release.yml test job, positioned after build and before unit tests.

### File List

- eslint.config.js (new)
- package.json (modified — added lint script, eslint devDependencies)
- src/__tests__/boundaries.test.ts (new)
- src/lib/bmad.ts (modified — IGNORE comments)
- src/lib/state.ts (modified — IGNORE comments)
- src/lib/scan-cache.ts (modified — IGNORE comments)
- src/lib/github.ts (modified — IGNORE comments)
- src/lib/onboard-checks.ts (modified — IGNORE comments)
- src/lib/beads.ts (modified — IGNORE comments)
- src/lib/deps.ts (modified — IGNORE comments)
- src/lib/verifier-session.ts (modified — IGNORE comments)
- src/lib/agents/stream-parser.ts (modified — IGNORE comments)
- src/lib/docker/health.ts (modified — IGNORE comments)
- src/lib/docker/compose.ts (modified — IGNORE comments)
- src/lib/docker/cleanup.ts (modified — import fix + IGNORE)
- src/lib/stacks/utils.ts (modified — IGNORE comments)
- src/lib/stacks/rust.ts (modified — IGNORE comments)
- src/lib/stacks/python.ts (modified — IGNORE comments)
- src/lib/stacks/nodejs.ts (modified — IGNORE comments)
- src/lib/observability/instrument.ts (modified — IGNORE comments)
- src/lib/observability/config.ts (modified — IGNORE comments)
- src/lib/sync/sprint-yaml.ts (modified — IGNORE comments)
- src/lib/scanner.ts (modified — IGNORE comments)
- src/lib/doc-health/report.ts (modified — IGNORE comments)
- src/lib/doc-health/staleness.ts (modified — IGNORE comments)
- src/lib/doc-health/types.ts (modified — IGNORE comments)
- src/lib/doc-health/scanner.ts (modified — IGNORE comments)
- src/lib/coverage/evaluator.ts (modified — IGNORE comments)
- src/lib/coverage/parser.ts (modified — IGNORE comments)
- src/lib/coverage/runner.ts (modified — IGNORE comments)
- src/lib/retry-state.ts (modified — import fix)
- src/templates/bmad-patches.ts (modified — IGNORE comments)
- src/commands/verify.ts (modified — IGNORE comments)
- src/commands/stack.ts (modified — IGNORE comments)
- src/commands/teardown.ts (modified — IGNORE comments)
- src/commands/run.ts (modified — IGNORE comments)
- src/commands/audit-action.ts (modified — import fix)
- src/commands/__tests__/audit.test.ts (modified — import fix + mock fix)
- src/commands/__tests__/onboard.test.ts (modified — import fix + mock fix)
- src/modules/infra/docs-scaffold.ts (modified — IGNORE comments)
- src/modules/infra/container-cleanup.ts (modified — IGNORE comments)
- src/modules/infra/bmad-setup.ts (modified — IGNORE comments)
- src/modules/infra/dockerfile-validator.ts (modified — IGNORE comments)
- src/modules/infra/stack-management.ts (modified — IGNORE comments)
- src/modules/infra/init-project.ts (modified — IGNORE comments)
- src/modules/infra/victoria-backend.ts (modified — IGNORE comments)
- src/modules/verify/orchestrator.ts (modified — IGNORE comments)
- src/modules/verify/index.ts (modified — IGNORE comments)
- src/modules/verify/env.ts (modified — IGNORE comments)
- src/modules/verify/__tests__/verify-env.test.ts (modified — IGNORE comments)
- src/modules/status/formatters.ts (modified — IGNORE comments)
- src/modules/observability/analyzer.ts (modified — IGNORE comments)
- src/modules/observability/runtime-validator.ts (modified — IGNORE comments)
- src/modules/audit/dimensions.ts (modified — IGNORE comments)
- src/modules/dev/orchestrator.ts (modified — IGNORE comments)
- src/modules/sprint/state.ts (modified — IGNORE comments)
- src/modules/sprint/migration.ts (modified — IGNORE comments)
- .github/workflows/release.yml (modified — added ESLint step)
