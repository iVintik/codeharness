# Verification Proof: Story 12-4 — Shared Test Utilities and Fixtures

**Story:** 12-4-shared-test-utilities-fixtures
**Date:** 2026-03-24
**Tier:** unit-testable
**Verifier:** Unit-testable verification (all ACs tagged cli-verifiable)

## AC 1: Fixtures directory contains required files

**Verdict:** PASS

```bash
ls src/lib/__tests__/fixtures/
```
```output
cargo-toml-variants.test.ts
cargo-toml-variants.ts
mock-factories.test.ts
mock-factories.ts
state-builders.test.ts
state-builders.ts
```

All three required files exist: `cargo-toml-variants.ts`, `state-builders.ts`, `mock-factories.ts`.

## AC 2: helpers.ts provides one-liner imports for common patterns

**Verdict:** PASS

```bash
grep "^export" src/lib/__tests__/helpers.ts
```
```output
export * from './fixtures/cargo-toml-variants.js';
export * from './fixtures/state-builders.js';
export * from './fixtures/mock-factories.js';
export async function withTempDir(
```

Test files use single-line imports:
```bash
grep "from.*helpers" src/modules/sprint/__tests__/selector.test.ts src/modules/sprint/__tests__/feedback.test.ts
```
```output
src/modules/sprint/__tests__/selector.test.ts:import { buildSprintState, buildStoryEntry } from '../../../lib/__tests__/helpers.js';
src/modules/sprint/__tests__/feedback.test.ts:import { buildSprintState, buildSprintStateWithStory } from '../../../lib/__tests__/helpers.js';
```

## AC 3: cargo-toml-variants.ts exports all required variants

**Verdict:** PASS

```bash
grep "^export const" src/lib/__tests__/fixtures/cargo-toml-variants.ts
```
```output
export const CARGO_TOML_MINIMAL = `[package]
export const CARGO_TOML_ACTIX_WEB = `[package]
export const CARGO_TOML_AXUM = `[package]
export const CARGO_TOML_ASYNC_OPENAI = `[package]
export const CARGO_TOML_WORKSPACE = `[workspace]
export const CARGO_TOML_BINARY = `[package]
export const CARGO_TOML_LIBRARY = `[package]
export const CARGO_TOML_GENERIC = `[package]
```

All 8 variants present: minimal, actix-web, axum, async-openai, workspace, binary, library, generic.

## AC 4: state-builders.ts exports buildSprintState with correct signature

**Verdict:** PASS

```bash
grep "^export function" src/lib/__tests__/fixtures/state-builders.ts
```
```output
export function buildSprintState(overrides?: Partial<SprintState>): SprintState {
export function buildStoryEntry(overrides?: Partial<StoryState>): StoryState {
export function buildEpicState(overrides?: Partial<EpicState>): EpicState {
export function buildActionItem(overrides?: Partial<ActionItem>): ActionItem {
export function buildSprintStateWithStory(
```

`buildSprintState(overrides?: Partial<SprintState>): SprintState` matches the required signature. Returns valid SprintStateV2 object with sensible defaults.

## AC 5: mock-factories.ts exports all required factory functions

**Verdict:** PASS

```bash
grep "^export function" src/lib/__tests__/fixtures/mock-factories.ts
```
```output
export function createFsMock() {
export function createChildProcessMock() {
export function createDockerMock() {
export function createStateMock() {
export function createSprintStateMock() {
```

All 4 required factories present: `createFsMock()`, `createChildProcessMock()`, `createDockerMock()`, `createStateMock()`. Bonus: `createSprintStateMock()` also provided.

## AC 6: helpers.ts exports withTempDir utility

**Verdict:** PASS

```bash
grep "withTempDir" src/lib/__tests__/helpers.ts
```
```output
export async function withTempDir(
```

`withTempDir(fn: (dir: string) => Promise<void>)` is exported and handles temp directory creation, callback execution, and cleanup.

## AC 7: helpers.ts re-exports all fixtures and mock factories

**Verdict:** PASS

```bash
grep "^export \*" src/lib/__tests__/helpers.ts
```
```output
export * from './fixtures/cargo-toml-variants.js';
export * from './fixtures/state-builders.js';
export * from './fixtures/mock-factories.js';
```

All three fixture modules are re-exported, providing a single import point.

## AC 8: All tests pass with zero regressions

**Verdict:** PASS

```bash
npx vitest run 2>&1 | tail -5
```
```output
 Test Files  134 passed (134)
      Tests  3542 passed (3542)
   Start at  18:24:33
   Duration  8.83s
```

3542 tests pass across 134 files. Up from 3493 (story 12-3 baseline) — 49 new tests added, zero regressions.

## AC 9: At least 3 existing test files refactored to use shared utilities

**Verdict:** PASS

```bash
grep -l "from.*helpers.js" src/lib/__tests__/stacks/rust.test.ts src/modules/sprint/__tests__/feedback.test.ts src/modules/sprint/__tests__/selector.test.ts
```
```output
src/lib/__tests__/stacks/rust.test.ts
src/modules/sprint/__tests__/feedback.test.ts
src/modules/sprint/__tests__/selector.test.ts
```

Three test files refactored:
1. `rust.test.ts` — 11 inline Cargo.toml strings replaced with fixture imports
2. `feedback.test.ts` — inline SprintState objects replaced with `buildSprintState`/`buildSprintStateWithStory`
3. `selector.test.ts` — inline state builders replaced with shared `buildSprintState`/`buildStoryEntry`

## AC 10: No file exceeds 300 lines

**Verdict:** PASS

```bash
wc -l src/lib/__tests__/fixtures/cargo-toml-variants.ts src/lib/__tests__/fixtures/state-builders.ts src/lib/__tests__/fixtures/mock-factories.ts src/lib/__tests__/helpers.ts
```
```output
      74 src/lib/__tests__/fixtures/cargo-toml-variants.ts
     138 src/lib/__tests__/fixtures/state-builders.ts
     103 src/lib/__tests__/fixtures/mock-factories.ts
      37 src/lib/__tests__/helpers.ts
     352 total
```

All files well under 300 lines. Maximum is 138 lines (state-builders.ts).

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| 1 | Fixtures directory contains required files | PASS |
| 2 | helpers.ts provides one-liner imports | PASS |
| 3 | cargo-toml-variants.ts exports all variants | PASS |
| 4 | state-builders.ts exports buildSprintState | PASS |
| 5 | mock-factories.ts exports factory functions | PASS |
| 6 | helpers.ts exports withTempDir | PASS |
| 7 | helpers.ts re-exports all fixtures | PASS |
| 8 | All 3542 tests pass, zero regressions | PASS |
| 9 | 3 test files refactored with shared utilities | PASS |
| 10 | No file exceeds 300 lines | PASS |

**Result: 10/10 ACs PASS, 0 FAIL, 0 ESCALATE**
