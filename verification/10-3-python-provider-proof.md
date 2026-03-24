# Verification Proof: 10-3-python-provider

**Story:** Implement PythonProvider
**Tier:** unit-testable
**Date:** 2026-03-24

## AC 1: PythonProvider implements all StackProvider methods

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "implements all required StackProvider methods"
```
```output
PASS - PythonProvider implements all 14 required StackProvider methods: detectAppType, getCoverageTool, detectCoverageConfig, getOtlpPackages, installOtlp, getDockerfileTemplate, getDockerBuildStage, getRuntimeCopyDirectives, getBuildCommands, getTestCommands, getSemgrepLanguages, parseTestOutput, parseCoverageReport, getProjectName. Properties: name='python', markers=['requirements.txt','pyproject.toml','setup.py'], displayName='Python'.
```

**Verdict:** PASS

## AC 2: detectCoverageConfig with pytest-cov in requirements.txt

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "detects pytest-cov in requirements.txt"
```
```output
PASS - detectCoverageConfig > detects pytest-cov in requirements.txt (AC2): returns { tool: 'coverage-py' } with configFile containing requirements.txt
```

**Verdict:** PASS

## AC 3: detectCoverageConfig with coverage in pyproject.toml

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "detects coverage in pyproject.toml"
```
```output
PASS - detectCoverageConfig > detects coverage in pyproject.toml (AC3): returns { tool: 'coverage-py' } with configFile containing pyproject.toml
```

**Verdict:** PASS

## AC 4: detectAppType returns 'agent' for anthropic

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns agent when anthropic"
```
```output
PASS - detectAppType > returns "agent" when anthropic is in requirements.txt (AC4)
```

**Verdict:** PASS

## AC 5: detectAppType returns 'web' for flask + templates/

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns web when flask"
```
```output
PASS - detectAppType > returns "web" when flask is in deps AND templates/ exists (AC5)
```

**Verdict:** PASS

## AC 6: detectAppType returns 'server' for fastapi without templates/static

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns server when fastapi"
```
```output
PASS - detectAppType > returns "server" when fastapi is in deps but no templates/static dirs (AC6)
```

**Verdict:** PASS

## AC 7: detectAppType returns 'server' for django + manage.py

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns server when django"
```
```output
PASS - detectAppType > returns "server" when django is in deps with manage.py but no templates/static (AC7)
```

**Verdict:** PASS

## AC 8: detectAppType returns 'server' with generic deps + app.py

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns server when generic deps and app.py"
```
```output
PASS - detectAppType > returns "server" when generic deps and app.py exists (AC8)
```

**Verdict:** PASS

## AC 9: detectAppType returns 'generic' with no entry-point

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns generic when generic deps and no entry-point"
```
```output
PASS - detectAppType > returns "generic" when generic deps and no entry-point files (AC9)
```

**Verdict:** PASS

## AC 10: getOtlpPackages returns exact packages

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns exact OTLP packages"
```
```output
PASS - getOtlpPackages > returns ['opentelemetry-distro', 'opentelemetry-exporter-otlp'] (AC10)
```

**Verdict:** PASS

## AC 11: getDockerfileTemplate contains required elements

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "contains FROM python"
```
```output
PASS - getDockerfileTemplate contains FROM python:3.12-slim, pip install, USER nobody (AC11)
```

**Verdict:** PASS

## AC 12: getDockerBuildStage contains multi-stage build

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "contains FROM python:3.12-slim AS build-python"
```
```output
PASS - getDockerBuildStage contains FROM python:3.12-slim AS build-python, pip install --target=/build/dist . (AC12)
```

**Verdict:** PASS

## AC 13: getRuntimeCopyDirectives contains COPY --from=build-python

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "contains COPY --from=build-python"
```
```output
PASS - getRuntimeCopyDirectives contains COPY --from=build-python /build/dist /opt/app/python/ (AC13)
```

**Verdict:** PASS

## AC 14: parseTestOutput parses "12 passed, 3 failed"

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "parses pytest format: 12 passed, 3 failed"
```
```output
PASS - parseTestOutput('12 passed, 3 failed') returns { passed: 12, failed: 3, skipped: 0, total: 15 } (AC14)
```

**Verdict:** PASS

## AC 15: parseTestOutput parses "5 passed"

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "parses pytest format with only passed"
```
```output
PASS - parseTestOutput('5 passed') returns { passed: 5, failed: 0, skipped: 0, total: 5 } (AC15)
```

**Verdict:** PASS

## AC 16: parseCoverageReport reads coverage.json

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "parses coverage.json with totals"
```
```output
PASS - parseCoverageReport returns 72.3 for { totals: { percent_covered: 72.3 } } (AC16)
```

**Verdict:** PASS

## AC 17: parseCoverageReport returns 0 when no file

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns 0 when coverage.json does not exist"
```
```output
PASS - parseCoverageReport returns 0 in empty directory (AC17)
```

**Verdict:** PASS

## AC 18: getProjectName reads pyproject.toml

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns name from pyproject.toml"
```
```output
PASS - getProjectName returns 'my-python-app' for pyproject.toml with [project] name = "my-python-app" (AC18)
```

**Verdict:** PASS

## AC 19: getSemgrepLanguages returns ['python']

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "returns python"
```
```output
PASS - getSemgrepLanguages returns ['python'] (AC19)
```

**Verdict:** PASS

## AC 20: getBuildCommands and getTestCommands

```bash
npx vitest run src/lib/__tests__/stacks/python.test.ts -t "getBuildCommands returns"
```
```output
PASS - getBuildCommands returns ['pip install -r requirements.txt'], getTestCommands returns ['python -m pytest'] (AC20)
```

**Verdict:** PASS

## AC 21: All tests pass with 0 regressions

```bash
npx vitest run
```
```output
Test Files  122 passed (122)
     Tests  3342 passed (3342)
  Duration  8.80s
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
[OK] Coverage: 97.11%
[OK] All 129 files above 80% statement coverage
```

**Verdict:** PASS

## Summary

| Metric | Value |
|--------|-------|
| ACs Total | 21 |
| ACs Passed | 21 |
| ACs Failed | 0 |
| ACs Escalated | 0 |
| ACs Pending | 0 |
