# Story 8-4: Register cargo-tarpaulin in Dependency Registry

## Status: backlog

## Story

As a developer initializing codeharness on a Rust project,
I want cargo-tarpaulin to be auto-installed if missing,
So that coverage works out of the box.

## Acceptance Criteria

- [ ] AC1: Given `cargo-tarpaulin` is not installed, when `codeharness init` runs on a Rust project, then it attempts `cargo install cargo-tarpaulin` <!-- verification: integration-required -->
- [ ] AC2: Given the dependency registry, when checked for `cargo-tarpaulin`, then it has `critical: false`, install command `cargo install cargo-tarpaulin`, check command `cargo tarpaulin --version` <!-- verification: cli-verifiable -->

## Technical Notes

### Dependency Registry Entry

File: `src/lib/deps.ts` — `DEPENDENCY_REGISTRY` array.

Add entry following the exact pattern of existing entries (showboat, agent-browser, beads, semgrep):

```typescript
{
  name: 'cargo-tarpaulin',
  displayName: 'cargo-tarpaulin',
  installCommands: [{ cmd: 'cargo', args: ['install', 'cargo-tarpaulin'] }],
  checkCommand: { cmd: 'cargo', args: ['tarpaulin', '--version'] },
  critical: false,
}
```

### Conditional Installation

This dependency is only relevant for Rust projects. The init pipeline should only attempt installation when the detected stack is `'rust'`. Check how existing stack-conditional dependency installation works in `src/commands/init.ts` or `src/modules/infra/init-project.ts` — cargo-tarpaulin should follow the same pattern.

If `cargo` is not available on the system, the install will fail gracefully since `critical: false`.

### Tests

File: `src/lib/__tests__/deps.test.ts`

Follow the pattern established by story 7-1 (Semgrep registry entry). Add test cases:
- Registry contains `cargo-tarpaulin` entry
- `DEPENDENCY_REGISTRY` length increased by 1
- Check-installed, install-success, install-failure paths for cargo-tarpaulin

## Files to Change

- `src/lib/deps.ts` — Add `cargo-tarpaulin` entry to `DEPENDENCY_REGISTRY` array
- `src/lib/__tests__/deps.test.ts` — Add test coverage for cargo-tarpaulin registry entry (check-installed, install-success, install-failure)
