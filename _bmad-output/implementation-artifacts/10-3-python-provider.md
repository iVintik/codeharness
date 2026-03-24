# Story 10-3: Implement PythonProvider
<!-- verification-tier: unit-testable -->

## Status: verifying

## Story

As a developer,
I want all Python-specific logic in one file,
So that Python behavior is encapsulated and testable in isolation.

## Acceptance Criteria

- [x] AC1: Given `src/lib/stacks/python.ts` exists, when inspected, then it implements all `StackProvider` methods for Python: `detectAppType()` (server/cli/web/agent/generic from requirements.txt/pyproject.toml/setup.py), `getCoverageTool()` (returns `'coverage-py'`), `detectCoverageConfig()` (checks requirements.txt and pyproject.toml for `pytest-cov` or `coverage`), `getOtlpPackages()` (returns `['opentelemetry-distro', 'opentelemetry-exporter-otlp']`), `installOtlp()` (runs `pip install` with `pipx install` fallback), `getDockerfileTemplate()` (python:3.12-slim based), `getDockerBuildStage()` (multi-stage build snippet), `getRuntimeCopyDirectives()` (COPY from build-python), `getBuildCommands()` (`['pip install -r requirements.txt']`), `getTestCommands()` (`['python -m pytest']`), `getSemgrepLanguages()` (`['python']`), `parseTestOutput()` (pytest format parsing), `parseCoverageReport()` (coverage.json parsing), `getProjectName()` (reads pyproject.toml `[project] name` or directory basename) <!-- verification: cli-verifiable -->
- [x] AC2: Given a temporary directory with a `requirements.txt` containing `pytest-cov`, when `PythonProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'coverage-py' }` with a defined `configFile` <!-- verification: cli-verifiable -->
- [x] AC3: Given a temporary directory with a `pyproject.toml` containing `coverage` in its content, when `PythonProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'coverage-py' }` <!-- verification: cli-verifiable -->
- [x] AC4: Given a temporary directory with a `requirements.txt` containing `anthropic`, when `PythonProvider.detectAppType()` is called, then it returns `'agent'` <!-- verification: cli-verifiable -->
- [x] AC5: Given a temporary directory with a `requirements.txt` containing `flask` and a `templates/` directory, when `PythonProvider.detectAppType()` is called, then it returns `'web'` <!-- verification: cli-verifiable -->
- [x] AC6: Given a temporary directory with a `requirements.txt` containing `fastapi` but no `templates/` or `static/` directory, when `PythonProvider.detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC7: Given a temporary directory with a `requirements.txt` containing `django` and a `manage.py` file, when `PythonProvider.detectAppType()` is called, then it returns `'server'` (web framework without templates/static dirs) <!-- verification: cli-verifiable -->
- [x] AC8: Given a temporary directory with only a `requirements.txt` containing generic deps (no agent/web/server markers), and an `app.py` file, when `PythonProvider.detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC9: Given a temporary directory with only a `requirements.txt` containing generic deps and no entry-point files, when `PythonProvider.detectAppType()` is called, then it returns `'generic'` <!-- verification: cli-verifiable -->
- [x] AC10: Given `PythonProvider.getOtlpPackages()` is called, when the result is inspected, then it returns exactly `['opentelemetry-distro', 'opentelemetry-exporter-otlp']` <!-- verification: cli-verifiable -->
- [x] AC11: Given `PythonProvider.getDockerfileTemplate()` is called, when the result is inspected, then it contains `FROM python:3.12-slim`, `pip install`, and `USER nobody` <!-- verification: cli-verifiable -->
- [x] AC12: Given `PythonProvider.getDockerBuildStage()` is called, when the result is inspected, then it contains `FROM python:3.12-slim AS build-python` and `pip install --target=/build/dist .` <!-- verification: cli-verifiable -->
- [x] AC13: Given `PythonProvider.getRuntimeCopyDirectives()` is called, when the result is inspected, then it contains `COPY --from=build-python` <!-- verification: cli-verifiable -->
- [x] AC14: Given pytest output text `12 passed, 3 failed`, when `PythonProvider.parseTestOutput()` is called, then it returns `{ passed: 12, failed: 3, skipped: 0, total: 15 }` <!-- verification: cli-verifiable -->
- [x] AC15: Given pytest output text `5 passed`, when `PythonProvider.parseTestOutput()` is called, then it returns `{ passed: 5, failed: 0, skipped: 0, total: 5 }` <!-- verification: cli-verifiable -->
- [x] AC16: Given a directory with `coverage.json` containing `{ "totals": { "percent_covered": 72.3 } }`, when `PythonProvider.parseCoverageReport()` is called, then it returns `72.3` <!-- verification: cli-verifiable -->
- [x] AC17: Given a directory without `coverage.json`, when `PythonProvider.parseCoverageReport()` is called, then it returns `0` <!-- verification: cli-verifiable -->
- [x] AC18: Given a directory with a `pyproject.toml` containing `[project]\nname = "my-python-app"`, when `PythonProvider.getProjectName()` is called, then it returns `'my-python-app'` <!-- verification: cli-verifiable -->
- [x] AC19: Given `PythonProvider.getSemgrepLanguages()` is called, when the result is inspected, then it returns `['python']` <!-- verification: cli-verifiable -->
- [x] AC20: Given `PythonProvider.getBuildCommands()` and `getTestCommands()` are called, when the results are inspected, then they return `['pip install -r requirements.txt']` and `['python -m pytest']` respectively <!-- verification: cli-verifiable -->
- [x] AC21: Given unit tests exist in `src/lib/__tests__/stacks/python.test.ts`, when `npm test` runs, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [x] Task 1: Create `src/lib/stacks/python.ts` with `PythonProvider` class skeleton — Set `name: 'python'`, `markers: ['requirements.txt', 'pyproject.toml', 'setup.py']`, `displayName: 'Python'`. Import shared helpers from `./utils.js`.
- [x] Task 2: Implement `PythonProvider.detectAppType()` — Extract Python app type detection from `src/lib/stack-detect.ts` `detectAppType()` (the `stack === 'python'` branch). Read `requirements.txt`, `pyproject.toml`, `setup.py` content. Check deps for agent SDKs (`anthropic`, `openai`, `langchain`, `llama-index`, `traceloop-sdk`), web frameworks (`flask`, `django`, `fastapi`, `streamlit`) with `templates/`+`static/` dir checks, entry-point files (`app.py`, `main.py`, `manage.py`), fallback to `generic`.
- [x] Task 3: Add `getPythonDepsContent()` and `hasPythonDep()` helpers to `src/lib/stacks/utils.ts` — Extract from `src/lib/stack-detect.ts`. `getPythonDepsContent(dir)` reads and concatenates `requirements.txt`, `pyproject.toml`, `setup.py`. `hasPythonDep(content, dep)` matches package name with word-boundary regex to avoid substring false positives.
- [x] Task 4: Implement `PythonProvider.getCoverageTool()` — Return `'coverage-py'` as the canonical Python coverage tool.
- [x] Task 5: Implement `PythonProvider.detectCoverageConfig()` — Extract from `coverage.ts` `detectPythonCoverageTool()`. Check `requirements.txt` and `pyproject.toml` for `pytest-cov` or `coverage`. Return `CoverageToolInfo` with `tool: 'coverage-py'` and optional `configFile`.
- [x] Task 6: Implement `PythonProvider.getOtlpPackages()` — Return the `PYTHON_OTLP_PACKAGES` array from `otlp.ts`: `['opentelemetry-distro', 'opentelemetry-exporter-otlp']`.
- [x] Task 7: Implement `PythonProvider.installOtlp()` — Extract from `otlp.ts` `installPythonOtlp()`. Primary: `pip install` both packages. Fallback: `pipx install` each package individually. Return `OtlpResult` with success/failure.
- [x] Task 8: Implement `PythonProvider.getDockerfileTemplate()` — Extract from `dockerfile-template.ts` `pythonTemplate()`. Return the python:3.12-slim Dockerfile string.
- [x] Task 9: Implement `PythonProvider.getDockerBuildStage()` — Extract from `dockerfile-template.ts` `pythonBuildStage()`. Return multi-stage build snippet with `FROM python:3.12-slim AS build-python`.
- [x] Task 10: Implement `PythonProvider.getRuntimeCopyDirectives()` — Extract from `dockerfile-template.ts` `runtimeCopyDirectives()` (the python branch). Return `COPY --from=build-python /build/dist /opt/app/python/`.
- [x] Task 11: Implement `PythonProvider.getBuildCommands()` — Return `['pip install -r requirements.txt']`.
- [x] Task 12: Implement `PythonProvider.getTestCommands()` — Return `['python -m pytest']`.
- [x] Task 13: Implement `PythonProvider.getSemgrepLanguages()` — Return `['python']`.
- [x] Task 14: Implement `PythonProvider.parseTestOutput()` — Extract pytest parsing from `coverage.ts` `parseTestCounts()`. Pytest format: `N passed, M failed` or `N passed`. Return `TestCounts`.
- [x] Task 15: Implement `PythonProvider.parseCoverageReport()` — Extract from `coverage.ts` `parsePythonCoverage()`. Read `coverage.json` in project dir, parse `totals.percent_covered`. Return `0` if file missing or malformed.
- [x] Task 16: Implement `PythonProvider.getProjectName()` — Parse `pyproject.toml` for `[project]\nname = "..."` using regex. Fallback to `setup.py` `name='...'` pattern. Return `null` if not found.
- [x] Task 17: Register `PythonProvider` in `src/lib/stacks/index.ts` — Add `import { PythonProvider } from './python.js'` and `registerProvider(new PythonProvider())` alongside existing NodejsProvider registration.
- [x] Task 18: Create `src/lib/__tests__/stacks/python.test.ts` — Unit tests for every method. Use temp directories with fixture files. Cover: each app type variant (agent, web, server, cli, generic), coverage tool detection (pytest-cov in requirements.txt, coverage in pyproject.toml, neither), test output parsing (pytest passed+failed, passed only, no match), coverage report parsing (valid JSON, missing file, malformed), project name (pyproject.toml present, missing, no name field), OTLP packages, Dockerfile content, build/test commands, semgrep languages.
- [x] Task 19: Verify the existing test suite still passes — run `npm test` and confirm 0 regressions.

## Technical Notes

**Decision 2 (Stack Provider Pattern).** Same structure as NodejsProvider (story 10-2). This is the second provider implementation.

### What moves INTO PythonProvider

| Method | Source File | Source Function/Branch |
|--------|------------|----------------------|
| `detectAppType()` | `src/lib/stack-detect.ts` | `detectAppType()` → `stack === 'python'` branch |
| `getCoverageTool()` | `src/lib/coverage.ts` | `detectCoverageTool()` → `stack === 'python'` branch |
| `detectCoverageConfig()` | `src/lib/coverage.ts` | `detectPythonCoverageTool()` |
| `getOtlpPackages()` | `src/lib/otlp.ts` | `PYTHON_OTLP_PACKAGES` constant |
| `installOtlp()` | `src/lib/otlp.ts` | `installPythonOtlp()` |
| `getDockerfileTemplate()` | `src/modules/infra/dockerfile-template.ts` | `pythonTemplate()` |
| `getDockerBuildStage()` | `src/modules/infra/dockerfile-template.ts` | `pythonBuildStage()` |
| `getRuntimeCopyDirectives()` | `src/modules/infra/dockerfile-template.ts` | `runtimeCopyDirectives()` python branch |
| `getBuildCommands()` | `src/modules/infra/docs-scaffold.ts` | `generateAgentsMdContent()` python branch |
| `getTestCommands()` | `src/modules/infra/docs-scaffold.ts` | `generateAgentsMdContent()` python branch |
| `getSemgrepLanguages()` | New | `['python']` |
| `parseTestOutput()` | `src/lib/coverage.ts` | `parseTestCounts()` pytest branch |
| `parseCoverageReport()` | `src/lib/coverage.ts` | `parsePythonCoverage()` |
| `getProjectName()` | New | Parse `pyproject.toml` `[project] name` or `setup.py` `name=` |

### What moves INTO shared utils

| Helper | Source File | Notes |
|--------|------------|-------|
| `getPythonDepsContent()` | `src/lib/stack-detect.ts` | Reads requirements.txt + pyproject.toml + setup.py |
| `hasPythonDep()` | `src/lib/stack-detect.ts` | Word-boundary regex match for Python package names |

### Important: Do NOT remove consumer branches yet

This story implements the provider methods only. Consumer files (`coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, `stack-detect.ts`) keep their existing if/else branches for now. Story 10-5 migrates consumers to use `provider.method()` and removes the branches. This avoids a big-bang migration.

### Python app type detection constants

From `src/lib/stack-detect.ts`:
- `AGENT_DEPS_PYTHON = ['anthropic', 'openai', 'langchain', 'llama-index', 'traceloop-sdk']`
- `PYTHON_WEB_FRAMEWORKS = ['flask', 'django', 'fastapi', 'streamlit']`
- Server entry points: `app.py`, `main.py`, `manage.py`
- Web detection requires framework dep AND (`templates/` or `static/` directory)

### CoverageToolInfo mapping

The `CoverageToolInfo` in `stacks/types.ts` has `{ tool: CoverageToolName; configFile?: string }`. The current `coverage.ts` `CoverageToolInfo` has `{ tool: string; runCommand: string; reportFormat: string }`. The provider's `detectCoverageConfig()` returns the stacks/types version. The `runCommand` and `reportFormat` can be derived from the tool name by the consumer or added to the provider as separate methods if needed during story 10-5.

### OTLP install strategy

`installOtlp()` uses a two-chain fallback: primary `pip install opentelemetry-distro opentelemetry-exporter-otlp`, fallback `pipx install` for each package individually (pipx only accepts one package at a time). Returns `OtlpResult` matching the interface in `stacks/types.ts`.

## Dev Notes

- The `NodejsProvider` in `src/lib/stacks/nodejs.ts` is the reference implementation — follow its structure exactly.
- Registration in `src/lib/stacks/index.ts` already registers NodejsProvider; add PythonProvider registration alongside it.
- `src/lib/stacks/utils.ts` already has `readJsonSafe()`, `readTextSafe()`, `getNodeDeps()` — add `getPythonDepsContent()` and `hasPythonDep()` there.
- No `patchStartScript()` method for Python — the OTLP Python wrapper (`opentelemetry-instrument`) is configured via env vars, not source patching.

## Files to Change

- `src/lib/stacks/python.ts` — Create. Implement `PythonProvider` class with all `StackProvider` methods
- `src/lib/stacks/utils.ts` — Add `getPythonDepsContent()` and `hasPythonDep()` helpers (extracted from `stack-detect.ts`)
- `src/lib/stacks/index.ts` — Register PythonProvider: `registerProvider(new PythonProvider())`
- `src/lib/__tests__/stacks/python.test.ts` — Create. Comprehensive unit tests for all PythonProvider methods

## File List

- `src/lib/stacks/python.ts` — Created. Full PythonProvider implementation with all StackProvider methods.
- `src/lib/stacks/utils.ts` — Modified. Added `getPythonDepsContent()` and `hasPythonDep()` helpers, plus `join` import from `node:path`.
- `src/lib/stacks/index.ts` — Modified. Added PythonProvider import and registration.
- `src/lib/__tests__/stacks/python.test.ts` — Created. 62 unit tests covering all methods, edge cases, and interface compliance.

## Change Log

- 2026-03-24: Implemented full PythonProvider (story 10-3) — all 19 tasks complete, 62 tests added, 0 regressions across 3329 existing tests.
- 2026-03-24: Adversarial code review — 4 issues found (1 HIGH, 3 MEDIUM), all fixed. (1) HIGH: detectCoverageConfig used substring includes() instead of hasPythonDep() for requirements.txt, causing false positives on packages with "coverage" as substring. (2) MEDIUM: installOtlp pipx fallback reported empty packagesInstalled on partial failure. (3) MEDIUM: getProjectName regex could cross TOML section boundaries. (4) MEDIUM: No direct unit tests for getPythonDepsContent/hasPythonDep utils. Added 13 new tests (75 total). Coverage: 97.11%, all files above 80% floor.

## Dev Agent Record

### Implementation Plan

Followed the NodejsProvider reference implementation pattern exactly. Extracted Python-specific logic from existing source files (stack-detect.ts, coverage.ts, otlp.ts, dockerfile-template.ts) into the new PythonProvider class. Added shared Python helpers (getPythonDepsContent, hasPythonDep) to utils.ts. Consumer files left untouched per story instructions (story 10-5 handles migration).

### Completion Notes

All 19 tasks implemented and verified. 62 new tests pass. Full test suite (3329 tests, 122 files) passes with 0 regressions. Story marked for review.
