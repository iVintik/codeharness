# Story 10-2: Implement NodejsProvider

## Status: backlog

## Story

As a developer,
I want all Node.js-specific logic in one file,
So that Node.js behavior is encapsulated and testable in isolation.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/stacks/nodejs.ts` exists, when inspected, then it implements all `StackProvider` methods for Node.js: package.json detection, vitest/jest/c8 coverage, npm OTLP packages, Dockerfile template, AGENTS.md commands <!-- verification: cli-verifiable -->
- [ ] AC2: Given the NodejsProvider, when `detectCoverageConfig()` is called on a project with vitest, then it returns the same result as the current `detectNodeCoverageTool()` <!-- verification: cli-verifiable -->
- [ ] AC3: Given all Node.js if/else branches are removed from `coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, when `npm test` runs, then all tests pass (0 regressions) <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 2 (Stack Provider Pattern).** This is the reference implementation -- Python and Rust providers follow the same pattern.

Extract Node.js-specific logic from these current locations:

- **Coverage detection**: `src/lib/coverage.ts` contains `detectNodeCoverageTool()` which checks for vitest, jest, c8 in package.json. Move into `NodejsProvider.detectCoverageConfig()`.
- **Test output parsing**: `src/lib/coverage.ts` `parseTestCounts()` has Node.js-specific vitest/jest output patterns. Move into `NodejsProvider.parseTestOutput()`.
- **Coverage report parsing**: `src/lib/coverage.ts` reads lcov/json-summary. Move into `NodejsProvider.parseCoverageReport()`.
- **OTLP packages**: `src/lib/otlp.ts` has `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, etc. Move into `NodejsProvider.getOtlpPackages()`.
- **OTLP install**: `src/lib/otlp.ts` runs `npm install` for OTLP deps. Move into `NodejsProvider.installOtlp()`.
- **Dockerfile template**: `src/modules/infra/dockerfile-template.ts` has Node.js Dockerfile generation. Move into `NodejsProvider.getDockerfileTemplate()`, `getDockerBuildStage()`, `getRuntimeCopyDirectives()`.
- **Docs scaffold**: `src/modules/infra/docs-scaffold.ts` generates AGENTS.md with `npm test`, `npm run build` commands. Move into `NodejsProvider.getBuildCommands()`, `getTestCommands()`.
- **App type detection**: `src/lib/stack-detect.ts` checks package.json scripts for server/cli/library patterns. Move into `NodejsProvider.detectAppType()`.
- **Project name**: Read from `package.json` `name` field. Move into `NodejsProvider.getProjectName()`.

Markers: `['package.json']`. DisplayName: `'Node.js (package.json)'`. Semgrep languages: `['javascript', 'typescript']`.

## Files to Change

- `src/lib/stacks/nodejs.ts` — Create. Implement `NodejsProvider` class with all `StackProvider` methods
- `src/lib/stacks/registry.ts` — Register NodejsProvider: `registry.set('nodejs', new NodejsProvider())`
- `src/lib/coverage.ts` — Remove Node.js-specific branches from `detectNodeCoverageTool()`, `parseTestCounts()` (move to provider)
- `src/lib/otlp.ts` — Remove Node.js-specific OTLP package lists and install logic
- `src/modules/infra/dockerfile-template.ts` — Remove Node.js Dockerfile template generation
- `src/modules/infra/docs-scaffold.ts` — Remove Node.js-specific command generation
- `src/lib/stack-detect.ts` — Remove Node.js app type detection logic
