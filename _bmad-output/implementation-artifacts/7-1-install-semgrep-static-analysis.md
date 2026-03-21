# Story 7.1: Install Semgrep Static Analysis

Status: verifying

## Story

As an operator onboarding a project with codeharness,
I want Semgrep installed automatically as part of dependency setup,
so that `codeharness audit` observability static analysis passes without manual tool installation.

## Goal

Close the compliance gap where `codeharness audit` reports "static analysis skipped -- install semgrep" as a warning. Add Semgrep to the dependency registry so it is installed alongside other tools (showboat, beads, agent-browser) during `codeharness init`. Verify end-to-end that the audit observability dimension reports actual scan results instead of a skip warning.

## Context

The observability analyzer module (`src/modules/observability/analyzer.ts`) already handles Semgrep integration:
- `checkSemgrepInstalled()` checks PATH for `semgrep`
- `runSemgrep()` spawns `semgrep scan --config <rulesDir> --json <projectDir>`
- If Semgrep is missing, returns `skipped: true` with `skipReason: "static analysis skipped -- install semgrep"`

The audit dimension (`src/modules/audit/dimensions.ts`) propagates this skip as a `warn` gap with suggested fix `"Install Semgrep: pip install semgrep"`.

The `DEPENDENCY_REGISTRY` in `src/lib/deps.ts` handles auto-installation of external tools via pip/pipx/npm fallback chains. Semgrep is NOT in this registry — that is the gap.

The verification Dockerfile (`templates/Dockerfile.verify`) already installs Semgrep via `pipx install semgrep`. Semgrep rules exist at `patches/observability/*.yaml`. The code infrastructure is complete; only the host-side auto-install entry is missing.

## Acceptance Criteria

1. **Given** the `DEPENDENCY_REGISTRY` in `src/lib/deps.ts`, **When** a developer reads the registry, **Then** Semgrep is listed with `pipx install semgrep` as the primary install command and `pip install semgrep` as fallback, with `checkCommand: { cmd: 'semgrep', args: ['--version'] }` and `critical: false`. <!-- verification: cli-verifiable -->

2. **Given** a fresh environment without Semgrep, **When** `installAllDependencies()` runs (via `codeharness init`), **Then** Semgrep is installed (or reports a non-fatal failure if Python is unavailable). <!-- verification: integration-required -->

3. **Given** Semgrep is installed on the host, **When** `codeharness audit` runs against the codeharness project, **Then** the observability dimension reports actual static analysis results (gap count or pass) instead of "static: skipped". <!-- verification: cli-verifiable -->

4. **Given** Semgrep rules in `patches/observability/`, **When** the analyzer runs against a project with known observability gaps (e.g., catch blocks without logging), **Then** gaps are reported with file, line, rule ID, and description. <!-- verification: cli-verifiable -->

5. **Given** the existing unit tests in `src/lib/__tests__/deps.test.ts`, **When** the Semgrep registry entry is added, **Then** tests cover the new entry: check-installed, install-success, and install-failure paths — maintaining 100% coverage on changed code. <!-- verification: cli-verifiable -->

6. **Given** `src/lib/AGENTS.md` documents the deps module, **When** Semgrep is added to the registry, **Then** AGENTS.md is updated to mention Semgrep in the dependency list. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Add Semgrep to DEPENDENCY_REGISTRY (AC: #1)
  - [x] Add entry to `src/lib/deps.ts` `DEPENDENCY_REGISTRY` array after `beads`
  - [x] Use `pipx` as primary, `pip` as fallback (matches Dockerfile.verify pattern)
  - [x] Set `critical: false` — Semgrep is optional, audit degrades gracefully
- [x] Task 2: Update unit tests (AC: #5)
  - [x] Add test cases in `src/lib/__tests__/deps.test.ts` for Semgrep registry entry
  - [x] Verify DEPENDENCY_REGISTRY length increased by 1
  - [x] Test check-installed, install-success, install-failure for Semgrep entry
- [x] Task 3: Verify audit integration (AC: #3, #4)
  - [x] Run `npx vitest` to confirm all tests pass
  - [x] Verify analyzer tests in `src/modules/observability/__tests__/analyzer.test.ts` still pass
- [x] Task 4: Update AGENTS.md (AC: #6)
  - [x] Update `src/lib/AGENTS.md` deps.ts entry to include Semgrep

## Dev Notes

### Existing Code to Modify

- **`src/lib/deps.ts`** — Add Semgrep entry to `DEPENDENCY_REGISTRY`. Follow exact pattern of existing entries (showboat, agent-browser, beads).
- **`src/lib/__tests__/deps.test.ts`** — Add test coverage for new entry.
- **`src/lib/AGENTS.md`** — Update documentation.

### DO NOT Modify

- `src/modules/observability/analyzer.ts` — Already handles Semgrep correctly. No changes needed.
- `src/modules/audit/dimensions.ts` — Already reports skip/pass correctly. No changes needed.
- `templates/Dockerfile.verify` — Already installs Semgrep. No changes needed.
- `patches/observability/*.yaml` — Rules already exist and work. No changes needed.

### Architecture Compliance

- **Result<T> pattern**: Not applicable — deps.ts uses its own DependencyResult type (pre-existing pattern).
- **<300 lines**: `deps.ts` is 155 lines, adding ~10 lines for registry entry. Well under limit.
- **Index exports**: deps.ts exports are already consumed directly, no index.ts wrapper needed (pre-existing pattern).
- **Test coverage**: 100% target on new/changed code.

### Previous Story Intelligence

This is the first story in Epic 7. Previous epics (1-6) are all done. Key patterns from recent work:
- Story 6-2 established `run-helpers.ts` extraction pattern for testability.
- Story 6-1 hit NFR9 300-line limit — not a risk here (deps.ts is small).
- Code review catches real bugs — ensure the registry entry matches the Dockerfile.verify install approach (pipx, not pip).

### References

- [Source: src/lib/deps.ts] — DEPENDENCY_REGISTRY, installDependency(), installAllDependencies()
- [Source: src/lib/__tests__/deps.test.ts] — Existing test patterns for registry entries
- [Source: src/modules/observability/analyzer.ts] — checkSemgrepInstalled(), analyze()
- [Source: src/modules/audit/dimensions.ts#checkObservability] — Audit dimension that reports Semgrep status
- [Source: templates/Dockerfile.verify#L18] — `RUN pipx install semgrep && pipx ensurepath` (reference for install approach)
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision7] — Semgrep integration architecture decision

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/7-1-install-semgrep-static-analysis-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] `src/lib/AGENTS.md` updated to include Semgrep in deps module description

## Testing Requirements

- [ ] Unit tests written for Semgrep registry entry in deps.test.ts
- [ ] Existing analyzer tests pass unchanged
- [ ] Coverage target: 100% on changed files
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — single-pass implementation, no retries needed.

### Completion Notes List
- Added Semgrep entry to DEPENDENCY_REGISTRY with pipx primary, pip fallback, critical: false
- Added 7 new test cases (registry entry tests + installDependency semgrep-specific tests)
- Updated 2 existing tests to handle 4th registry entry (semgrep) in failure scenarios
- All 2920 tests pass across 113 test files
- AGENTS.md updated to mention Semgrep in deps module description

### File List

- `src/lib/deps.ts`
- `src/lib/__tests__/deps.test.ts`
- `src/lib/AGENTS.md`
