# Story 12-4: Shared Test Utilities and Fixtures

## Status: backlog

## Story

As a developer,
I want reusable test helpers and fixtures,
So that tests don't duplicate mock setup across 50+ files.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/__tests__/fixtures/` exists, when inspected, then it contains: `cargo-toml-variants.ts`, `state-builders.ts`, `mock-factories.ts` <!-- verification: cli-verifiable -->
- [ ] AC2: Given `src/lib/__tests__/helpers.ts` exists, when test files import from it, then common patterns (mock Docker, mock fs, create temp state) are one-liners <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 4 (lib/ Restructuring).** Tests currently duplicate mock setup extensively. Centralizing reduces maintenance and makes tests more readable.

### Fixtures (`src/lib/__tests__/fixtures/`)

**`cargo-toml-variants.ts`**: Pre-built Cargo.toml content strings for testing Rust provider:
- Minimal binary project
- Library project with `[lib]`
- Workspace with multiple members
- Bevy project with system lib dependencies
- Project with `[dependencies.opentelemetry]` subsections

**`state-builders.ts`**: Builder pattern for test state objects:
```typescript
export function buildSprintState(overrides?: Partial<SprintState>): SprintState
export function buildStoryState(overrides?: Partial<StoryState>): StoryState
export function buildEpicState(overrides?: Partial<EpicState>): EpicState
export function buildSessionState(overrides?: Partial<SessionState>): SessionState
```

**`mock-factories.ts`**: Factory functions for common mocks:
```typescript
export function createMockStackProvider(overrides?: Partial<StackProvider>): StackProvider
export function createMockAgentDriver(overrides?: Partial<AgentDriver>): AgentDriver
export function createMockDockerHealth(running: boolean): DockerHealthResult
```

### Helpers (`src/lib/__tests__/helpers.ts`)

Common test setup patterns as one-liners:
```typescript
export function withMockDocker(running: boolean): void  // mocks execSync('docker info')
export function withTempState(state: SprintState): { dir: string; cleanup: () => void }
export function withMockFs(files: Record<string, string>): void  // virtual filesystem
export function createTempDir(): { path: string; cleanup: () => void }
```

Audit existing test files to identify the most duplicated patterns. Prioritize the top 5 most-repeated mock setups.

## Files to Change

- `src/lib/__tests__/fixtures/cargo-toml-variants.ts` — Create. Cargo.toml test fixtures for various project types
- `src/lib/__tests__/fixtures/state-builders.ts` — Create. Builder functions for SprintState, StoryState, EpicState
- `src/lib/__tests__/fixtures/mock-factories.ts` — Create. Factory functions for mock StackProvider, AgentDriver, Docker
- `src/lib/__tests__/helpers.ts` — Create. One-liner test setup helpers (mock Docker, temp state, mock fs)
- Existing test files — Refactor to use shared helpers (opportunistic, not required in this story)
