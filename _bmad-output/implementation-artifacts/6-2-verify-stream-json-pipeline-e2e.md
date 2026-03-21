# Story 6-2: Verify Stream-JSON Pipeline End-to-End

## Status: verifying

## Story

As a developer maintaining codeharness,
I want an end-to-end integration test for the stream-JSON pipeline,
so that I can confidently refactor any layer knowing the full data flow is validated.

## Goal

Prove the full data flow works: Claude stream-json → ralph tee → Node.js handler → Ink renderer. Add an E2E test that pipes real NDJSON through the full pipeline and asserts the renderer receives correct events.

## Context

The pipeline has never been tested end-to-end. Each layer has unit tests but no integration test confirms data flows from ralph's stdout through to the Ink renderer in real-time. Potential issues: tee buffering in pipe mode, NDJSON line splitting across chunk boundaries, thinking_delta events polluting the stream.

## Acceptance Criteria

- [x] AC1: Integration test pipes a recorded NDJSON file (from `ralph/logs/`) through the full `makeLineHandler → parseStreamLine → rendererHandle.update` chain <!-- verification: cli-verifiable -->
- [x] AC2: Test asserts tool-start, tool-input, tool-complete, text events reach the renderer in correct order <!-- verification: cli-verifiable -->
- [x] AC3: Test confirms thinking_delta, hook_started, hook_response, init events are silently ignored (not errors) <!-- verification: cli-verifiable -->
- [x] AC4: Test confirms ralph stderr messages (`[SUCCESS]`, `[WARN]`, `[LOOP]`) are parsed into StoryMessage objects <!-- verification: cli-verifiable -->
- [ ] AC5: Manual verification: run `codeharness run`, let it execute 1 story, confirm tool calls and thoughts appear in real-time (document with screenshot in proof) <!-- verification: integration-required -->

## Files to Change

- `src/__tests__/run-pipeline.test.ts` — new integration test (uses production `createLineProcessor`)
- `tests/fixtures/sample-stream.ndjson` — recorded fixture from real session
- `src/lib/run-helpers.ts` — extracted `createLineProcessor` from run.ts for testability
- `src/commands/run.ts` — refactored to use `createLineProcessor` from run-helpers.ts

## Senior Developer Review (AI)

**Reviewed:** 2026-03-21
**Reviewer:** Adversarial code review (Claude)

### Findings

#### Fixed (HIGH)
1. **Test reimplemented `makeLineHandler` instead of using production code** — The integration test reconstructed the line handler logic by hand, meaning changes to the real `makeLineHandler` in run.ts would not be caught. Extracted `createLineProcessor` from run.ts into run-helpers.ts and rewired both run.ts and the test to use the same function. The test now exercises the actual production code path.

2. **Story File List listed wrong path** — Story claimed `tests/run-pipeline.test.ts` but actual file was at `src/__tests__/run-pipeline.test.ts`. Fixed in File List.

#### Fixed (MEDIUM)
3. **Unused `vi` import** — `vi` was imported from vitest but never used. Removed.

4. **`makeLineHandler` was not exportable from run.ts** — The function was defined inside a closure, making it impossible to test without reimplementation. Extracted to `createLineProcessor` in run-helpers.ts with a callback-based API, making it both testable and reusable.

#### Not Fixed (LOW)
5. **AC5 remains incomplete** — Manual verification with screenshot cannot be automated. Left as `[ ]` per story spec (`integration-required`).

6. **No test for multi-byte UTF-8 characters split across chunk boundaries** — The `StringDecoder` usage in `createLineProcessor` handles this, but no test explicitly verifies it with real multi-byte chars (e.g., emoji, CJK). The chunk-boundary test only uses ASCII.

7. **Renderer state accumulation test (line 330+) simulates renderer logic** — It manually walks events with a switch statement rather than using the real renderer. This is acceptable for a pipeline test but a true E2E test would instantiate the Ink renderer.

### Change Log
- 2026-03-21: Adversarial review — extracted `createLineProcessor`, rewired run.ts + test, removed dead import, fixed File List
