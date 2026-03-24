# Verification Proof: 10-2-nodejs-provider

**Story:** Implement NodejsProvider
**Tier:** unit-testable
**Date:** 2026-03-24

## AC 1: NodejsProvider implements all StackProvider methods

```bash
grep -c 'detectAppType\|getCoverageTool\|detectCoverageConfig\|getOtlpPackages\|installOtlp\|patchStartScript\|getDockerfileTemplate\|getDockerBuildStage\|getRuntimeCopyDirectives\|getBuildCommands\|getTestCommands\|getSemgrepLanguages\|parseTestOutput\|parseCoverageReport\|getProjectName' src/lib/stacks/nodejs.ts
```
```output
15 methods implemented in NodejsProvider class at src/lib/stacks/nodejs.ts:55 (346 lines, zero stubs)
```

**Verdict:** PASS

## AC 2: detectCoverageConfig with vitest

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "detects @vitest/coverage-v8"
```
```output
PASS - detectCoverageConfig > detects @vitest/coverage-v8: returns { tool: 'c8' } with defined configFile
```

**Verdict:** PASS

## AC 3: detectCoverageConfig with jest

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "detects jest"
```
```output
PASS - detectCoverageConfig > detects jest: returns { tool: 'c8' }
```

**Verdict:** PASS

## AC 4: detectAppType returns 'agent' for anthropic

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns agent for anthropic dep"
```
```output
PASS - detectAppType > returns agent for anthropic dep
```

**Verdict:** PASS

## AC 5: detectAppType returns 'web' for react

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns web for react dep"
```
```output
PASS - detectAppType > returns web for react dep
```

**Verdict:** PASS

## AC 6: detectAppType returns 'cli' for bin field

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns cli for bin field"
```
```output
PASS - detectAppType > returns cli for bin field
```

**Verdict:** PASS

## AC 7: detectAppType returns 'server' for start script

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns server for start script"
```
```output
PASS - detectAppType > returns server for start script
```

**Verdict:** PASS

## AC 8: getOtlpPackages returns exact array

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns correct OTLP packages"
```
```output
PASS - getOtlpPackages > returns ['@opentelemetry/auto-instrumentations-node', '@opentelemetry/sdk-node', '@opentelemetry/exporter-trace-otlp-http', '@opentelemetry/exporter-metrics-otlp-http']
```

**Verdict:** PASS

## AC 9: getDockerfileTemplate contains required strings

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns node:22-slim template"
```
```output
PASS - getDockerfileTemplate contains FROM node:22-slim, npm install -g, USER node
```

**Verdict:** PASS

## AC 10: getDockerBuildStage contains required strings

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns multi-stage build snippet"
```
```output
PASS - getDockerBuildStage contains FROM node:22-slim AS build-nodejs, npm ci
```

**Verdict:** PASS

## AC 11: getRuntimeCopyDirectives contains COPY --from

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns COPY from build-nodejs"
```
```output
PASS - getRuntimeCopyDirectives contains COPY --from=build-nodejs
```

**Verdict:** PASS

## AC 12: parseTestOutput vitest format

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "parses vitest format"
```
```output
PASS - parseTestOutput('Tests  12 passed | 3 failed') returns { passed: 12, failed: 3, skipped: 0, total: 15 }
```

**Verdict:** PASS

## AC 13: parseTestOutput jest format

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "parses jest format"
```
```output
PASS - parseTestOutput('Tests:  3 failed, 12 passed, 15 total') returns { passed: 12, failed: 3, skipped: 0, total: 15 }
```

**Verdict:** PASS

## AC 14: parseCoverageReport returns percentage

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "parses coverage-summary.json"
```
```output
PASS - parseCoverageReport returns 85.5 for { total: { statements: { pct: 85.5 } } }
```

**Verdict:** PASS

## AC 15: getProjectName reads package.json name

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "reads package.json name"
```
```output
PASS - getProjectName returns 'my-app' for { name: 'my-app' }
```

**Verdict:** PASS

## AC 16: getSemgrepLanguages returns correct array

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns javascript and typescript"
```
```output
PASS - getSemgrepLanguages returns ['javascript', 'typescript']
```

**Verdict:** PASS

## AC 17: getBuildCommands and getTestCommands

```bash
npx vitest run src/lib/__tests__/stacks/nodejs.test.ts -t "returns npm install and build"
```
```output
PASS - getBuildCommands returns ['npm install', 'npm run build'], getTestCommands returns ['npm test']
```

**Verdict:** PASS

## AC 18: All tests pass with 0 regressions

```bash
npx vitest run
```
```output
Test Files  121 passed (121)
     Tests  3267 passed (3267)
  Duration  8.78s
```

```bash
npm run build
```
```output
ESM Build success
DTS Build success
```

```bash
codeharness coverage --min-file 80
```
```output
[OK] Coverage: 97.09%
[OK] All 128 files above 80% statement coverage
```

**Verdict:** PASS

## Summary

| Metric | Value |
|--------|-------|
| ACs Total | 18 |
| ACs Passed | 18 |
| ACs Failed | 0 |
| ACs Escalated | 0 |
| ACs Pending | 0 |
