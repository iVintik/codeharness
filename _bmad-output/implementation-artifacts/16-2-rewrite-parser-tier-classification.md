# Story 16.2: Rewrite Parser Tier Classification
<!-- verification-tier: test-provable -->

## Status: verifying

## Story

As a codeharness developer,
I want the story parser to classify ACs using the new four-tier `VerificationTier` system,
So that tier assignment uses clear keyword matching and the old three-system confusion is eliminated.

## Acceptance Criteria

- [x] AC1: Given `classifyTier("Given function X exists, when called with Y, then returns Z")`, when called, then it returns `'test-provable'` <!-- verification: test-provable -->
- [x] AC2: Given `classifyTier("Given the CLI outputs JSON when --format json is passed")`, when called, then it returns `'runtime-provable'` <!-- verification: test-provable -->
- [x] AC3: Given `classifyTier("Given logs appear in VictoriaLogs after the request")`, when called, then it returns `'environment-provable'` <!-- verification: test-provable -->
- [x] AC4: Given `classifyTier("Given 60fps rendering on a physical display")`, when called, then it returns `'escalate'` <!-- verification: test-provable -->
- [x] AC5: Given `classifyTier("Given the type is exported from types.ts")`, when called, then it returns `'test-provable'` (keyword: "type", "export") <!-- verification: test-provable -->
- [x] AC6: Given `classifyTier("Given the API endpoint returns 200")`, when called, then it returns `'runtime-provable'` (keyword: "API endpoint") <!-- verification: test-provable -->
- [x] AC7: Given `classifyTier("Given the Docker container starts successfully")`, when called, then it returns `'environment-provable'` (keyword: "Docker", "container") <!-- verification: test-provable -->
- [x] AC8: Given `parseVerificationTag('<!-- verification: test-provable -->')`, when called, then it returns `'test-provable'` as a `VerificationTier` <!-- verification: test-provable -->
- [x] AC9: Given `parseVerificationTag('<!-- verification: cli-verifiable -->')`, when called, then it returns `'test-provable'` via `LEGACY_TIER_MAP` backward compat <!-- verification: test-provable -->
- [x] AC10: Given `parseVerificationTag('<!-- verification: integration-required -->')`, when called, then it returns `'environment-provable'` via `LEGACY_TIER_MAP` backward compat <!-- verification: test-provable -->
- [x] AC11: Given `parseStoryACs()` is called on a story file, when ACs are parsed, then each `ParsedAC` has a `tier: VerificationTier` field populated from the AC's verification tag or from `classifyTier()` fallback <!-- verification: test-provable -->
- [x] AC12: Given the old `classifyStrategy()` function, when inspected, then it is marked `@deprecated` with a comment pointing to `classifyTier()` <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 1-7): Add `classifyTier()` function to `src/modules/verify/parser.ts`
  - [x] Define keyword arrays for each tier (test-provable, runtime-provable, environment-provable, escalate)
  - [x] Implement `classifyTier(description: string): VerificationTier` with priority order: escalate > environment-provable > runtime-provable > test-provable (default)
  - [x] Case-insensitive matching against keyword lists
- [x] Task 2 (AC: 8-10): Update `parseVerificationTag()` return type and add legacy mapping
  - [x] Change return type to `VerificationTier | null`
  - [x] After parsing tag value, run through `LEGACY_TIER_MAP` if value is a legacy key
  - [x] Ensure `VERIFICATION_TAG_PATTERN` regex already accepts all tier names (it does — check L99)
- [x] Task 3 (AC: 11): Update `parseStoryACs()` to use `classifyTier()` for tier derivation
  - [x] In `flushCurrent()`, compute tier: if tag exists, use `parseVerificationTag()` result; else use `classifyTier(description)`
  - [x] Remove the current complex conditional logic for tier derivation (lines 191-196)
  - [x] Simplify: `const tag = parseVerificationTag(description); const tier = tag ?? classifyTier(description);`
- [x] Task 4 (AC: 12): Deprecate `classifyStrategy()` and `classifyVerifiability()`
  - [x] Add `@deprecated` JSDoc to `classifyStrategy()` pointing to `classifyTier()`
  - [x] Add `@deprecated` JSDoc to `classifyVerifiability()` pointing to `classifyTier()`
  - [x] Do NOT remove these functions — downstream code still references them until stories 16-3/16-4
- [x] Task 5: Update tests in `src/modules/verify/__tests__/verify-parser.test.ts`
  - [x] Add `classifyTier` tests for all four tiers with multiple keyword matches
  - [x] Add backward compat tests for `parseVerificationTag` with legacy values
  - [x] Update existing `parseStoryACs` tests to verify `tier` field correctness
  - [x] Keep existing `classifyStrategy` and `classifyVerifiability` tests (functions still exist)

## Dev Notes

### Key File: `src/modules/verify/parser.ts`

Current state (after Story 16-1):
- L8: Already imports `VerificationTier`, `LEGACY_TIER_MAP`, `TIER_HIERARCHY` from `./types.js`
- L64: `classifyVerifiability()` — still active, returns `Verifiability` (deprecated type)
- L85: `classifyStrategy()` — still active, returns `VerificationStrategy` (deprecated type)
- L99: `VERIFICATION_TAG_PATTERN` — already accepts all four new tier names plus legacy names
- L107: `parseVerificationTag()` — returns `Verifiability | VerificationTier | null` (needs to become `VerificationTier | null`)
- L186-209: `flushCurrent()` inside `parseStoryACs()` — has complex tier derivation logic that should be simplified

### New Function: `classifyTier()`

```typescript
// ─── Tier Classification Keywords ────────────────────────────────────────────

const TEST_PROVABLE_KEYWORDS = [
  'file exists', 'export', 'type', 'interface', 'test passes',
  'line count', 'coverage', 'refactor', 'rename', 'documentation',
  'function', 'when inspected', 'config',
];

const RUNTIME_PROVABLE_KEYWORDS = [
  'cli command', 'api endpoint', 'http', 'server', 'output shows',
  'exit code', 'binary', 'runs and produces', 'cli outputs', 'when run',
];

const ENVIRONMENT_PROVABLE_KEYWORDS = [
  'docker', 'container', 'observability', 'telemetry', 'database',
  'queue', 'distributed', 'multi-service', 'end-to-end', 'victorialogs',
];

const ESCALATE_TIER_KEYWORDS = [
  'physical hardware', 'human visual', 'paid service', 'gpu',
  'manual inspection', 'physical display',
];

/**
 * Classifies an AC description into a VerificationTier based on keyword matching.
 * Priority: escalate > environment-provable > runtime-provable > test-provable (default).
 */
export function classifyTier(description: string): VerificationTier {
  const lower = description.toLowerCase();
  // Check highest priority first
  for (const kw of ESCALATE_TIER_KEYWORDS) {
    if (lower.includes(kw)) return 'escalate';
  }
  for (const kw of ENVIRONMENT_PROVABLE_KEYWORDS) {
    if (lower.includes(kw)) return 'environment-provable';
  }
  for (const kw of RUNTIME_PROVABLE_KEYWORDS) {
    if (lower.includes(kw)) return 'runtime-provable';
  }
  // Default: test-provable
  return 'test-provable';
}
```

### Simplified `parseVerificationTag()`

Change return type and add legacy mapping:
```typescript
export function parseVerificationTag(text: string): VerificationTier | null {
  const match = VERIFICATION_TAG_PATTERN.exec(text);
  if (!match) return null;
  const raw = match[1];
  // Map legacy values to new tiers
  return (LEGACY_TIER_MAP[raw] ?? raw) as VerificationTier;
}
```

### Simplified `flushCurrent()` in `parseStoryACs()`

Replace the current complex conditional (lines 190-196) with:
```typescript
const tag = parseVerificationTag(description);
const tier: VerificationTier = tag ?? classifyTier(description);
const verifiability = classifyVerifiability(description); // deprecated, kept for compat
const strategy = classifyStrategy(description); // deprecated, kept for compat
```

### Architecture Compliance

- **300-line limit:** `parser.ts` is currently 278 lines. Adding `classifyTier()` and keyword arrays will add ~40 lines. Simplifying `flushCurrent()` saves ~10 lines. Net: ~310 lines. If over 300, extract the keyword arrays to a `parser-keywords.ts` file.
- **No new dependencies.** All imports already exist.
- **Backward compat:** `classifyVerifiability()` and `classifyStrategy()` remain exported. Existing tests keep passing. Downstream code (validation-acs.ts, validation-runner.ts) still uses them until stories 16-3/16-4 migrate.

### Testing Standards

- Framework: vitest
- Test file: `src/modules/verify/__tests__/verify-parser.test.ts`
- Coverage target: 100%
- Pattern: Import new `classifyTier` alongside existing exports. Add a new `describe('classifyTier', ...)` block. Keep all existing test blocks.
- The test file already imports from `../parser.js` — add `classifyTier` to the import.

### Previous Story Intelligence (16-1)

Story 16-1 added `VerificationTier` type, `TIER_HIERARCHY`, `maxTier()`, `LEGACY_TIER_MAP` to `types.ts` and `tier` field to `ParsedAC`. The parser already populates the `tier` field with working but complex logic. This story replaces that logic with `classifyTier()` and simplified `parseVerificationTag()`.

Key learning from 16-1: The `flushCurrent()` helper was modified to derive tier from tags, with a fallback to `LEGACY_TIER_MAP[verifiability]`. The current code works but is confusing — it computes `isNewTier` to decide whether the tag is a new-style tier or a legacy value, then branches. This story eliminates that branching by having `parseVerificationTag()` always return a `VerificationTier` (mapping legacy values internally).

### Git Intelligence

Recent commit `958ce49` (story 16-1) modified `src/modules/verify/types.ts` and `src/modules/verify/parser.ts`. The parser changes added the `tier` field population logic in `flushCurrent()`. The test file was updated to verify `tier` field values.

### Project Structure Notes

- Source: `src/modules/verify/parser.ts`
- Tests: `src/modules/verify/__tests__/verify-parser.test.ts`
- Types: `src/modules/verify/types.ts` (already updated by 16-1)
- No new files needed unless 300-line limit is exceeded

### References

- [Source: _bmad-output/implementation-artifacts/tech-spec-verification-tier-rework.md#Task 2]
- [Source: src/modules/verify/types.ts — VerificationTier, LEGACY_TIER_MAP, TIER_HIERARCHY]
- [Source: src/modules/verify/parser.ts — classifyStrategy L85, classifyVerifiability L64, parseVerificationTag L107, flushCurrent L186]
- [Source: _bmad-output/implementation-artifacts/16-1-verification-tier-type-and-utilities.md]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-2-rewrite-parser-tier-classification-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via subprocess
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (if applicable)

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — no debug issues encountered.

### Completion Notes List
- Added `classifyTier()` function with four keyword arrays for tier classification (escalate > environment-provable > runtime-provable > test-provable default)
- Updated `parseVerificationTag()` return type from `Verifiability | VerificationTier | null` to `VerificationTier | null`, with legacy values mapped through `LEGACY_TIER_MAP`
- Simplified `flushCurrent()` in `parseStoryACs()` — replaced complex `isNewTier` branching with `const tier = tag ?? classifyTier(description)`
- Added `@deprecated` JSDoc to `classifyVerifiability()` and `classifyStrategy()` pointing to `classifyTier()`
- Extracted all keyword arrays to `parser-keywords.ts` (parser.ts was 325 lines, now 267 — under 300-line limit)
- Added 15 new `classifyTier` tests covering all four tiers, case insensitivity, priority ordering, and multiple keyword matches
- Updated `parseVerificationTag` tests for legacy backward compat (cli-verifiable -> test-provable, integration-required -> environment-provable)
- Updated existing `parseStoryACs` tests to reflect new behavior where `tier` is derived by `classifyTier()` independently of `verifiability`
- Exported `classifyTier` from `index.ts` for public API
- Updated `AGENTS.md` with new `parser-keywords.ts` file and updated exports
- All 3872 tests pass, zero regressions

### Change Log
- 2026-03-27: Story 16-2 implementation complete — classifyTier, parseVerificationTag rewrite, flushCurrent simplification, deprecation annotations, keyword extraction, comprehensive tests

### File List
- src/modules/verify/parser.ts (modified)
- src/modules/verify/parser-keywords.ts (new)
- src/modules/verify/index.ts (modified)
- src/modules/verify/AGENTS.md (modified)
- src/modules/verify/__tests__/verify-parser.test.ts (modified)
