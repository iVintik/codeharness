# Story 10-3: Implement PythonProvider

## Status: backlog

## Story

As a developer,
I want all Python-specific logic in one file,
So that Python behavior is encapsulated and testable in isolation.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/stacks/python.ts` exists, when inspected, then it implements all `StackProvider` methods for Python: requirements.txt/pyproject.toml/setup.py detection, coverage.py, pip/pipx OTLP packages, Dockerfile template <!-- verification: cli-verifiable -->
- [ ] AC2: Given all Python if/else branches are removed from consumer files, when `npm test` runs, then all tests pass <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 2 (Stack Provider Pattern).** Same structure as NodejsProvider.

Extract Python-specific logic from these current locations:

- **Coverage detection**: `src/lib/coverage.ts` has Python coverage.py detection. Move into `PythonProvider.detectCoverageConfig()`.
- **Test output parsing**: `src/lib/coverage.ts` `parseTestCounts()` has pytest output patterns (`X passed, Y failed`). Move into `PythonProvider.parseTestOutput()`.
- **Coverage report parsing**: `src/lib/coverage.ts` reads coverage.py XML/JSON output. Move into `PythonProvider.parseCoverageReport()`.
- **OTLP packages**: `src/lib/otlp.ts` has `opentelemetry-sdk`, `opentelemetry-instrumentation` pip packages. Move into `PythonProvider.getOtlpPackages()`.
- **OTLP install**: `src/lib/otlp.ts` runs `pip install` / `pipx inject` for OTLP deps. Move into `PythonProvider.installOtlp()`.
- **Dockerfile template**: `src/modules/infra/dockerfile-template.ts` has Python Dockerfile generation. Move into `PythonProvider.getDockerfileTemplate()`, `getDockerBuildStage()`, `getRuntimeCopyDirectives()`.
- **Docs scaffold**: `src/modules/infra/docs-scaffold.ts` generates AGENTS.md with `pytest`, `pip install` commands. Move into `PythonProvider.getBuildCommands()`, `getTestCommands()`.
- **App type detection**: `src/lib/stack-detect.ts` checks for Flask/Django/FastAPI (server), CLI entry points, library patterns. Move into `PythonProvider.detectAppType()`.
- **Project name**: Read from `pyproject.toml` `[project] name` or `setup.py` name. Move into `PythonProvider.getProjectName()`.

Markers: `['requirements.txt', 'pyproject.toml', 'setup.py']`. DisplayName: `'Python (requirements.txt)'` (or whichever marker matched). Semgrep languages: `['python']`.

## Files to Change

- `src/lib/stacks/python.ts` — Create. Implement `PythonProvider` class with all `StackProvider` methods
- `src/lib/stacks/registry.ts` — Register PythonProvider: `registry.set('python', new PythonProvider())`
- `src/lib/coverage.ts` — Remove Python-specific branches (coverage.py detection, pytest output parsing)
- `src/lib/otlp.ts` — Remove Python-specific OTLP package lists and install logic
- `src/modules/infra/dockerfile-template.ts` — Remove Python Dockerfile template generation
- `src/modules/infra/docs-scaffold.ts` — Remove Python-specific command generation
- `src/lib/stack-detect.ts` — Remove Python app type detection logic
