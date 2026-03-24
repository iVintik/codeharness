# Verification Proof: 10-4-rust-provider

**Story:** Implement RustProvider
**Tier:** unit-testable
**Date:** 2026-03-24

## AC 1: RustProvider implements all StackProvider methods

```bash
grep -c 'detectAppType\|getCoverageTool\|detectCoverageConfig\|getOtlpPackages\|installOtlp\|getDockerfileTemplate\|getDockerBuildStage\|getRuntimeCopyDirectives\|getBuildCommands\|getTestCommands\|getSemgrepLanguages\|parseTestOutput\|parseCoverageReport\|getProjectName' src/lib/stacks/rust.ts
```
```output
28
```

All 14 StackProvider methods implemented with 28 references in rust.ts.

**Verdict:** PASS

## AC 2: detectAppType returns 'agent' for async-openai

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns agent for async-openai" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 3: detectAppType returns 'server' for actix-web

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns server for actix-web" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 4: detectAppType returns 'server' for axum

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns server for axum" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 5: detectAppType returns 'server' for rocket

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns server for rocket" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 6: detectAppType returns 'cli' for [[bin]] section

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns cli for" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 7: detectAppType returns 'generic' for [lib] only

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns generic for .lib." 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 8: detectAppType returns 'generic' for minimal Cargo.toml

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns generic for minimal" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 9: getCoverageTool returns 'tarpaulin'

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns tarpaulin" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 10: detectCoverageConfig returns tarpaulin for non-workspace

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns tarpaulin config for standard" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 11: detectCoverageConfig handles workspace projects

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns tarpaulin config for workspace" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 12: detectCoverageConfig returns none without Cargo.toml

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns none without Cargo" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 13: getOtlpPackages returns correct array

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns correct OTLP" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 14: getDockerfileTemplate contains required directives

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "contains required directives" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 15: getDockerBuildStage contains build-rust stage

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "contains build-rust" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 16: getRuntimeCopyDirectives contains COPY --from=build-rust

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "COPY --from" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 17: parseTestOutput parses single crate output

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "parses single crate" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 18: parseTestOutput aggregates workspace output

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "aggregates workspace" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 19: parseTestOutput handles no match

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns zeros for unrecognized" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 20: parseCoverageReport reads tarpaulin JSON

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "reads tarpaulin-report" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 21: parseCoverageReport returns 0 if missing

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns 0 if file missing" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 22: getProjectName extracts name from Cargo.toml

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "extracts name from Cargo" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 23: getProjectName returns null without Cargo.toml

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns null without Cargo" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 24: getSemgrepLanguages returns ['rust']

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns rust" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  1 passed (1)
```

**Verdict:** PASS

## AC 25: getBuildCommands and getTestCommands return correct arrays

```bash
npx vitest run src/lib/__tests__/stacks/rust.test.ts -t "returns cargo" 2>&1 | grep -E 'Tests|passed'
```
```output
Tests  2 passed (2)
```

**Verdict:** PASS

## AC 26: RustProvider registered in index.ts

```bash
grep -n 'RustProvider' src/lib/stacks/index.ts
```
```output
30:import { RustProvider } from './rust.js';
34:registerProvider(new RustProvider());
```

**Verdict:** PASS

## AC 27: All tests pass with 0 regressions

```bash
npx vitest run 2>&1 | grep -E 'Test Files|Tests'
```
```output
Test Files  123 passed (123)
Tests  3399 passed (3399)
```

**Verdict:** PASS

## Summary

| Metric | Value |
|--------|-------|
| Total ACs | 27 |
| Passed | 27 |
| Failed | 0 |
| Escalated | 0 |
| Pending | 0 |
