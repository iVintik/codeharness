# Story 8.4: Register cargo-tarpaulin in dependency registry

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer initializing codeharness on a Rust project,
I want cargo-tarpaulin to be registered in the dependency registry and auto-installed if missing,
so that coverage works out of the box without manual setup.

## Acceptance Criteria

- [x] AC1: Given the dependency registry in `src/lib/deps.ts`, when inspected for `cargo-tarpaulin`, then it has `critical: false`, install command `cargo install cargo-tarpaulin`, and check command `cargo tarpaulin --version` <!-- verification: cli-verifiable -->
- [x] AC2: Given `cargo-tarpaulin` is not installed and `cargo` is available, when `installDependency()` is called with the cargo-tarpaulin spec, then it runs `cargo install cargo-tarpaulin` and verifies installation via `cargo tarpaulin --version` <!-- verification: cli-verifiable -->
- [x] AC3: Given `cargo-tarpaulin` is already installed, when `installDependency()` is called with the cargo-tarpaulin spec, then it returns `{ status: 'already-installed' }` without attempting reinstall <!-- verification: cli-verifiable -->
- [x] AC4: Given `cargo` is not available on the system, when `installDependency()` is called with the cargo-tarpaulin spec, then it returns `{ status: 'failed' }` gracefully (not critical, does not abort init) <!-- verification: cli-verifiable -->
- [x] AC5: Given `codeharness init` runs on a Rust project where `cargo-tarpaulin` is not installed, when the dependency install phase executes, then it attempts `cargo install cargo-tarpaulin` as part of the normal registry iteration <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Add cargo-tarpaulin entry to `DEPENDENCY_REGISTRY` in `src/lib/deps.ts` (AC: #1)
  - [x] 1.1 Add new `DependencySpec` object after the `bats` entry
  - [x] 1.2 Set `name: 'cargo-tarpaulin'`, `displayName: 'cargo-tarpaulin'`
  - [x] 1.3 Set `installCommands: [{ cmd: 'cargo', args: ['install', 'cargo-tarpaulin'] }]` (single command, no fallback)
  - [x] 1.4 Set `checkCommand: { cmd: 'cargo', args: ['tarpaulin', '--version'] }`
  - [x] 1.5 Set `critical: false`
- [x] Task 2: Update existing tests that assert on registry length (AC: #1)
  - [x] 2.1 Update `DEPENDENCY_REGISTRY` length assertion from `5` to `6` in `src/lib/__tests__/deps.test.ts` line 479
  - [x] 2.2 Update `DEPENDENCY_REGISTRY` names assertion to include `'cargo-tarpaulin'` in `src/lib/__tests__/deps.test.ts` line 469
  - [x] 2.3 Update any `installAllDependencies` tests that depend on exact registry contents (check mock expectations that enumerate all deps)
- [x] Task 3: Add cargo-tarpaulin-specific tests in `src/lib/__tests__/deps.test.ts` (AC: #2, #3, #4)
  - [x] 3.1 Add `describe('cargo-tarpaulin entry')` block following semgrep/bats test pattern
  - [x] 3.2 Test: returns already-installed when `cargo tarpaulin --version` succeeds
  - [x] 3.3 Test: installs via `cargo install cargo-tarpaulin` and returns installed
  - [x] 3.4 Test: returns failed when `cargo` command not found (graceful failure)
  - [x] 3.5 Test: cargo-tarpaulin is not critical
  - [x] 3.6 Test: has single install command via cargo
  - [x] 3.7 Test: check command is `cargo tarpaulin --version`
- [x] Task 4: Update `installAllDependencies` test mocks that enumerate deps by name (AC: #4)
  - [x] 4.1 In the "continues when non-critical dep fails" test (~line 320), add mock handling for `cargo` command
  - [x] 4.2 In the "prints FAIL and info messages" test (~line 438), add mock handling for `cargo` command
- [x] Task 5: Run full test suite — zero regressions

## Dev Notes

### Registry Structure

The `DEPENDENCY_REGISTRY` in `src/lib/deps.ts` (line 25) is a `readonly DependencySpec[]`. Currently has 5 entries: showboat, agent-browser, beads, semgrep, bats. Each entry has:
- `name` (string) — machine identifier
- `displayName` (string) — human-readable
- `installCommands` (array of `{ cmd, args }`) — tried in order, first success wins
- `checkCommand` (`{ cmd, args }`) — used to verify installation
- `critical` (boolean) — if true, init aborts on failure

### cargo-tarpaulin Entry

```typescript
{
  name: 'cargo-tarpaulin',
  displayName: 'cargo-tarpaulin',
  installCommands: [{ cmd: 'cargo', args: ['install', 'cargo-tarpaulin'] }],
  checkCommand: { cmd: 'cargo', args: ['tarpaulin', '--version'] },
  critical: false,
}
```

Only one install command — no fallback. `cargo` is the only way to install Rust tools. If `cargo` is missing, the install fails gracefully.

The check command is `cargo tarpaulin --version` (NOT `cargo-tarpaulin --version`). `cargo-tarpaulin` is a cargo subcommand, invoked as `cargo tarpaulin`.

### Unconditional Registry (design note)

The `DEPENDENCY_REGISTRY` is iterated for ALL projects — there's no stack-conditional filtering in `installAllDependencies()` or `installDeps()`. This means `cargo install cargo-tarpaulin` will be attempted even on Node.js/Python projects. Since `cargo` won't exist on non-Rust machines, the install will fail with `status: 'failed'` and continue (because `critical: false`). This matches how `brew install bats-core` fails gracefully on Linux.

If the user wants stack-conditional dependency filtering in the future, that's a separate story. For now, follow the existing unconditional pattern.

### Test Patterns to Follow

In `src/lib/__tests__/deps.test.ts`:
- The `describe('cargo-tarpaulin entry')` block should mirror `describe('semgrep entry')` (line 164) and `describe('bats entry')` (line 222).
- Use `DEPENDENCY_REGISTRY.find(d => d.name === 'cargo-tarpaulin')!` to get the actual spec.
- The `installAllDependencies` integration tests that enumerate all deps by name (lines 320-353, 438-465) need updated mock implementations to handle `cargo` command.

### Specific Test Updates Required

**Test at line 320 ("continues when non-critical dep fails"):**
The mock implementation checks `cmdStr` for each known command. Add:
```typescript
if (cmdStr === 'cargo') throw new Error('not found');
```

**Test at line 438 ("prints FAIL and info messages"):**
Same pattern — add cargo to the fail list:
```typescript
if (cmdStr === 'cargo') throw new Error('not found');
```

**Test at line 469 ("contains showboat, agent-browser, beads, semgrep, and bats"):**
Add `expect(names).toContain('cargo-tarpaulin')` and update the description string.

**Test at line 479 ("has exactly 5 entries"):**
Change to `expect(DEPENDENCY_REGISTRY).toHaveLength(6)`.

### Do NOT Duplicate

Story 8-3 already:
- Added `cargo-tarpaulin` detection to `detectCoverageTool()` in `coverage.ts`
- Added tarpaulin install check via `cargo tarpaulin --version` in coverage detection
- The dependency registry entry is separate from coverage detection — this is about auto-install during `codeharness init`, not runtime detection

### Architecture Constraints

- **<300 line limit**: `deps.ts` is 175 lines. Adding ~7 lines is fine.
- **No new npm dependencies**: Uses existing `execFileSync` and types.
- **NFR5**: Follows existing `DependencySpec` pattern exactly. No type changes.

### Project Structure Notes

- `src/lib/deps.ts` — registry definition and install logic
- `src/lib/__tests__/deps.test.ts` — test file (currently 562 lines, adding ~60 lines for new tests)
- `src/modules/infra/deps-install.ts` — consumer of registry (no changes needed)
- `src/modules/infra/__tests__/deps-install.test.ts` — consumer tests with mocked registry (may need length update in mock)

### References

- [Source: src/lib/deps.ts#DEPENDENCY_REGISTRY L25-75 — existing registry entries]
- [Source: src/lib/__tests__/deps.test.ts#L164-277 — semgrep/bats test patterns to follow]
- [Source: src/lib/__tests__/deps.test.ts#L468-551 — registry shape assertions]
- [Source: src/modules/infra/init-project.ts#L99 — unconditional installDeps call]
- [Source: _bmad-output/planning-artifacts/epics-rust-stack-support.md#FR13 — requirement]

### Previous Story Intelligence (8-3)

- 8-3 added coverage detection for cargo-tarpaulin. Test suite was at 2980 tests. Zero regressions expected.
- `vi.mock('node:child_process')` with `importOriginal` was used for ESM-compatible mocking in coverage tests. The deps test file uses a simpler `vi.mock` without `importOriginal` — follow the deps test file pattern.
- Workspace detection regex `/^\[workspace\]/m` in coverage.ts matches the same pattern used in `stack-detect.ts`. Not relevant here but shows consistency approach.

### Git Intelligence

Recent commits: ebaddac (8-3 verified), d6a76bf (8-2 verified), 4c7f498 (8-1 detection).
All Rust epic stories so far modified: `coverage.ts`, `stack-detect.ts`, `state.ts`, `docs-scaffold.ts` + tests.
This story only touches `deps.ts` and `deps.test.ts` — no overlap with previous stories' files.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-4-register-cargo-tarpaulin-dep-registry.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-4-register-cargo-tarpaulin-dep-registry.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- `src/lib/deps.ts` — Added cargo-tarpaulin entry to DEPENDENCY_REGISTRY
- `src/lib/__tests__/deps.test.ts` — Added cargo-tarpaulin tests, updated registry assertions and installAllDependencies mocks
- `src/lib/AGENTS.md` — Updated deps.ts description to include cargo-tarpaulin
