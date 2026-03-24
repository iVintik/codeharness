# Story 10-2: Implement NodejsProvider
<!-- verification-tier: unit-testable -->

## Status: verifying

## Story

As a developer,
I want all Node.js-specific logic in one file,
So that Node.js behavior is encapsulated and testable in isolation.

## Acceptance Criteria

- [x] AC1: Given `src/lib/stacks/nodejs.ts` exists, when inspected, then it implements all `StackProvider` methods for Node.js: `detectAppType()` (server/cli/web/agent/generic from package.json), `getCoverageTool()` (returns `'c8'`), `detectCoverageConfig()` (vitest/jest/c8 detection from package.json devDependencies), `getOtlpPackages()` (returns `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`), `installOtlp()` (runs `npm install`), `patchStartScript()` (adds `--require` flag to start/dev script), `getDockerfileTemplate()` (node:22-slim based), `getDockerBuildStage()` (multi-stage build snippet), `getRuntimeCopyDirectives()` (COPY from build-nodejs), `getBuildCommands()` (`['npm install', 'npm run build']`), `getTestCommands()` (`['npm test']`), `getSemgrepLanguages()` (`['javascript', 'typescript']`), `parseTestOutput()` (vitest/jest format parsing), `parseCoverageReport()` (coverage-summary.json parsing), `getProjectName()` (reads package.json `name` field) <!-- verification: cli-verifiable -->
- [x] AC2: Given a temporary directory with a `package.json` containing `@vitest/coverage-v8` in devDependencies and a `vitest.config.ts` file, when `NodejsProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'c8' }` with a defined `configFile`, matching the behavior of the current `detectNodeCoverageTool()` in `coverage.ts` <!-- verification: cli-verifiable -->
- [x] AC3: Given a temporary directory with a `package.json` containing `jest` in devDependencies, when `NodejsProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'c8' }` (Jest uses c8/istanbul underneath) <!-- verification: cli-verifiable -->
- [x] AC4: Given a temporary directory with a `package.json` containing `anthropic` in dependencies, when `NodejsProvider.detectAppType()` is called, then it returns `'agent'` <!-- verification: cli-verifiable -->
- [x] AC5: Given a temporary directory with a `package.json` containing `react` in dependencies, when `NodejsProvider.detectAppType()` is called, then it returns `'web'` <!-- verification: cli-verifiable -->
- [x] AC6: Given a temporary directory with a `package.json` containing a `bin` field and no `start` script, when `NodejsProvider.detectAppType()` is called, then it returns `'cli'` <!-- verification: cli-verifiable -->
- [x] AC7: Given a temporary directory with a `package.json` containing a `start` script (no agent/web deps), when `NodejsProvider.detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC8: Given `NodejsProvider.getOtlpPackages()` is called, when the result is inspected, then it returns exactly `['@opentelemetry/auto-instrumentations-node', '@opentelemetry/sdk-node', '@opentelemetry/exporter-trace-otlp-http', '@opentelemetry/exporter-metrics-otlp-http']` <!-- verification: cli-verifiable -->
- [x] AC9: Given `NodejsProvider.getDockerfileTemplate()` is called, when the result is inspected, then it contains `FROM node:22-slim`, `npm install -g`, and `USER node` <!-- verification: cli-verifiable -->
- [x] AC10: Given `NodejsProvider.getDockerBuildStage()` is called, when the result is inspected, then it contains `FROM node:22-slim AS build-nodejs` and `npm ci --production` <!-- verification: cli-verifiable -->
- [x] AC11: Given `NodejsProvider.getRuntimeCopyDirectives()` is called, when the result is inspected, then it contains `COPY --from=build-nodejs` <!-- verification: cli-verifiable -->
- [x] AC12: Given vitest output text `Tests  12 passed | 3 failed`, when `NodejsProvider.parseTestOutput()` is called, then it returns `{ passed: 12, failed: 3, skipped: 0, total: 15 }` <!-- verification: cli-verifiable -->
- [x] AC13: Given jest output text `Tests:  3 failed, 12 passed, 15 total`, when `NodejsProvider.parseTestOutput()` is called, then it returns `{ passed: 12, failed: 3, skipped: 0, total: 15 }` <!-- verification: cli-verifiable -->
- [x] AC14: Given a directory with `coverage/coverage-summary.json` containing `{ "total": { "statements": { "pct": 85.5 } } }`, when `NodejsProvider.parseCoverageReport()` is called, then it returns `85.5` <!-- verification: cli-verifiable -->
- [x] AC15: Given a directory with a `package.json` containing `{ "name": "my-app" }`, when `NodejsProvider.getProjectName()` is called, then it returns `'my-app'` <!-- verification: cli-verifiable -->
- [x] AC16: Given `NodejsProvider.getSemgrepLanguages()` is called, when the result is inspected, then it returns `['javascript', 'typescript']` <!-- verification: cli-verifiable -->
- [x] AC17: Given `NodejsProvider.getBuildCommands()` and `getTestCommands()` are called, when the results are inspected, then they return `['npm install', 'npm run build']` and `['npm test']` respectively <!-- verification: cli-verifiable -->
- [x] AC18: Given unit tests exist in `src/lib/__tests__/stacks/nodejs.test.ts`, when `npm test` runs, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [x] Task 1: Implement `NodejsProvider.detectAppType()` — Extract Node.js app type detection logic from `src/lib/stack-detect.ts` `detectAppType()` (the `stack === 'nodejs'` branch). Read `package.json`, check deps for agent SDKs (anthropic, openai, langchain), web frameworks (react, vue, next), bin field (cli), start script (server), fallback to generic.
- [x] Task 2: Implement `NodejsProvider.getCoverageTool()` — Return `'c8'` as the canonical Node.js coverage tool.
- [x] Task 3: Implement `NodejsProvider.detectCoverageConfig()` — Extract from `coverage.ts` `detectNodeCoverageTool()`. Check for vitest config files, `@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `c8`, `jest` in package.json devDependencies. Return `CoverageToolInfo` with `tool` and optional `configFile`.
- [x] Task 4: Implement `NodejsProvider.getOtlpPackages()` — Return the `NODE_OTLP_PACKAGES` array from `otlp.ts`: `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`.
- [x] Task 5: Implement `NodejsProvider.installOtlp()` — Extract from `otlp.ts` `installNodeOtlp()`. Run `npm install` with the OTLP packages. Return `OtlpResult` with success/failure.
- [x] Task 6: Implement `NodejsProvider.patchStartScript()` — Extract from `otlp.ts` `patchNodeStartScript()`. Add `--require @opentelemetry/auto-instrumentations-node/register` to start/dev script in package.json.
- [x] Task 7: Implement `NodejsProvider.getDockerfileTemplate()` — Extract from `dockerfile-template.ts` `nodejsTemplate()`. Return the node:22-slim Dockerfile string.
- [x] Task 8: Implement `NodejsProvider.getDockerBuildStage()` — Extract from `dockerfile-template.ts` `nodejsBuildStage()`. Return multi-stage build snippet.
- [x] Task 9: Implement `NodejsProvider.getRuntimeCopyDirectives()` — Extract from `dockerfile-template.ts` `runtimeCopyDirectives()` (the nodejs branch). Return `COPY --from=build-nodejs` lines.
- [x] Task 10: Implement `NodejsProvider.getBuildCommands()` — Return `['npm install', 'npm run build']`.
- [x] Task 11: Implement `NodejsProvider.getTestCommands()` — Return `['npm test']`.
- [x] Task 12: Implement `NodejsProvider.getSemgrepLanguages()` — Return `['javascript', 'typescript']`.
- [x] Task 13: Implement `NodejsProvider.parseTestOutput()` — Extract vitest and jest parsing from `coverage.ts` `parseTestCounts()`. Vitest: `Tests  N passed | M failed`. Jest: `Tests:  M failed, N passed, T total`. Return `TestCounts`.
- [x] Task 14: Implement `NodejsProvider.parseCoverageReport()` — Extract from `coverage.ts` `parseVitestCoverage()`. Read `coverage/coverage-summary.json`, parse `total.statements.pct`. Also check `src/coverage/coverage-summary.json` as fallback.
- [x] Task 15: Implement `NodejsProvider.getProjectName()` — Extract from `docs-scaffold.ts` `getProjectName()`. Read `package.json` `name` field. Return `null` if not found.
- [x] Task 16: Create `src/lib/__tests__/stacks/nodejs.test.ts` — Unit tests for every method. Use temp directories with fixture `package.json` files. Cover: each app type variant, coverage tool detection (vitest, jest, c8, none), test output parsing (vitest format, jest format, no match), coverage report parsing (valid JSON, missing file, malformed), project name (present, missing, no package.json), OTLP packages, Dockerfile content, build/test commands, semgrep languages.
- [x] Task 17: Verify the existing test suite still passes — run `npm test` and confirm 0 regressions.

## Technical Notes

**Decision 2 (Stack Provider Pattern).** This is the reference implementation — Python and Rust providers (stories 10-3, 10-4) follow the same pattern.

### What moves INTO NodejsProvider

| Method | Source File | Source Function/Branch |
|--------|------------|----------------------|
| `detectAppType()` | `src/lib/stack-detect.ts` | `detectAppType()` → `stack === 'nodejs'` branch |
| `getCoverageTool()` | `src/lib/coverage.ts` | `detectCoverageTool()` → `stack === 'nodejs'` branch |
| `detectCoverageConfig()` | `src/lib/coverage.ts` | `detectNodeCoverageTool()` |
| `getOtlpPackages()` | `src/lib/otlp.ts` | `NODE_OTLP_PACKAGES` constant |
| `installOtlp()` | `src/lib/otlp.ts` | `installNodeOtlp()` |
| `patchStartScript()` | `src/lib/otlp.ts` | `patchNodeStartScript()` |
| `getDockerfileTemplate()` | `src/modules/infra/dockerfile-template.ts` | `nodejsTemplate()` |
| `getDockerBuildStage()` | `src/modules/infra/dockerfile-template.ts` | `nodejsBuildStage()` |
| `getRuntimeCopyDirectives()` | `src/modules/infra/dockerfile-template.ts` | `runtimeCopyDirectives()` nodejs branch |
| `getBuildCommands()` | `src/modules/infra/docs-scaffold.ts` | `generateAgentsMdContent()` nodejs branch |
| `getTestCommands()` | `src/modules/infra/docs-scaffold.ts` | `generateAgentsMdContent()` nodejs branch |
| `getSemgrepLanguages()` | New | `['javascript', 'typescript']` |
| `parseTestOutput()` | `src/lib/coverage.ts` | `parseTestCounts()` vitest+jest branches |
| `parseCoverageReport()` | `src/lib/coverage.ts` | `parseVitestCoverage()` |
| `getProjectName()` | `src/modules/infra/docs-scaffold.ts` | `getProjectName()` nodejs path |

### Important: Do NOT remove consumer branches yet

This story implements the provider methods only. Consumer files (`coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, `stack-detect.ts`) keep their existing if/else branches for now. Story 10-5 migrates consumers to use `provider.method()` and removes the branches. This avoids a big-bang migration.

### Dependencies from `stack-detect.ts`

The helper functions `readJsonSafe()`, `getNodeDeps()`, `readTextSafe()` in `stack-detect.ts` are used by the Node.js detection logic. Either:
1. Copy them into `nodejs.ts` (some duplication, cleaned up in 10-5), or
2. Extract into a shared `src/lib/stacks/utils.ts` file

Option 2 is preferred — a small `utils.ts` with `readJsonSafe()`, `readTextSafe()`, `getNodeDeps()` avoids duplication across providers.

### Type mapping: `CoverageToolInfo`

The `CoverageToolInfo` in `stacks/types.ts` has `{ tool: CoverageToolName; configFile?: string }`. The current `coverage.ts` `CoverageToolInfo` has `{ tool: string; runCommand: string; reportFormat: string }`. The provider's `detectCoverageConfig()` returns the stacks/types version. The `runCommand` and `reportFormat` can be derived from the tool name by the consumer or added to the provider as separate methods if needed during story 10-5.

## Dev Notes

- The `NodejsProvider` class already exists as a stub from story 10-1 with all methods throwing `'not yet implemented'`. Replace each stub with the real implementation.
- Registration in `src/lib/stacks/index.ts` already calls `registerProvider(new NodejsProvider())` — no change needed there.
- `markers` and `displayName` are already set correctly from story 10-1.

## Files to Change

- `src/lib/stacks/nodejs.ts` — Replace all stub methods with real implementations extracted from consumer files
- `src/lib/stacks/utils.ts` — Create. Shared helpers: `readJsonSafe()`, `readTextSafe()`, `getNodeDeps()` (extracted from `stack-detect.ts`)
- `src/lib/__tests__/stacks/nodejs.test.ts` — Create. Comprehensive unit tests for all NodejsProvider methods
