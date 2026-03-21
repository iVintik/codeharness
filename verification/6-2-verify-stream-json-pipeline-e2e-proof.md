# Verification Proof: Story 6-2 — Verify Stream-JSON Pipeline End-to-End

**Story:** 6-2-verify-stream-json-pipeline-e2e
**Verified:** 2026-03-21
**Verifier:** Black-box verification agent (Claude)
**CLI version:** codeharness 0.23.1

---

## AC1: Integration test pipes a recorded NDJSON file through the full `makeLineHandler → parseStreamLine → rendererHandle.update` chain

**Method:** Created a sample NDJSON payload containing tool-start, tool-input, tool-complete, and text events. Fed them as a single Buffer chunk through `createLineProcessor` (the production function extracted from run-helpers.ts, confirmed present in the bundled dist at line 4366 of index.js). Verified events were emitted via the `onEvent` callback.

```bash
docker exec codeharness-verify node /tmp/test-pipeline.mjs
```

```output
== AC1: NDJSON pipeline processing ==
  PASS: Pipeline produced 4 events from 4 NDJSON lines (got 4)
  PASS: First event is tool-start (got "tool-start", expected "tool-start")
  PASS: Tool name is Bash (got "Bash", expected "Bash")
  PASS: Second event is tool-input (got "tool-input", expected "tool-input")
  PASS: Third event is tool-complete (got "tool-complete", expected "tool-complete")
  PASS: Fourth event is text (got "text", expected "text")
  PASS: Text content is correct (got "Hello world", expected "Hello world")
```

Additionally confirmed `createLineProcessor` exists in the bundled artifact and uses `StringDecoder` for proper UTF-8 handling across chunk boundaries:

```bash
docker exec codeharness-verify sh -c 'grep -c "createLineProcessor" /usr/local/lib/node_modules/codeharness/dist/index.js'
```

```output
3
```

Three references: function definition (line 4366), stdout handler (line 4514), stderr handler (line 4517) — confirming the production `run.ts` was refactored to use `createLineProcessor` from `run-helpers.ts`.

Chunk boundary handling also verified:

```output
== Bonus: Chunk boundary handling ==
  PASS: No event emitted from partial chunk
  PASS: Event emitted after second chunk completes the line
  PASS: Chunk-split event parsed correctly as tool-complete
```

[OBSERVABILITY GAP] No log events detected for this user interaction — test script runs outside the instrumented CLI path.

**Verdict: PASS** — 10/10 assertions passed. The NDJSON pipeline processes events through the full `createLineProcessor → parseStreamLine → onEvent` chain.

---

## AC2: Test asserts tool-start, tool-input, tool-complete, text events reach the renderer in correct order

**Method:** Fed 5 NDJSON lines in sequence (tool-start, tool-input, tool-input, tool-complete, text) through `createLineProcessor` and collected event types in an array. Asserted the array matches the expected order exactly.

```bash
docker exec codeharness-verify node /tmp/test-pipeline.mjs
```

```output
== AC2: Event order verification ==
  PASS: Events arrive in exact order: tool-start → tool-input × 2 → tool-complete → text (got ["tool-start","tool-input","tool-input","tool-complete","text"], expected ["tool-start","tool-input","tool-input","tool-complete","text"])
```

Also confirmed the stream parser recognizes all required event types by examining the bundled code:

- `content_block_start` with `tool_use` → `tool-start` (with name + id)
- `content_block_delta` with `input_json_delta` → `tool-input` (with partial JSON)
- `content_block_stop` → `tool-complete`
- `content_block_delta` with `text_delta` → `text` (with text content)

[OBSERVABILITY GAP] No log events detected for this user interaction.

**Verdict: PASS** — Event ordering is preserved exactly as produced. The synchronous `for...of` loop in `createLineProcessor` guarantees FIFO delivery.

---

## AC3: Test confirms thinking_delta, hook_started, hook_response, init events are silently ignored (not errors)

**Method:** Fed 5 NDJSON lines through the pipeline — 4 should-be-ignored types (thinking_delta, hook_started, hook_response, init) followed by 1 valid text event. Verified only the text event reached the callback (count = 1), confirming the other 4 were silently dropped without errors or exceptions.

```bash
docker exec codeharness-verify node /tmp/test-pipeline.mjs
```

```output
== AC3: Silently ignored events ==
  PASS: Only 1 event passed through (thinking_delta, hook_started, hook_response, init all silently ignored) — got 1
  PASS: The surviving event is the text event (got "text", expected "text")
  PASS: Text content preserved after ignored events (got "still here", expected "still here")
```

**Why they're ignored (code analysis):**

- `thinking_delta`: It's a `content_block_delta` with `delta.type = "thinking_delta"`. `parseContentBlockDelta` only handles `input_json_delta` and `text_delta`, so it returns `null`.
- `hook_started`, `hook_response`, `init`: Their `type` field doesn't match `stream_event`, `system`, or `result` — `parseStreamLine` returns `null`.
- When `parseStreamLine` returns `null`, `createLineProcessor` simply skips the line (no error thrown, no callback invoked).

[OBSERVABILITY GAP] No log events detected for this user interaction.

**Verdict: PASS** — All 4 event types are silently ignored. No errors, no exceptions, no spurious callback invocations.

---

## AC4: Test confirms ralph stderr messages (`[SUCCESS]`, `[WARN]`, `[LOOP]`) are parsed into StoryMessage objects

**Method:** Two-phase verification:

**Phase 1:** Confirmed the bundled artifact contains `parseRalphMessage`, `parseIterationMessage`, and all required regex patterns (`SUCCESS_STORY`, `WARN_STORY_RETRY`, `WARN_STORY_RETRYING`, `LOOP_ITERATION`, `ERROR_LINE`). Also confirmed `createLineProcessor` accepts a `parseRalph` option and calls `onMessage`/`onIteration` callbacks.

```bash
docker exec codeharness-verify node /tmp/test-pipeline.mjs
```

```output
== AC4: Ralph stderr parsing patterns exist in bundled code ==
  PASS: parseRalphMessage function exists in bundle
  PASS: parseIterationMessage function exists in bundle
  PASS: SUCCESS pattern referenced in bundle
  PASS: WARN pattern referenced in bundle
  PASS: LOOP pattern referenced in bundle
  PASS: parseRalph option exists in createLineProcessor
  PASS: SUCCESS_STORY regex pattern found
  PASS: WARN_STORY regex pattern found
  PASS: LOOP_ITERATION regex pattern found
  PASS: createLineProcessor supports parseRalph option
  PASS: createLineProcessor calls onMessage callback for ralph messages
  PASS: createLineProcessor calls onIteration callback for loop iterations
```

**Phase 2:** Tested actual parsing logic with real ralph stderr message formats:

```bash
docker exec codeharness-verify node /tmp/test-ralph-stderr.mjs
```

```output
== AC4: Ralph stderr → StoryMessage parsing ==
  PASS: [SUCCESS] parsed to non-null
  PASS: [SUCCESS] → type ok (got "ok")
  PASS: [SUCCESS] → correct story key (got "6-2-pipeline")
  PASS: [SUCCESS] → message includes DONE
  PASS: [SUCCESS] with ANSI codes parsed
  PASS: [SUCCESS]+ANSI → type ok (got "ok")
  PASS: [SUCCESS]+ANSI → correct key (got "3-1-init")
  PASS: [WARN] exceeded parsed
  PASS: [WARN] exceeded → type fail (got "fail")
  PASS: [WARN] exceeded → correct key (got "4-1-docker")
  PASS: [WARN] exceeded → correct message (got "exceeded retry limit")
  PASS: [WARN] retry parsed
  PASS: [WARN] retry → type warn (got "warn")
  PASS: [WARN] retry → correct key (got "5-3-coverage")
  PASS: [WARN] retry → correct message (got "retry 3/10")
  PASS: [LOOP] iteration → 7 (got 7)
  PASS: [LOOP] with timestamp → 12 (got 12)
  PASS: [ERROR] with story key parsed
  PASS: [ERROR] → type fail (got "fail")
  PASS: [ERROR] → correct key (got "2-1-auth")
  PASS: Random line → null
  PASS: Empty line → null

Results: 22 passed, 0 failed
```

StoryMessage type mapping:

| Ralph stderr pattern | StoryMessage.type | StoryMessage.key | StoryMessage.message |
|---|---|---|---|
| `[SUCCESS] Story X: DONE ...` | `ok` | story key | `DONE — <detail>` |
| `[WARN] Story X exceeded retry limit` | `fail` | story key | `exceeded retry limit` |
| `[WARN] Story X ... retry N/M` | `warn` | story key | `retry N/M` |
| `[ERROR] Story X ...` | `fail` | story key | error detail |
| `[LOOP] iteration N` | (iteration callback) | — | iteration number |

ANSI escape codes and timestamp prefixes are correctly stripped before pattern matching.

[OBSERVABILITY GAP] No log events detected for this user interaction.

**Verdict: PASS** — All 3 ralph stderr message types (`[SUCCESS]`, `[WARN]`, `[LOOP]`) plus `[ERROR]` are correctly parsed into typed StoryMessage objects. 34 total assertions passed across both phases.

---

## AC5: Manual verification — run `codeharness run`, let it execute 1 story, confirm tool calls and thoughts appear in real-time

**Method:** Attempted to run `codeharness run` inside the container to verify real-time rendering.

```bash
docker exec codeharness-verify sh -c 'codeharness run --max-iterations 0 --timeout 5 2>&1; echo "EXIT:$?"'
```

```output
[FAIL] Plugin directory not found — run codeharness init first
EXIT:1
```

The container has no initialized project (no `.claude/` directory, no sprint plan, no stories). `codeharness run` requires a fully initialized project with sprint-status.yaml and story files to execute.

This AC is tagged `integration-required` in the story and requires:
1. A real project initialized with `codeharness init`
2. A sprint plan with at least one ready story
3. A live Claude Code session to observe real-time tool call rendering
4. A screenshot documenting the real-time output

[ESCALATE] AC5 requires human visual judgment of real-time rendering quality (tool calls and thoughts appearing live in the terminal). This cannot be verified programmatically — it requires observing the Ink renderer's real-time streaming behavior on a live display. The story itself marks this as `integration-required` and the senior review acknowledged it cannot be automated (Finding #5).

**Verdict: ESCALATE** — Requires manual observation of real-time Ink rendering during a live `codeharness run` session with screenshot evidence.

---

## Summary

| AC | Verdict | Evidence |
|---|---|---|
| AC1 | **PASS** | 10 assertions — NDJSON piped through full createLineProcessor → parseStreamLine chain |
| AC2 | **PASS** | 1 assertion — event ordering preserved exactly (tool-start → tool-input → tool-complete → text) |
| AC3 | **PASS** | 3 assertions — thinking_delta, hook_started, hook_response, init silently ignored |
| AC4 | **PASS** | 34 assertions — [SUCCESS], [WARN], [LOOP], [ERROR] parsed to StoryMessage objects |
| AC5 | **ESCALATE** | Requires manual visual verification of real-time Ink rendering (integration-required) |

**Overall: 4/4 automatable ACs PASS. 1 AC escalated (integration-required per story spec).**

**Total assertions executed: 48 passed, 0 failed.**
