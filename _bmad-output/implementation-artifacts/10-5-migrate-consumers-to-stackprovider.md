# Story 10-5: Migrate All Consumers to StackProvider

## Status: backlog

## Story

As a developer,
I want zero `if (stack === 'nodejs')` patterns outside `src/lib/stacks/`,
So that the stack abstraction doesn't leak.

## Acceptance Criteria

- [ ] AC1: Given `coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, `verify/env.ts`, `readme.ts`, when inspected, then zero stack string comparisons remain -- all use `provider.method()` <!-- verification: cli-verifiable -->
- [ ] AC2: Given a boundary test exists, when it scans `src/` for `stack === 'nodejs'` or `stack === 'python'` or `stack === 'rust'` outside `src/lib/stacks/`, then it finds zero matches <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 2 (Stack Provider Pattern)** and **NFR4** (no direct stack conditionals outside `src/lib/stacks/`).

This is the cleanup story after 10-1 through 10-4. Every remaining consumer of stack-specific logic must call through the provider interface.

Consumer migration pattern:
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

Files to audit for remaining stack conditionals:
- `src/lib/coverage.ts` — Should delegate all detection/parsing to provider
- `src/lib/otlp.ts` — Should delegate package lists and install to provider
- `src/modules/infra/docs-scaffold.ts` — Should use provider for build/test commands
- `src/modules/infra/dockerfile-template.ts` — Should use provider for Dockerfile generation
- `src/modules/verify/env.ts` — Should use provider for verify Dockerfile sections
- `src/templates/readme.ts` — Should use provider for project name, commands
- `src/commands/stack.ts` — May legitimately reference stack names for display
- `src/lib/scanner.ts` — May need provider for semgrep language selection

Write a boundary test at `src/lib/stacks/__tests__/boundary.test.ts` that:
1. Reads all `.ts` files in `src/` excluding `src/lib/stacks/`
2. Searches for patterns: `stack === 'nodejs'`, `stack === 'python'`, `stack === 'rust'`, `=== 'nodejs'`, `=== 'python'`, `=== 'rust'`
3. Fails if any matches found

Also delete `src/lib/stack-detect.ts` since its logic now lives in `src/lib/stacks/registry.ts`. Update all imports.

## Files to Change

- `src/lib/coverage.ts` — Replace all stack conditionals with `getStackProvider(stack).method()` calls
- `src/lib/otlp.ts` — Replace all stack conditionals with provider calls
- `src/modules/infra/docs-scaffold.ts` — Replace stack conditionals with `provider.getBuildCommands()`, `provider.getTestCommands()`
- `src/modules/infra/dockerfile-template.ts` — Replace stack conditionals with `provider.getDockerfileTemplate()`
- `src/modules/verify/env.ts` — Replace stack conditionals with provider calls for verify Dockerfile generation
- `src/templates/readme.ts` — Replace stack conditionals with provider calls
- `src/lib/scanner.ts` — Replace stack conditionals with `provider.getSemgrepLanguages()`
- `src/lib/stack-detect.ts` — Delete. All callers import from `src/lib/stacks/index.ts` instead
- `src/lib/stacks/__tests__/boundary.test.ts` — Create. Boundary test enforcing NFR4
- All files importing from `src/lib/stack-detect.ts` — Update imports to `src/lib/stacks/index.ts`
