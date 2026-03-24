# Story 10-1: Create StackProvider Interface and Registry
<!-- verification-tier: unit-testable -->

## Status: verifying

## Story

As a developer,
I want a StackProvider interface that encapsulates all language-specific behavior,
So that adding a new language requires only one new file.

## Acceptance Criteria

- [x] AC1: Given `src/lib/stacks/types.ts` exists, when inspected, then it defines `StackProvider` interface with: `name`, `markers`, `displayName`, `detectAppType()`, `getCoverageTool()`, `detectCoverageConfig()`, `getOtlpPackages()`, `installOtlp()`, `getDockerfileTemplate()`, `getDockerBuildStage()`, `getRuntimeCopyDirectives()`, `getBuildCommands()`, `getTestCommands()`, `getSemgrepLanguages()`, `parseTestOutput()`, `parseCoverageReport()`, `getProjectName()` <!-- verification: cli-verifiable -->
- [x] AC2: Given `src/lib/stacks/registry.ts` exists, when `detectStacks()` is called, then it uses the registry's marker list (not hardcoded checks) to detect stacks <!-- verification: cli-verifiable -->
- [x] AC3: Given the registry, when `getStackProvider('nodejs')` is called, then it returns the NodejsProvider instance <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [x] Task 1: Create `src/lib/stacks/` directory
- [x] Task 2: Create `src/lib/stacks/types.ts` — Define `StackProvider` interface with all required methods/properties, plus supporting types: `StackName`, `AppType`, `CoverageToolName`, `CoverageToolInfo`, `OtlpResult`, `TestCounts`
- [x] Task 3: Create `src/lib/stacks/registry.ts` — Implement `Map<StackName, StackProvider>`, `registerProvider()`, `getStackProvider()`, `detectStacks()`, `detectStack()` using provider marker arrays instead of hardcoded checks
- [x] Task 4: Create a minimal `NodejsProvider` stub in `src/lib/stacks/nodejs.ts` — Implement enough of `StackProvider` to satisfy AC3 (returns correct `name`, `markers`, `displayName`; other methods can throw `'not yet implemented'`)
- [x] Task 5: Create `src/lib/stacks/index.ts` — Re-export public API: `detectStack`, `detectStacks`, `getStackProvider`, `registerProvider`, `StackProvider`, `StackName`, `AppType`
- [x] Task 6: Update `src/lib/stack-detect.ts` — Re-export `StackName` and `AppType` from `src/lib/stacks/types.ts` for backward compatibility (existing imports continue to work)
- [x] Task 7: Register `NodejsProvider` in registry (auto-registration in module initialization or explicit call)
- [x] Task 8: Add tests in `src/lib/__tests__/stacks/` — Cover: interface shape validation, registry `getStackProvider()`, registry `detectStacks()` using markers, backward compatibility of re-exports

## Technical Notes

**Decision 2 (Stack Provider Pattern)** drives this story. The interface must capture every method that currently varies by stack across the codebase.

The `StackProvider` interface definition (from architecture-v3.md):

```typescript
interface StackProvider {
  readonly name: StackName;
  readonly markers: string[];           // e.g., ['package.json']
  readonly displayName: string;         // e.g., 'Node.js (package.json)'

  detectAppType(dir: string): AppType;
  getCoverageTool(): CoverageToolName;
  detectCoverageConfig(dir: string): CoverageToolInfo;
  getOtlpPackages(): string[];
  installOtlp(dir: string): OtlpResult;
  patchStartScript?(dir: string): boolean;
  getDockerfileTemplate(): string;
  getDockerBuildStage(): string;
  getRuntimeCopyDirectives(): string;
  getBuildCommands(): string[];
  getTestCommands(): string[];
  getSemgrepLanguages(): string[];
  parseTestOutput(output: string): TestCounts;
  parseCoverageReport(dir: string): number;
  getProjectName(dir: string): string | null;
}
```

The registry uses a `Map<StackName, StackProvider>` and detection iterates marker files via `fs.existsSync()` instead of the current hardcoded conditionals in `src/lib/stack-detect.ts`.

`detectStacks()` currently lives in `src/lib/stack-detect.ts` with direct file checks. Move this logic to `registry.ts` where each registered provider's `markers` array is checked against the project directory.

`StackName` and `AppType` types currently live in `src/lib/stack-detect.ts` (not `src/types/state.ts`). They should be moved to `src/lib/stacks/types.ts` and re-exported from `src/lib/stack-detect.ts` for backward compatibility.

### Important: Stub vs Full Provider

AC3 requires `getStackProvider('nodejs')` to return a NodejsProvider instance. This means a minimal NodejsProvider must be created in this story (at least registered with correct `name`, `markers`, `displayName`). Full method implementations happen in story 10-2.

### Backward Compatibility

`src/lib/stack-detect.ts` must continue exporting `StackName`, `AppType`, `detectStack()`, `detectStacks()`, `detectAppType()`, and `StackDetection` so existing consumers don't break. It can re-export from the new modules or keep its own implementation until story 10-5 migrates consumers.

## Files to Change

- `src/lib/stacks/types.ts` — Create. Define `StackProvider` interface, `StackName`, `AppType`, `CoverageToolName`, `CoverageToolInfo`, `OtlpResult`, `TestCounts` types
- `src/lib/stacks/registry.ts` — Create. Implement `Map<StackName, StackProvider>`, `registerProvider()`, `getStackProvider()`, `detectStacks()`, `detectStack()`
- `src/lib/stacks/nodejs.ts` — Create. Minimal `NodejsProvider` stub implementing `StackProvider` (full implementation in story 10-2)
- `src/lib/stacks/index.ts` — Create. Re-export public API: `detectStack`, `detectStacks`, `getStackProvider`, `registerProvider`, `StackProvider`, `StackName`
- `src/lib/stack-detect.ts` — Re-export `StackName` and `AppType` from stacks/types.ts for backward compatibility (deletion deferred to story 10-5)
- `src/lib/__tests__/stacks/` — Create. Tests for types, registry, and detection
