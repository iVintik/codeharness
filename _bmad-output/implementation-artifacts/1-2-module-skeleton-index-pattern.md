# Story 1.2: Module Skeleton & Index Pattern

Status: verifying

## Story

As a developer,
I want module directories with index.ts re-exports for all 5 modules,
so that module boundaries are enforced and imports follow the index-only pattern.

## Acceptance Criteria

1. **Given** `src/modules/{infra,sprint,verify,dev,review}/index.ts` exist, **When** imported, **Then** each exports typed function stubs returning `Result<T>`. <!-- verification: cli-verifiable -->
2. **Given** all stubs, **When** called, **Then** each returns `fail('not implemented')`. <!-- verification: cli-verifiable -->
3. **Given** CLI commands, **When** reviewed, **Then** no command file exceeds 100 lines. <!-- verification: cli-verifiable -->
4. **Given** module imports, **When** reviewed, **Then** no module imports from another module's internal files. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/infra/index.ts` (AC: #1, #2)
  - [x] Export `initProject(opts: InitOptions): Result<InitResult>` stub returning `fail('not implemented')`
  - [x] Export `ensureStack(): Result<StackStatus>` stub returning `fail('not implemented')`
  - [x] Export `cleanupContainers(): Result<void>` stub returning `fail('not implemented')`
  - [x] Export `getObservabilityBackend(): ObservabilityBackend` stub (throws until implemented)
  - [x] Define `InitOptions`, `InitResult`, `StackStatus` types in `src/modules/infra/types.ts`
- [x] Task 2: Create `src/modules/sprint/index.ts` (AC: #1, #2)
  - [x] Export `getNextStory(): Result<StorySelection | null>` stub returning `fail('not implemented')`
  - [x] Export `updateStoryStatus(key: string, status: StoryStatus, detail?: StoryDetail): Result<void>` stub returning `fail('not implemented')`
  - [x] Export `getSprintState(): Result<SprintState>` stub returning `fail('not implemented')`
  - [x] Export `generateReport(): Result<StatusReport>` stub returning `fail('not implemented')`
  - [x] Define `StorySelection`, `StoryDetail`, `StatusReport` types in `src/modules/sprint/types.ts`
- [x] Task 3: Create `src/modules/verify/index.ts` (AC: #1, #2)
  - [x] Export `verifyStory(key: string): Result<VerifyResult>` stub returning `fail('not implemented')`
  - [x] Export `parseProof(path: string): Result<ProofQuality>` stub returning `fail('not implemented')`
  - [x] Define `VerifyResult`, `ProofQuality` types in `src/modules/verify/types.ts`
- [x] Task 4: Create `src/modules/dev/index.ts` (AC: #1, #2)
  - [x] Export `developStory(key: string): Result<DevResult>` stub returning `fail('not implemented')`
  - [x] Define `DevResult` type in `src/modules/dev/types.ts`
- [x] Task 5: Create `src/modules/review/index.ts` (AC: #1, #2)
  - [x] Export `reviewStory(key: string): Result<ReviewResult>` stub returning `fail('not implemented')`
  - [x] Define `ReviewResult` type in `src/modules/review/types.ts`
- [x] Task 6: Audit CLI command files for line count (AC: #3)
  - [x] Identify all files in `src/commands/` exceeding 100 lines
  - [x] Document which files need refactoring (init.ts at 780 lines, status.ts at 566 lines, onboard.ts at 477 lines, verify.ts at 303 lines, retro-import.ts at 298 lines, run.ts at 291 lines, stack.ts at 288 lines, teardown.ts at 271 lines, query.ts at 216 lines, verify-env.ts at 156 lines, github-import.ts at 148 lines, coverage.ts at 139 lines, state.ts at 131 lines, bridge.ts at 128 lines, retry.ts at 126 lines, sync.ts at 112 lines)
  - [x] NOTE: This story only creates module stubs — actual command slimming happens when modules are implemented (stories 2.x, 3.x, 4.x, 5.x, 6.x). AC #3 documents the current state; it does NOT require refactoring all commands now.
- [x] Task 7: Add import boundary lint rule or test (AC: #4)
  - [x] Create `src/modules/__tests__/import-boundaries.test.ts` that scans module files for illegal cross-module internal imports
  - [x] Test: no file in `src/modules/{name}/` imports from `src/modules/{other}/` except via `index.ts` (or `index.js`)
  - [x] Test: no file in `src/commands/` imports from `src/modules/{name}/` internal files (only from `index.ts`)
- [x] Task 8: Write unit tests for all module stubs (AC: #1, #2)
  - [x] Create `src/modules/infra/__tests__/index.test.ts` — verify each export returns `fail('not implemented')`
  - [x] Create `src/modules/sprint/__tests__/index.test.ts` — verify each export returns `fail('not implemented')`
  - [x] Create `src/modules/verify/__tests__/index.test.ts` — verify each export returns `fail('not implemented')`
  - [x] Create `src/modules/dev/__tests__/index.test.ts` — verify each export returns `fail('not implemented')`
  - [x] Create `src/modules/review/__tests__/index.test.ts` — verify each export returns `fail('not implemented')`
- [x] Task 9: Verify build (`npm run build`) succeeds with new module files
- [x] Task 10: Verify all existing tests still pass (`npm test`)

## Dev Notes

### Architecture Constraints

- **Function signatures MUST match Decision 3** from architecture-overhaul.md exactly. See "Module Interface Contracts" section. Do not invent additional exports.
- **Result<T> pattern** — import `Result`, `ok`, `fail` from `../../types/result.js`. All stubs return `fail('not implemented')`.
- **ES modules** — all imports must use `.js` extension (e.g., `import { fail } from '../../types/result.js'`).
- **Strict TypeScript** — `strict: true`. No `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18). Module stubs will be well under this.
- **100% test coverage** on new code (NFR14).
- **No enums** — use union types for all string literals.
- **Naming:** files `kebab-case.ts`, functions `camelCase` verb-noun, tests colocated in `__tests__/`.

### Module Interface Reference (Architecture Decision 3)

```typescript
// infra/
export function initProject(opts: InitOptions): Result<InitResult>;
export function ensureStack(): Result<StackStatus>;
export function cleanupContainers(): Result<void>;
export function getObservabilityBackend(): ObservabilityBackend;

// sprint/
export function getNextStory(): Result<StorySelection | null>;
export function updateStoryStatus(key: string, status: StoryStatus, detail?: StoryDetail): Result<void>;
export function getSprintState(): Result<SprintState>;
export function generateReport(): Result<StatusReport>;

// verify/
export function verifyStory(key: string): Result<VerifyResult>;
export function parseProof(path: string): Result<ProofQuality>;

// dev/
export function developStory(key: string): Result<DevResult>;

// review/
export function reviewStory(key: string): Result<ReviewResult>;
```

### AC #3: Command File Line Count Reality

Current state (pre-overhaul): 16 out of 17 command files exceed 100 lines. Only `doc-health.ts` (76 lines) is within the limit. This is expected — the entire point of the module architecture is to extract logic from commands into modules. This story creates the skeleton that future stories will migrate into.

**The AC should be interpreted as:** the module stubs exist so that future stories CAN slim commands to <100 lines. Verification of this AC for story 1.2 means documenting which commands exceed the limit and confirming the module stubs provide the interfaces needed to eventually slim them.

### AC #4: Import Boundary Enforcement

The import boundary rule is: modules import from other modules only via `index.ts`. No reaching into internal files. This is a structural lint check that can be implemented as a test scanning `import` statements in source files.

Pattern to reject: `import { something } from '../verify/parser.js'` (internal file)
Pattern to allow: `import { verifyStory } from '../verify/index.js'` (public interface)

### Module-Specific Types

Each module needs its own `types.ts` for module-specific types (e.g., `InitOptions`, `DevResult`). These are NOT shared types — they are consumed only by that module's interface. Keep them minimal for stubs; they will be fleshed out when modules are implemented.

### Dependency on Story 1.1

This story depends on story 1.1 (Result Type & Shared Types) being complete. It imports `Result<T>`, `ok()`, `fail()` from `src/types/result.ts`, and `SprintState`, `StoryStatus`, `ObservabilityBackend` from `src/types/index.ts`.

### File Layout

```
src/modules/
├── infra/
│   ├── index.ts           # initProject, ensureStack, cleanupContainers, getObservabilityBackend
│   ├── types.ts           # InitOptions, InitResult, StackStatus
│   └── __tests__/
│       └── index.test.ts
├── sprint/
│   ├── index.ts           # getNextStory, updateStoryStatus, getSprintState, generateReport
│   ├── types.ts           # StorySelection, StoryDetail, StatusReport
│   └── __tests__/
│       └── index.test.ts
├── verify/
│   ├── index.ts           # verifyStory, parseProof
│   ├── types.ts           # VerifyResult, ProofQuality
│   └── __tests__/
│       └── index.test.ts
├── dev/
│   ├── index.ts           # developStory
│   ├── types.ts           # DevResult
│   └── __tests__/
│       └── index.test.ts
├── review/
│   ├── index.ts           # reviewStory
│   ├── types.ts           # ReviewResult
│   └── __tests__/
│       └── index.test.ts
└── __tests__/
    └── import-boundaries.test.ts
```

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 3 — Module Interface Contracts]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Module Layout — every module has index.ts]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Module Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Naming Patterns]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 1.2]
- [Source: src/types/result.ts — Result<T>, ok(), fail() from story 1.1]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/1-2-module-skeleton-index-pattern.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/1-2-module-skeleton-index-pattern.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
