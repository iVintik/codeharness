# Verification Proof: 10-1-stackprovider-interface-and-registry

**Story:** Create StackProvider Interface and Registry
**Date:** 2026-03-24
**Tier:** unit-testable
**Method:** Unit tests + file inspection + build verification

## AC 1: StackProvider interface in types.ts

**Given** `src/lib/stacks/types.ts` exists, **when** inspected, **then** it defines `StackProvider` interface with all required methods.

```bash
cat src/lib/stacks/types.ts | grep -E '(name|markers|displayName|detectAppType|getCoverageTool|detectCoverageConfig|getOtlpPackages|installOtlp|getDockerfileTemplate|getDockerBuildStage|getRuntimeCopyDirectives|getBuildCommands|getTestCommands|getSemgrepLanguages|parseTestOutput|parseCoverageReport|getProjectName)'
```

```output
  readonly name: StackName;
  readonly markers: string[];
  readonly displayName: string;
  detectAppType(dir: string): AppType;
  getCoverageTool(): CoverageToolName;
  detectCoverageConfig(dir: string): CoverageToolInfo;
  getOtlpPackages(): string[];
  installOtlp(dir: string): OtlpResult;
  getDockerfileTemplate(): string;
  getDockerBuildStage(): string;
  getRuntimeCopyDirectives(): string;
  getBuildCommands(): string[];
  getTestCommands(): string[];
  getSemgrepLanguages(): string[];
  parseTestOutput(output: string): TestCounts;
  parseCoverageReport(dir: string): number;
  getProjectName(dir: string): string | null;
```

All 16 methods/properties present (15 required + 1 optional `patchStartScript`). Supporting types `StackName`, `AppType`, `CoverageToolName`, `CoverageToolInfo`, `OtlpResult`, `TestCounts` all defined.

**Verdict: PASS**

## AC 2: detectStacks uses registry markers

**Given** `src/lib/stacks/registry.ts` exists, **when** `detectStacks()` is called, **then** it uses the registry's marker list (not hardcoded checks).

```bash
npx vitest run src/lib/__tests__/stacks/registry.test.ts --reporter=verbose 2>&1 | grep -E '(marker|AC2|hardcoded)'
```

```output
 ✓ detectStacks — marker-based detection (AC2) > detects nodejs when package.json exists
 ✓ detectStacks — marker-based detection (AC2) > detects python when requirements.txt exists
 ✓ detectStacks — marker-based detection (AC2) > detects multiple stacks at root in priority order
 ✓ detectStacks — marker-based detection (AC2) > detects stacks in subdirectories
 ✓ detectStacks — marker-based detection (AC2) > returns empty array when no providers are registered
 ✓ detectStacks — marker-based detection (AC2) > returns empty array for empty directory
 ✓ detectStacks — marker-based detection (AC2) > skips node_modules during subdirectory scan
 ✓ detectStacks — marker-based detection (AC2) > skips .git directory during subdirectory scan
 ✓ detectStacks — marker-based detection (AC2) > root stacks appear before subdirectory stacks
 ✓ detectStacks — marker-based detection (AC2) > subdirectory stacks sorted alphabetically
 ✓ detectStacks — marker-based detection (AC2) > uses marker arrays from providers, not hardcoded checks
```

The `detectStacks()` implementation iterates `getOrderedProviders()` and calls `hasMarker(dir, provider.markers)` — pure registry-based detection with no hardcoded file checks.

**Verdict: PASS**

## AC 3: getStackProvider('nodejs') returns NodejsProvider

**Given** the registry, **when** `getStackProvider('nodejs')` is called, **then** it returns the NodejsProvider instance.

```bash
npx vitest run src/lib/__tests__/stacks/registry.test.ts --reporter=verbose 2>&1 | grep 'AC3'
```

```output
 ✓ registerProvider / getStackProvider > getStackProvider("nodejs") returns NodejsProvider instance (AC3)
```

The test imports from the barrel `stacks/index.ts` (which auto-registers NodejsProvider), then calls `getStackProvider('nodejs')` and asserts:
- Result is defined
- `result.name === 'nodejs'`
- `result.markers` includes `'package.json'`

**Verdict: PASS**

## Build Verification

```bash
npm run build
```

```output
ESM ⚡️ Build success in 23ms
DTS ⚡️ Build success in 737ms
```

Build passes with zero errors.

## Test Summary

```
 Test Files  5 passed (5)
      Tests  55 passed (55)
   Duration  139ms
```

All 55 tests pass including 3 backward-compatibility tests confirming `stack-detect.ts` re-exports still work.

## Overall Verdict

| AC | Verdict |
|----|---------|
| AC1 | PASS |
| AC2 | PASS |
| AC3 | PASS |

**Story: VERIFIED**
