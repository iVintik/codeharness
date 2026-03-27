# Story 16-2: Rewrite Parser Tier Classification
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want the story parser to classify ACs using the new four-tier `VerificationTier` system,
So that tier assignment uses clear keyword matching and the old three-system confusion is eliminated.

## Acceptance Criteria

- [ ] AC1: Given `classifyTier("Given function X exists, when called with Y, then returns Z")`, when called, then it returns `'test-provable'` <!-- verification: test-provable -->
- [ ] AC2: Given `classifyTier("Given the CLI outputs JSON when --format json is passed")`, when called, then it returns `'runtime-provable'` <!-- verification: test-provable -->
- [ ] AC3: Given `classifyTier("Given logs appear in VictoriaLogs after the request")`, when called, then it returns `'environment-provable'` <!-- verification: test-provable -->
- [ ] AC4: Given `classifyTier("Given 60fps rendering on a physical display")`, when called, then it returns `'escalate'` <!-- verification: test-provable -->
- [ ] AC5: Given `classifyTier("Given the type is exported from types.ts")`, when called, then it returns `'test-provable'` (keyword: "type", "export") <!-- verification: test-provable -->
- [ ] AC6: Given `classifyTier("Given the API endpoint returns 200")`, when called, then it returns `'runtime-provable'` (keyword: "API endpoint") <!-- verification: test-provable -->
- [ ] AC7: Given `classifyTier("Given the Docker container starts successfully")`, when called, then it returns `'environment-provable'` (keyword: "Docker", "container") <!-- verification: test-provable -->
- [ ] AC8: Given `parseVerificationTag('<!-- verification: test-provable -->')`, when called, then it returns `'test-provable'` as a `VerificationTier` <!-- verification: test-provable -->
- [ ] AC9: Given `parseVerificationTag('<!-- verification: cli-verifiable -->')`, when called, then it returns `'test-provable'` via `LEGACY_TIER_MAP` backward compat <!-- verification: test-provable -->
- [ ] AC10: Given `parseVerificationTag('<!-- verification: integration-required -->')`, when called, then it returns `'environment-provable'` via `LEGACY_TIER_MAP` backward compat <!-- verification: test-provable -->
- [ ] AC11: Given `parseStoryACs()` is called on a story file, when ACs are parsed, then each `ParsedAC` has a `tier: VerificationTier` field populated from the AC's verification tag or from `classifyTier()` fallback <!-- verification: test-provable -->
- [ ] AC12: Given the old `classifyStrategy()` function, when inspected, then it is marked `@deprecated` with a comment pointing to `classifyTier()` <!-- verification: test-provable -->

## Technical Notes

**File:** `src/modules/verify/parser.ts`

**New function** `classifyTier(description: string): VerificationTier` — replaces `classifyStrategy()`. Keyword lists (all case-insensitive matching):

- **test-provable:** `"file exists"`, `"export"`, `"type"`, `"interface"`, `"test passes"`, `"line count"`, `"coverage"`, `"refactor"`, `"rename"`, `"documentation"`, `"function"`, `"when inspected"`, `"config"`
- **runtime-provable:** `"CLI command"`, `"API endpoint"`, `"HTTP"`, `"server"`, `"output shows"`, `"exit code"`, `"binary"`, `"runs and produces"`, `"CLI outputs"`, `"when run"`
- **environment-provable:** `"Docker"`, `"container"`, `"observability"`, `"telemetry"`, `"database"`, `"queue"`, `"distributed"`, `"multi-service"`, `"end-to-end"`, `"VictoriaLogs"`
- **escalate:** `"physical hardware"`, `"human visual"`, `"paid service"`, `"GPU"`, `"manual inspection"`, `"physical display"`

Priority order (first match wins): `escalate` > `environment-provable` > `runtime-provable` > `test-provable` (default).

**Update `VERIFICATION_TAG_PATTERN`** (L98) to accept all four new tier names plus the old names:
```typescript
const VERIFICATION_TAG_PATTERN = /<!--\s*verification:\s*(test-provable|runtime-provable|environment-provable|escalate|cli-verifiable|integration-required)\s*-->/;
```

**Update `parseVerificationTag()`** (L104-L107): Parse the tag, then run through `LEGACY_TIER_MAP` if it's an old value. Return type becomes `VerificationTier | null`.

**Update `parseStoryACs()`** (L140-L218): In the `flushCurrent()` helper (L183-L201), compute `tier` from the verification tag (via `parseVerificationTag`) or fall back to `classifyTier(description)`. Set the `tier` field on each `ParsedAC`.

Keep `classifyStrategy()` and `classifyVerifiability()` but mark both `@deprecated`.

## Files to Change

- `src/modules/verify/parser.ts` — Add `classifyTier()` function. Update `VERIFICATION_TAG_PATTERN` regex. Update `parseVerificationTag()` return type to `VerificationTier | null` with legacy mapping. Update `parseStoryACs()` to populate `tier` field. Deprecate `classifyStrategy()` and `classifyVerifiability()`.
