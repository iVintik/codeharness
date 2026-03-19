# Story 1.2: Analyzer Module & Interface

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an analyzer module that runs Semgrep and produces a standardized gap report,
so that the tool can be swapped without changing the harness.

## Acceptance Criteria

1. **Given** `src/modules/observability/analyzer.ts` exists, **When** `analyze(projectDir)` is called, **Then** it returns `Result<AnalyzerResult>` with gaps, summary, and coverage %. <!-- verification: cli-verifiable -->
2. **Given** Semgrep is installed, **When** the analyzer runs, **Then** it spawns `semgrep scan --config patches/observability/ --json` and parses the output into `ObservabilityGap[]`. <!-- verification: cli-verifiable -->
3. **Given** Semgrep is NOT installed, **When** the analyzer runs, **Then** it returns a warning "static analysis skipped -- install semgrep" -- not a hard failure. <!-- verification: cli-verifiable -->
4. **Given** the `AnalyzerResult` interface, **When** a different tool produces the same format, **Then** it can be used as a drop-in replacement. <!-- verification: cli-verifiable -->
5. **Given** a project with 20 functions and 15 with log statements, **When** coverage is computed, **Then** static coverage = 75%. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/observability/` module directory (AC: all)
  - [x] 1.1: Create `src/modules/observability/types.ts` with `AnalyzerResult`, `ObservabilityGap`, `AnalyzerConfig` interfaces matching architecture Decision 1
  - [x] 1.2: Create `src/modules/observability/index.ts` barrel export (module boundary per convention)

- [x] Task 2: Implement `src/modules/observability/analyzer.ts` -- Semgrep integration (AC: #1, #2, #3)
  - [x] 2.1: Implement `analyze(projectDir: string, config?: AnalyzerConfig): Result<AnalyzerResult>` public function
  - [x] 2.2: Implement `checkSemgrepInstalled(): boolean` -- runs `semgrep --version` in subprocess, returns false on error
  - [x] 2.3: Implement `runSemgrep(projectDir: string, rulesDir: string): Result<SemgrepRawOutput>` -- spawns `semgrep scan --config <rulesDir> --json <projectDir>`, captures stdout
  - [x] 2.4: Implement `parseSemgrepOutput(raw: SemgrepRawOutput): ObservabilityGap[]` -- maps Semgrep JSON results array to `ObservabilityGap[]` (file, line, type=rule_id, description=message, severity)
  - [x] 2.5: Implement `computeSummary(gaps: ObservabilityGap[], opts?: { totalFunctions?: number }): AnalyzerSummary` -- computes totalFunctions, functionsWithLogs, errorHandlersWithoutLogs, coveragePercent, levelDistribution
  - [x] 2.6: When Semgrep is not installed, return `ok({ tool: 'semgrep', gaps: [], summary: { ... coveragePercent: 0 }, skipped: true, skipReason: 'static analysis skipped -- install semgrep' })` -- not a failure result
  - [x] 2.7: Default `rulesDir` to `patches/observability/` relative to project root

- [x] Task 3: Implement coverage computation (AC: #5)
  - [x] 3.1: Coverage formula: `functionsWithLogs / totalFunctions * 100`
  - [x] 3.2: If totalFunctions is 0, coverage = 100 (no functions = no gaps)
  - [x] 3.3: Parse Semgrep stats output for function counts -- Semgrep JSON output includes `stats.total` and per-rule match counts

- [x] Task 4: Ensure interface is tool-agnostic (AC: #4)
  - [x] 4.1: `AnalyzerResult` interface does not reference Semgrep-specific types -- only generic gap/summary types
  - [x] 4.2: `analyze()` accepts an optional `config.tool` field (default: `'semgrep'`) to allow future tool swapping
  - [x] 4.3: Document the interface contract in JSDoc comments so alternative implementations know the expected shape

- [x] Task 5: Write unit tests (AC: all)
  - [x] 5.1: Create `src/modules/observability/__tests__/analyzer.test.ts`:
    - Test `analyze()` returns `Result<AnalyzerResult>` with correct structure
    - Test Semgrep subprocess is spawned with correct arguments
    - Test Semgrep JSON output is parsed into `ObservabilityGap[]`
    - Test missing Semgrep returns ok result with skip warning (not a failure)
    - Test coverage computation: 15/20 = 75%
    - Test coverage computation: 0/0 = 100%
    - Test `AnalyzerResult` shape matches interface (type-level check)
  - [x] 5.2: Create `src/modules/observability/__tests__/types.test.ts`:
    - Type-level tests verifying `AnalyzerResult` and `ObservabilityGap` interfaces compile correctly
    - Test that alternative tool output conforming to the interface compiles
  - [x] 5.3: Mock `execFileSync` / `spawnSync` for subprocess tests -- do not require Semgrep installed in CI
  - [x] 5.4: Verify 100% coverage of analyzer.ts

- [x] Task 6: Integration verification (AC: #1, #2)
  - [x] 6.1: Run `npm run build` -- verify tsup compiles the new module
  - [x] 6.2: Run `npm run test:unit` -- all tests pass
  - [x] 6.3: Verify module boundary: `src/modules/observability/index.ts` is the only public export surface

## Dev Notes

### Architecture References

This story implements architecture Decision 1 (Static Analysis via Configurable Analyzer) and Decision 6 (Module Structure) from `_bmad-output/planning-artifacts/architecture-operational-excellence.md`.

### Key Interfaces (from Architecture Decision 1)

```typescript
interface AnalyzerResult {
  tool: string;  // 'semgrep' | 'eslint' | 'custom'
  gaps: ObservabilityGap[];
  summary: {
    totalFunctions: number;
    functionsWithLogs: number;
    errorHandlersWithoutLogs: number;
    coveragePercent: number;
    levelDistribution: Record<string, number>;
  };
}

interface ObservabilityGap {
  file: string;
  line: number;
  type: string;  // rule ID from analyzer
  description: string;
  severity: 'error' | 'warning' | 'info';
}
```

### Semgrep JSON Output Format

Semgrep `--json` output structure (relevant fields):

```json
{
  "results": [
    {
      "check_id": "catch-without-logging",
      "path": "src/lib/docker.ts",
      "start": { "line": 42, "col": 5 },
      "extra": {
        "message": "Catch block without error logging",
        "severity": "WARNING"
      }
    }
  ]
}
```

Map to `ObservabilityGap`: `path` -> `file`, `start.line` -> `line`, `check_id` -> `type`, `extra.message` -> `description`, `extra.severity` (lowercased) -> `severity`.

### Module Boundary Rules

- Only `index.ts` exports public API (re-exports from internal modules)
- No circular imports between modules
- Use `Result<T>` for all public functions (never throw)
- Keep each file under 300 lines

### Existing Types to Use

- `Result<T>`, `ok()`, `fail()` from `src/types/result.ts`
- `ObservabilityBackend` types already exist in `src/types/observability.ts` -- the analyzer module is separate from the backend query module

### Semgrep Subprocess Pattern

```typescript
import { execFileSync } from 'node:child_process';

function runSemgrep(projectDir: string, rulesDir: string): Result<SemgrepRawOutput> {
  try {
    const stdout = execFileSync('semgrep', [
      'scan', '--config', rulesDir, '--json', projectDir
    ], { encoding: 'utf-8', timeout: 60_000 });
    return ok(JSON.parse(stdout));
  } catch (error) {
    return fail(`Semgrep scan failed: ${String(error)}`);
  }
}
```

### Coverage Computation Note

Semgrep's JSON output gives us match counts per rule, but NOT a function count directly. The `function-no-debug-log` rule tells us which functions LACK logging. To get `totalFunctions`, we need the total scanned. Options:
1. Use `semgrep scan --json` stats field which includes paths scanned
2. Count functions separately via a simpler heuristic (count `function` and `=>` patterns)
3. Use `totalFunctions = functionsWithLogs + matchCount` from the function-no-debug-log rule

Option 3 is cleanest: the number of matches for `function-no-debug-log` = functions WITHOUT logs. `totalFunctions = functionsWithLogs + functionsWithoutLogs`. `functionsWithLogs = totalFunctions - functionsWithoutLogs`. This gives exact coverage without a separate scan.

### What Already Exists (from Story 1.1)

- `patches/observability/*.yaml` -- Semgrep rules (3 files: catch-without-logging, function-no-debug-log, error-path-no-log)
- `patches/observability/__tests__/` -- Semgrep test fixtures
- `src/types/observability.ts` -- ObservabilityBackend interface (for runtime, not static analysis)
- `src/types/result.ts` -- Result<T> type

### What This Story Does NOT Include

- No coverage state tracking -- that's Story 1.3
- No runtime validation -- that's Epic 2
- No audit integration -- that's Epic 3
- No hook enforcement -- that's Story 2.2
- No CLI command for running analysis -- the module is consumed programmatically by audit (Epic 3)

### Dependencies

- **Depends on:** Story 1.1 (Semgrep rules in `patches/observability/`) -- DONE
- **Depended on by:** Story 1.3 (coverage state tracking uses AnalyzerResult), Epic 3 (audit coordinator calls analyze())

### References

- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 1] -- AnalyzerResult interface, configurable analyzer
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 6] -- Module structure: `src/modules/observability/`
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 7] -- Semgrep integration, subprocess spawning
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 1.2] -- Acceptance criteria and user story

## Verification Findings

_Last updated: 2026-03-19T08:03Z_

The following ACs failed black-box verification:

### AC 5: Coverage computation (20 functions, 15 with logs → 75%)
**Verdict:** FAIL
**Error output:**
```
Two bugs in computeSummary():

1. Rule ID mismatch — compares g.type === "function-no-debug-log" but semgrep produces path-prefixed IDs like "tmp.test-ac5c.patches.observability.function-no-debug-log". The endsWith() or includes() check is needed instead of strict equality.

2. totalFunctions has no source of truth — defaults to functionsWithoutLogs count (which is 0 due to bug 1), not the actual number of functions in the project. Even with bug 1 fixed, it would report 0% coverage (5 total, 0 with logs) instead of 75% (20 total, 15 with logs). The computeSummary must accept totalFunctions as input or derive it correctly.
```

### Infrastructure fix applied this session
- tsup.config.ts updated to include `src/modules/observability/index.ts` as a separate entry point, preventing tree-shaking of the analyzer module from dist/

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/1-2-analyzer-module-interface.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/observability/AGENTS.md)
- [ ] Exec-plan created in `docs/exec-plans/active/1-2-analyzer-module-interface.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Subprocess calls mocked (no Semgrep required in CI)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
