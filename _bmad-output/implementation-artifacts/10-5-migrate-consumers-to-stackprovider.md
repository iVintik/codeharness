# Story 10-5: Migrate All Consumers to StackProvider
<!-- verification-tier: unit-testable -->

## Status: verifying

## Story

As a developer,
I want zero `if (stack === 'nodejs')` patterns outside `src/lib/stacks/`,
So that the stack abstraction doesn't leak.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/coverage.ts`, when inspected, then zero stack string comparisons remain -- all coverage tool detection delegates to `getStackProvider(stack).detectCoverageConfig()` and `getStackProvider(stack).getCoverageTool()` <!-- verification: cli-verifiable -->
- [ ] AC2: Given `src/lib/otlp.ts`, when inspected, then zero stack string comparisons remain -- all OTLP package lists, install commands, and env var setup delegate to `getStackProvider(stack).getOtlpPackages()`, `getStackProvider(stack).installOtlp()`, and related provider methods <!-- verification: cli-verifiable -->
- [ ] AC3: Given `src/modules/infra/docs-scaffold.ts`, when inspected, then zero stack string comparisons remain -- display names use `provider.displayName`, coverage tool names use `provider.getCoverageTool()`, build/test commands use `provider.getBuildCommands()` and `provider.getTestCommands()`, and project name detection uses `provider.getProjectName()` <!-- verification: cli-verifiable -->
- [ ] AC4: Given `src/modules/infra/dockerfile-template.ts`, when inspected, then zero stack string comparisons remain -- single-stack templates use `provider.getDockerfileTemplate()`, multi-stack build stages use `provider.getDockerBuildStage()`, and runtime copy directives use `provider.getRuntimeCopyDirectives()` <!-- verification: cli-verifiable -->
- [ ] AC5: Given `src/modules/verify/env.ts`, when inspected, then zero stack string comparisons remain -- verify Dockerfile generation delegates to provider methods for stack-specific build images and verification setup <!-- verification: cli-verifiable -->
- [ ] AC6: Given `src/templates/readme.ts`, when inspected, then zero stack string comparisons remain -- install commands and stack labels delegate to provider methods <!-- verification: cli-verifiable -->
- [ ] AC7: Given `src/lib/state.ts`, when inspected, then zero stack string comparisons remain for coverage tool name lookup -- delegates to `getStackProvider(stack).getCoverageTool()` <!-- verification: cli-verifiable -->
- [ ] AC8: Given `src/lib/scanner.ts` (if it contains stack conditionals), when inspected, then zero stack string comparisons remain -- semgrep language selection delegates to `provider.getSemgrepLanguages()` <!-- verification: cli-verifiable -->
- [ ] AC9: Given `src/lib/stack-detect.ts`, when checked, then it is deleted -- all its logic now lives in `src/lib/stacks/registry.ts` and provider implementations <!-- verification: cli-verifiable -->
- [ ] AC10: Given all files that previously imported from `src/lib/stack-detect.ts` (including `otlp.ts`, `state.ts`, `coverage.ts`, `verify/env.ts`, `init-project.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, `docker-setup.ts`, `infra/types.ts`), when inspected, then all imports point to `src/lib/stacks/index.ts` instead <!-- verification: cli-verifiable -->
- [ ] AC11: Given test files that previously imported from `src/lib/stack-detect.ts` (`stack-detect.test.ts`, `state.test.ts`, `stack.test.ts`, `backward-compat.test.ts`, `init-project.test.ts`, `verify-env.test.ts`, `dockerfile-template.test.ts`), when inspected, then all imports point to `src/lib/stacks/index.ts` instead <!-- verification: cli-verifiable -->
- [ ] AC12: Given `src/lib/stacks/__tests__/boundary.test.ts` exists, when it runs, then it scans all `.ts` files in `src/` excluding `src/lib/stacks/` and finds zero matches for patterns: `stack === 'nodejs'`, `stack === 'python'`, `stack === 'rust'`, `=== 'nodejs'`, `=== 'python'`, `=== 'rust'` <!-- verification: cli-verifiable -->
- [ ] AC13: Given the boundary test also checks for `from.*stack-detect` import patterns, when it scans all `.ts` files in `src/` excluding `src/lib/stacks/`, then it finds zero matches <!-- verification: cli-verifiable -->
- [ ] AC14: Given `npm test` is run after all migrations, when it completes, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->
- [ ] AC15: Given `npx tsc --noEmit` is run after all migrations, when it completes, then zero new type errors are introduced <!-- verification: cli-verifiable -->
- [ ] AC16: Given `src/commands/teardown.ts` contains `state.stack === 'nodejs'`, when inspected, then the comparison is replaced with a provider-based check or uses `state.stacks` array membership test instead of string literal comparison <!-- verification: cli-verifiable -->
- [ ] AC17: Given `src/templates/verify-prompt.ts` contains `projectType === 'nodejs'` patterns, when inspected, then they are replaced with provider-based lookups or the patterns are confirmed as AppType comparisons (not StackName) and documented as intentional exceptions in the boundary test <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [ ] Task 1: Migrate `src/lib/coverage.ts` -- Replace `if (stack === 'nodejs')` / `if (stack === 'python')` / `if (stack === 'rust')` branches in `detectCoverageTool()` with `const provider = getStackProvider(stack); return provider.detectCoverageConfig(dir)`. Import `getStackProvider` from `./stacks/index.js`. Remove `import { detectStack } from './stack-detect.js'` and replace with import from `./stacks/index.js`.
- [ ] Task 2: Migrate `src/lib/otlp.ts` -- Replace all stack conditional branches: package list selection (`stack === 'nodejs'` -> `provider.getOtlpPackages()`), install functions (`stack === 'nodejs'` -> `provider.installOtlp()`), env var generation, docker compose service config. Update import from `./stack-detect.js` to `./stacks/index.js`. This file has ~10 separate stack conditionals across multiple functions.
- [ ] Task 3: Migrate `src/modules/infra/docs-scaffold.ts` -- Replace: `getStackLabel()` with `provider.displayName`, `getCoverageTool()` with `provider.getCoverageTool()`, `generateAgentsMdContent()` build/test command branches with `provider.getBuildCommands()` / `provider.getTestCommands()`, `getProjectName()` stack branches with `provider.getProjectName()`. Update import from `../../lib/stack-detect.js` to `../../lib/stacks/index.js`.
- [ ] Task 4: Migrate `src/modules/infra/dockerfile-template.ts` -- Replace: single-stack template selection with `provider.getDockerfileTemplate()`, multi-stack build stage selection with `provider.getDockerBuildStage()`, runtime copy directive selection with `provider.getRuntimeCopyDirectives()`. Update import from `../../lib/stack-detect.js` to `../../lib/stacks/index.js`.
- [ ] Task 5: Migrate `src/modules/verify/env.ts` -- Replace stack-to-label mapping and build image selection branches with provider calls. Update import from `../../lib/stack-detect.js` to `../../lib/stacks/index.js`.
- [ ] Task 6: Migrate `src/templates/readme.ts` -- Replace install command conditionals with provider method calls. The `'npm install codeharness'` default may need a new provider method or use `provider.name` for dispatch.
- [ ] Task 7: Migrate `src/lib/state.ts` -- Replace `if (stack === 'python') return 'coverage.py'` and `if (stack === 'rust') return 'cargo-tarpaulin'` with `getStackProvider(stack).getCoverageTool()`. Update import from `./stack-detect.js` to `./stacks/index.js`.
- [ ] Task 8: Migrate `src/commands/teardown.ts` -- Replace `state.stack === 'nodejs'` with `state.stacks?.includes('nodejs')` or a provider-based check. This is a minor reference that may need careful handling since it checks state, not a variable named `stack`.
- [ ] Task 9: Evaluate `src/templates/verify-prompt.ts` -- The `projectType === 'nodejs'` comparisons check `AppType`, not `StackName`. If these are AppType checks, they are outside the scope of the boundary test (which targets `stack ===` patterns). Document any intentional exceptions.
- [ ] Task 10: Update all remaining import references -- Change every `from './stack-detect.js'` and `from '../../lib/stack-detect.js'` to the corresponding stacks index import. Files: `src/modules/infra/init-project.ts`, `src/modules/infra/types.ts`, `src/modules/infra/docker-setup.ts`.
- [ ] Task 11: Update all test file imports -- Change `from '../stack-detect.js'` to `from '../stacks/index.js'` in: `src/lib/__tests__/stack-detect.test.ts`, `src/lib/__tests__/state.test.ts`, `src/commands/__tests__/stack.test.ts`, `src/modules/infra/__tests__/init-project.test.ts`, `src/modules/verify/__tests__/verify-env.test.ts`, `src/modules/infra/__tests__/dockerfile-template.test.ts`.
- [ ] Task 12: Delete `src/lib/stack-detect.ts` -- All exports are now available from `src/lib/stacks/index.ts`. The `StackDetection` interface and `detectStack`/`detectStacks`/`detectAppType` functions must be exported from the stacks module. Ensure `StackDetection` is exported from `src/lib/stacks/registry.ts` (it already exports `detectStack`, `detectStacks`, and `StackDetection`).
- [ ] Task 13: Delete or migrate `src/lib/__tests__/stack-detect.test.ts` -- Either delete it (tests now covered by provider tests) or rename/move to `src/lib/__tests__/stacks/detection.test.ts` with updated imports.
- [ ] Task 14: Remove `src/lib/__tests__/stacks/backward-compat.test.ts` -- This test exists solely to verify backward-compat re-exports from `stack-detect.ts`. Once `stack-detect.ts` is deleted, this test is unnecessary.
- [ ] Task 15: Create `src/lib/stacks/__tests__/boundary.test.ts` -- Reads all `.ts` files in `src/` excluding `src/lib/stacks/`. Searches for patterns: `stack === 'nodejs'`, `stack === 'python'`, `stack === 'rust'`, `=== 'nodejs'`, `=== 'python'`, `=== 'rust'`. Also searches for `from.*stack-detect` import patterns. Fails if any matches found. Uses `fs.readdirSync` recursively to collect files and `fs.readFileSync` to scan contents.
- [ ] Task 16: Run `npm test` and verify 0 regressions -- All existing tests must pass. Fix any broken imports or type mismatches.
- [ ] Task 17: Run `npx tsc --noEmit` and verify no new type errors -- Confirm the migration introduces no type regressions.

## Technical Notes

**Decision 2 (Stack Provider Pattern)** and **NFR4** (no direct stack conditionals outside `src/lib/stacks/`).

This is the final cleanup story for Epic 10. Stories 10-1 through 10-4 created the `StackProvider` interface and three provider implementations (NodejsProvider, PythonProvider, RustProvider). This story rewires every consumer to call through the provider interface and deletes the legacy `stack-detect.ts` module.

### Migration scope

Current stack conditional count by file (from codebase scan):

| File | Conditionals | Migration approach |
|------|-------------|-------------------|
| `src/lib/otlp.ts` | ~10 | Heaviest migration. Multiple functions with stack branches for packages, install, env vars, compose config |
| `src/modules/infra/docs-scaffold.ts` | ~12 | Display names, coverage tools, build/test commands, project name detection |
| `src/modules/infra/dockerfile-template.ts` | ~9 | Template selection, build stages, runtime copy directives |
| `src/modules/verify/env.ts` | ~5 | Stack label mapping, build image selection |
| `src/lib/coverage.ts` | 3 | Coverage tool detection per stack |
| `src/lib/state.ts` | 2 | Coverage tool name lookup |
| `src/templates/readme.ts` | 2 | Install command per stack |
| `src/commands/teardown.ts` | 1 | State check for nodejs OTLP cleanup |

### Consumer migration pattern

```typescript
// Before
if (stack === 'nodejs') {
  tool = detectNodeCoverageTool(dir);
} else if (stack === 'python') {
  tool = 'coverage.py';
} else if (stack === 'rust') {
  tool = 'cargo-tarpaulin';
}

// After
const provider = getStackProvider(stack);
const tool = provider.detectCoverageConfig(dir);
```

### Import migration pattern

```typescript
// Before
import { detectStack, detectStacks, type StackName } from './stack-detect.js';
import type { AppType } from './stack-detect.js';
import type { StackDetection } from '../../lib/stack-detect.js';

// After
import { detectStack, detectStacks, type StackName } from './stacks/index.js';
import type { AppType } from './stacks/index.js';
import type { StackDetection } from '../../lib/stacks/index.js';
```

### Files importing from `stack-detect.ts` (must update)

**Source files:**
- `src/lib/otlp.ts` -- `import type { AppType }`
- `src/lib/state.ts` -- `import { detectStack, detectStacks, type StackName }`
- `src/lib/coverage.ts` -- `import { detectStack }`
- `src/modules/verify/env.ts` -- `import { detectStacks }`
- `src/modules/infra/init-project.ts` -- `import { detectStacks, detectAppType }`
- `src/modules/infra/docs-scaffold.ts` -- `import type { StackDetection }`
- `src/modules/infra/dockerfile-template.ts` -- `import type { StackDetection }`
- `src/modules/infra/types.ts` -- `import type { AppType }`
- `src/modules/infra/docker-setup.ts` -- `import type { AppType }`

**Test files:**
- `src/lib/__tests__/stack-detect.test.ts`
- `src/lib/__tests__/state.test.ts`
- `src/commands/__tests__/stack.test.ts`
- `src/lib/__tests__/stacks/backward-compat.test.ts`
- `src/modules/infra/__tests__/init-project.test.ts`
- `src/modules/verify/__tests__/verify-env.test.ts`
- `src/modules/infra/__tests__/dockerfile-template.test.ts`

### Exports that must be available from `src/lib/stacks/index.ts`

Verify these are all exported before deleting `stack-detect.ts`:
- `StackName` (type) -- already exported
- `AppType` (type) -- already exported
- `StackDetection` (interface) -- already exported from registry.ts
- `detectStack()` -- already exported from registry.ts
- `detectStacks()` -- already exported from registry.ts
- `detectAppType()` -- **check if exported**. If only in `stack-detect.ts`, must add to registry or stacks/index.ts before deletion.

### Edge cases

- `src/commands/teardown.ts` checks `state.stack === 'nodejs'` in a cleanup context (removing OTLP start script). This checks a stored state value, not a detection result. The fix should use the `stacks` array or a provider lookup.
- `src/templates/verify-prompt.ts` uses `projectType === 'nodejs'` -- this compares `AppType` / project type strings, not `StackName`. If the boundary test only matches `stack ===` patterns, these pass. If it matches `=== 'nodejs'`, these need whitelisting or refactoring.
- `src/modules/verify/env.ts` has `projectType === 'rust'` and `projectType === 'nodejs'` -- these are AppType comparisons and may be intentional. The boundary test should be scoped to `stack === ` patterns specifically, or whitelist AppType comparisons.

### Boundary test scope

The boundary test at `src/lib/stacks/__tests__/boundary.test.ts` should:
1. Scan `src/**/*.ts` excluding `src/lib/stacks/**`
2. Flag: `stack === 'nodejs'`, `stack === 'python'`, `stack === 'rust'`
3. Flag: `from.*stack-detect` import patterns
4. NOT flag: `AppType` comparisons like `projectType === 'nodejs'` (these are legitimate)
5. NOT flag: stack name strings in test assertions or display-only contexts within `src/commands/stack.ts`

## Dev Notes

- The `NodejsProvider`, `PythonProvider`, and `RustProvider` in `src/lib/stacks/` are complete with all methods. Consumer migration is purely mechanical: replace conditionals with provider method calls.
- `getStackProvider()` throws if the stack is not registered. Callers that handle unknown stacks should catch or check `detectStacks()` first.
- `detectAppType()` from `stack-detect.ts` delegates to the provider's `detectAppType()` -- verify this re-export exists in the stacks module before deletion.
- After this story, `src/lib/stacks/` is the single source of truth for all stack-specific behavior. No other directory should contain stack-aware logic.

## Files to Change

- `src/lib/coverage.ts` -- Replace stack conditionals with `getStackProvider(stack).method()` calls, update imports
- `src/lib/otlp.ts` -- Replace all stack conditionals with provider calls, update imports
- `src/lib/state.ts` -- Replace stack conditionals with provider calls, update imports
- `src/modules/infra/docs-scaffold.ts` -- Replace stack conditionals with provider calls, update imports
- `src/modules/infra/dockerfile-template.ts` -- Replace stack conditionals with provider calls, update imports
- `src/modules/verify/env.ts` -- Replace stack conditionals with provider calls, update imports
- `src/templates/readme.ts` -- Replace stack conditionals with provider calls
- `src/commands/teardown.ts` -- Replace `state.stack === 'nodejs'` with provider-based or array-based check
- `src/modules/infra/init-project.ts` -- Update imports from stack-detect to stacks/index
- `src/modules/infra/types.ts` -- Update imports from stack-detect to stacks/index
- `src/modules/infra/docker-setup.ts` -- Update imports from stack-detect to stacks/index
- `src/lib/stack-detect.ts` -- Delete entirely
- `src/lib/__tests__/stack-detect.test.ts` -- Delete or migrate to stacks/ test directory
- `src/lib/__tests__/stacks/backward-compat.test.ts` -- Delete (no longer needed)
- `src/lib/__tests__/state.test.ts` -- Update imports
- `src/commands/__tests__/stack.test.ts` -- Update imports
- `src/modules/infra/__tests__/init-project.test.ts` -- Update imports
- `src/modules/verify/__tests__/verify-env.test.ts` -- Update imports
- `src/modules/infra/__tests__/dockerfile-template.test.ts` -- Update imports
- `src/lib/stacks/__tests__/boundary.test.ts` -- Create boundary test enforcing NFR4
- `src/lib/stacks/index.ts` -- Ensure `detectAppType` is exported (may need addition)
