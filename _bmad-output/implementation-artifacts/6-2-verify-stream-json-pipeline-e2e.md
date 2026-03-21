# Story 6-2: Verify Stream-JSON Pipeline End-to-End

## Status: backlog

## Goal
Prove the full data flow works: Claude stream-json → ralph tee → Node.js handler → Ink renderer. Add an E2E test that pipes real NDJSON through the full pipeline and asserts the renderer receives correct events.

## Context
The pipeline has never been tested end-to-end. Each layer has unit tests but no integration test confirms data flows from ralph's stdout through to the Ink renderer in real-time. Potential issues: tee buffering in pipe mode, NDJSON line splitting across chunk boundaries, thinking_delta events polluting the stream.

## Acceptance Criteria

- [ ] AC1: Integration test pipes a recorded NDJSON file (from `ralph/logs/`) through the full `makeLineHandler → parseStreamLine → rendererHandle.update` chain
- [ ] AC2: Test asserts tool-start, tool-input, tool-complete, text events reach the renderer in correct order
- [ ] AC3: Test confirms thinking_delta, hook_started, hook_response, init events are silently ignored (not errors)
- [ ] AC4: Test confirms ralph stderr messages (`[SUCCESS]`, `[WARN]`, `[LOOP]`) are parsed into StoryMessage objects
- [ ] AC5: Manual verification: run `codeharness run`, let it execute 1 story, confirm tool calls and thoughts appear in real-time (document with screenshot in proof)

## Files to Change
- `tests/run-pipeline.test.ts` — new integration test
- `tests/fixtures/sample-stream.ndjson` — recorded fixture from real session
