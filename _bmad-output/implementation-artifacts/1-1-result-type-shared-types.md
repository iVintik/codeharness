# Story 1.1: Result Type & Shared Types

Status: verifying

## Story

As a developer,
I want a consistent Result<T> type used by all module functions,
so that error handling is predictable and no module crash kills the system.

## Acceptance Criteria

1. **Given** `src/types/result.ts` exists, **When** imported, **Then** it exports `Result<T>`, `ok(data)`, and `fail(error, context?)` as type-safe constructors. <!-- verification: cli-verifiable -->
2. **Given** `ok(data)` is called, **When** checked, **Then** `result.success === true` and `result.data` contains the value with correct TypeScript type inference. <!-- verification: cli-verifiable -->
3. **Given** `fail(error)` is called, **When** checked, **Then** `result.success === false` and `result.error` contains the message, and optional `context` is a `Record<string, unknown>`. <!-- verification: cli-verifiable -->
4. **Given** `src/types/state.ts` exists, **When** imported, **Then** it exports `SprintState` interface matching the architecture decision (version, sprint summary, stories record, run section, actionItems array). <!-- verification: cli-verifiable -->
5. **Given** `src/types/observability.ts` exists, **When** imported, **Then** it exports `ObservabilityBackend` interface with async methods `queryLogs`, `queryMetrics`, `queryTraces`, `healthCheck`, each returning `Promise<Result<T>>`. <!-- verification: cli-verifiable -->
6. **Given** `src/types/index.ts` exists, **When** imported, **Then** it re-exports all types from `result.ts`, `state.ts`, and `observability.ts`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/types/result.ts` (AC: #1, #2, #3)
  - [x] Define discriminated union `Result<T>` with `success` as discriminant
  - [x] Implement `ok<T>(data: T): Result<T>` constructor
  - [x] Implement `fail(error: string, context?: Record<string, unknown>): Result<never>` constructor
  - [x] Export helper type guards: `isOk(result)` and `isFail(result)` for narrowing
- [x] Task 2: Create `src/types/state.ts` (AC: #4)
  - [x] Define `SprintState` interface with `version: 1` literal
  - [x] Define `sprint` summary sub-interface (total, done, failed, blocked, inProgress)
  - [x] Define `stories` record type with `StoryState` interface (status union, attempts, lastAttempt, lastError, proofPath, acResults)
  - [x] Define `AcResult` type with verdict union `'pass' | 'fail' | 'escalate' | 'pending'`
  - [x] Define `run` sub-interface (active, startedAt, iteration, cost, completed, failed)
  - [x] Define `actionItems` array type with `ActionItem` interface
  - [x] Define `StoryStatus` union type: `'backlog' | 'ready' | 'in-progress' | 'review' | 'verifying' | 'done' | 'failed' | 'blocked'`
- [x] Task 3: Create `src/types/observability.ts` (AC: #5)
  - [x] Define `ObservabilityBackend` interface with `type: 'victoria' | 'opensearch'`
  - [x] Define `LogQuery`, `MetricQuery`, `TraceQuery` parameter interfaces
  - [x] Define `LogResult`, `MetricResult`, `TraceResult`, `HealthStatus` result interfaces
  - [x] All async methods return `Promise<Result<T>>` (import from result.ts)
- [x] Task 4: Create `src/types/index.ts` barrel (AC: #6)
  - [x] Re-export all from `./result.js`
  - [x] Re-export all from `./state.js`
  - [x] Re-export all from `./observability.js`
- [x] Task 5: Write unit tests in `src/types/__tests__/result.test.ts`
  - [x] Test `ok()` returns `{ success: true, data: <value> }`
  - [x] Test `fail()` returns `{ success: false, error: <msg> }`
  - [x] Test `fail()` with context returns `{ success: false, error: <msg>, context: <obj> }`
  - [x] Test TypeScript narrowing: after `if (result.success)` compiler sees `data`, else sees `error`
  - [x] Test `isOk()` and `isFail()` type guards
- [x] Task 6: Write unit tests in `src/types/__tests__/state.test.ts`
  - [x] Test `SprintState` type satisfies the architecture schema with a valid fixture
  - [x] Test `StoryStatus` union covers all expected values
- [x] Task 7: Write unit tests in `src/types/__tests__/observability.test.ts`
  - [x] Test `ObservabilityBackend` interface can be implemented (mock implementation compiles)
- [x] Task 8: Verify build (`npm run build`) succeeds with new files
- [x] Task 9: Verify all existing tests still pass (`npm test`)

## Dev Notes

### CRITICAL: Naming Collision with `src/lib/output.ts`

`src/lib/output.ts` already exports `ok()` and `fail()` as **console logging functions** (they print `[OK]` and `[FAIL]` to stdout). The new `src/types/result.ts` will export `ok()` and `fail()` as **Result constructor functions** (they return data structures).

These are entirely different things. The dev agent MUST:
- **NOT** rename or modify `src/lib/output.ts` — it is used throughout the codebase
- **NOT** confuse imports — consumers will import Result constructors from `src/types/result.js` and logging from `src/lib/output.js`
- Use explicit import paths or aliased imports where both are needed in the same file (future stories)
- Consider naming the Result constructors with a namespace prefix if collisions become problematic (e.g., `import { ok, fail } from '../types/result.js'` vs `import * as log from '../lib/output.js'`)

### Architecture Constraints

- **Discriminated union pattern** — `success` field is the discriminant. Do NOT use class-based Result. Do NOT use exceptions. [Source: architecture-overhaul.md#Decision 1]
- **No enums** — use union types for all string literals (e.g., `StoryStatus`, `AcResult.verdict`). [Source: architecture-overhaul.md#Naming Patterns]
- **`Result<never>` for fail** — `fail()` should return `Result<never>` so it is assignable to any `Result<T>` without explicit generic parameter
- **ES modules** — all imports must use `.js` extension (e.g., `import { ok } from './result.js'`). This is required by the ESM + tsup build. [Source: tsconfig.json — `module: ES2022`, `moduleResolution: bundler`]
- **Strict TypeScript** — `strict: true` in tsconfig.json. No `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18). These type files should be well under that.
- **100% test coverage** on new code (NFR14).

### SprintState Schema Reference

The exact schema from architecture decision 2:

```typescript
interface SprintState {
  version: 1;
  sprint: {
    total: number;
    done: number;
    failed: number;
    blocked: number;
    inProgress: string | null;
  };
  stories: Record<string, {
    status: 'backlog' | 'ready' | 'in-progress' | 'review' | 'verifying' | 'done' | 'failed' | 'blocked';
    attempts: number;
    lastAttempt: string | null;
    lastError: string | null;
    proofPath: string | null;
    acResults: Array<{ id: string; verdict: 'pass' | 'fail' | 'escalate' | 'pending' }> | null;
  }>;
  run: {
    active: boolean;
    startedAt: string | null;
    iteration: number;
    cost: number;
    completed: string[];
    failed: string[];
  };
  actionItems: Array<{
    id: string;
    story: string;
    description: string;
    source: 'verification' | 'retro' | 'manual';
    resolved: boolean;
  }>;
}
```

### ObservabilityBackend Interface Reference

From architecture decision 4:

```typescript
interface ObservabilityBackend {
  type: 'victoria' | 'opensearch';
  queryLogs(params: LogQuery): Promise<Result<LogResult>>;
  queryMetrics(params: MetricQuery): Promise<Result<MetricResult>>;
  queryTraces(params: TraceQuery): Promise<Result<TraceResult>>;
  healthCheck(): Promise<Result<HealthStatus>>;
}
```

The `LogQuery`, `MetricQuery`, `TraceQuery` param types and `LogResult`, `MetricResult`, `TraceResult`, `HealthStatus` result types are NOT defined in the architecture doc. The dev agent must design these to be backend-agnostic (usable by both Victoria and OpenSearch implementations in future stories 7.1 and 7.2).

### Project Structure Notes

- `src/types/` directory does NOT exist yet — must be created
- Build system: `tsup` with ESM output, `rootDir: src`
- Test framework: Vitest (colocated `__tests__/` pattern)
- No existing modules under `src/modules/` yet — this story creates the first shared types directory that all future modules will import from

### File Layout

```
src/types/
├── result.ts          # Result<T>, ok(), fail(), isOk(), isFail()
├── state.ts           # SprintState, StoryState, StoryStatus, AcResult, ActionItem
├── observability.ts   # ObservabilityBackend, LogQuery, MetricQuery, TraceQuery, etc.
├── index.ts           # Barrel re-exports
└── __tests__/
    ├── result.test.ts
    ├── state.test.ts
    └── observability.test.ts
```

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 1 — Result Type Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 2 — Unified State Format]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 4 — Observability Backend Interface]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Naming Patterns]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 1.1]
- [Source: src/lib/output.ts — existing ok()/fail() logging functions]
- [Source: tsconfig.json — strict mode, ES2022 modules]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/1-1-result-type-shared-types.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/1-1-result-type-shared-types.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no debugging needed, clean implementation.

### Completion Notes List

- Implemented discriminated union `Result<T>` with `Ok<T>` and `Fail` variants, `success` as discriminant
- `fail()` returns `Result<never>` for universal assignability; omits `context` property when not provided
- `SprintState` matches architecture decision 2 schema exactly, with extracted named types (`StoryState`, `StoryStatus`, `AcResult`, `AcVerdict`, `ActionItem`, `ActionItemSource`)
- `ObservabilityBackend` matches architecture decision 4; designed backend-agnostic query/result types (`LogQuery`, `MetricQuery`, `TraceQuery`, `LogResult`, `MetricResult`, `TraceResult`, `HealthStatus`, `TimeRange`)
- All interfaces use `readonly` properties for immutability
- No `any` types, no enums, ESM `.js` extensions on all imports
- All files well under 300-line limit (largest is observability.ts at ~104 lines)
- `result.ts` has 100% test coverage; `state.ts` and `observability.ts` are pure type definitions (no runtime code to cover)
- Build passes, all 1674 existing tests pass, 3 new test files (56 total) all pass
- No modifications to existing files; no naming collision with `src/lib/output.ts`

### Change Log

- Created `src/types/result.ts` — Result<T> discriminated union, ok(), fail(), isOk(), isFail()
- Created `src/types/state.ts` — SprintState, StoryState, StoryStatus, AcResult, ActionItem types
- Created `src/types/observability.ts` — ObservabilityBackend interface and all query/result types
- Created `src/types/index.ts` — barrel re-exports
- Created `src/types/__tests__/result.test.ts` — 13 tests covering constructors, narrowing, type guards
- Created `src/types/__tests__/state.test.ts` — 5 tests covering schema fixture, union coverage
- Created `src/types/__tests__/observability.test.ts` — 3 tests covering mock implementation, failure results, optional fields

### File List

- src/types/result.ts (new)
- src/types/state.ts (new)
- src/types/observability.ts (new)
- src/types/index.ts (new)
- src/types/__tests__/result.test.ts (new)
- src/types/__tests__/state.test.ts (new)
- src/types/__tests__/observability.test.ts (new)
- _bmad-output/implementation-artifacts/1-1-result-type-shared-types.md (modified)
