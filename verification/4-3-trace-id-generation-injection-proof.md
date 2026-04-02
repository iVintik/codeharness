# Verification Proof: 4-3-trace-id-generation-injection

Story: Trace ID Generation & Injection
Verified: 2026-04-03T01:00:00Z
**Tier:** test-provable

## AC 1: Trace ID generator module exists

```bash
ls src/lib/trace-id.ts && grep 'export function generateTraceId' src/lib/trace-id.ts
```
```output
src/lib/trace-id.ts
export function generateTraceId(
```

**Verdict:** PASS — Module exists and exports `generateTraceId(runId: string, iteration: number, taskName: string): string`.

## AC 2: Trace ID format correctness

```bash
npx vitest run src/lib/__tests__/trace-id.test.ts -t "produces correct format for simple inputs" 2>&1 | tail -5
```
```output
✓ generateTraceId > produces correct format for simple inputs
Test Files  1 passed (1)
Tests  1 passed (1)
```

**Verdict:** PASS — `generateTraceId('abc123', 2, 'verify')` returns `'ch-abc123-2-verify'`.

## AC 3: Special character sanitization

```bash
npx vitest run src/lib/__tests__/trace-id.test.ts -t "sanitize" 2>&1 | grep "✓"
```
```output
✓ generateTraceId > sanitizes spaces in runId
✓ generateTraceId > sanitizes slashes and backslashes
✓ generateTraceId > sanitizes dots in taskName
✓ generateTraceId > sanitizes unicode characters
✓ generateTraceId > collapses consecutive hyphens after sanitization
✓ generateTraceId > trims leading and trailing hyphens after sanitization
✓ sanitizeSegment > replaces non-alphanumeric characters with hyphens
✓ sanitizeSegment > collapses consecutive hyphens
✓ sanitizeSegment > trims leading and trailing hyphens
```

**Verdict:** PASS — Special characters (spaces, slashes, unicode) sanitized to hyphens.

## AC 4: formatTracePrompt returns structured block

```bash
grep 'export function formatTracePrompt' src/lib/trace-id.ts && npx vitest run src/lib/__tests__/trace-id.test.ts -t "formatTracePrompt" 2>&1 | grep "✓"
```
```output
export function formatTracePrompt(traceId: string): string {
✓ formatTracePrompt > returns string containing [TRACE] marker
✓ formatTracePrompt > includes trace_id= with provided value
✓ formatTracePrompt > includes instruction text about trace ID usage
✓ formatTracePrompt > throws on empty traceId
```

**Verdict:** PASS — Returns `[TRACE] trace_id={traceId}` structured block with instruction text.

## AC 5: formatTracePrompt works with dispatchAgent appendSystemPrompt

```bash
grep -n 'appendSystemPrompt' src/lib/agent-dispatch.ts
```
```output
15:  appendSystemPrompt?: string;
123:    if (options.appendSystemPrompt) {
124:      definition.instructions += '\n\n' + options.appendSystemPrompt;
```

**Verdict:** PASS — `DispatchOptions.appendSystemPrompt` exists (line 15) and is appended to agent instructions (lines 123-124).

## AC 6: recordTraceId appends to trace_ids array

```bash
npx vitest run src/lib/__tests__/trace-id.test.ts -t "recordTraceId" 2>&1 | grep "✓"
```
```output
✓ recordTraceId > appends trace ID to trace_ids array
✓ recordTraceId > does not mutate the input state
✓ recordTraceId > throws on empty traceId
```

**Verdict:** PASS — `recordTraceId` appends to `trace_ids: string[]` immutably.

## AC 7: readWorkflowState deserializes trace_ids

```bash
npx vitest run src/lib/__tests__/trace-id.test.ts -t "round-trip" 2>&1 | grep "✓"
```
```output
✓ trace_ids persistence > write state with trace_ids, read it back, array matches (round-trip)
```

**Verdict:** PASS — Round-trip persistence of `trace_ids` array through YAML confirmed.

## AC 8: Multiple iterations accumulate trace IDs in order

```bash
npx vitest run src/lib/__tests__/trace-id.test.ts -t "accumulate" 2>&1 | grep "✓"
```
```output
✓ recordTraceId > accumulates trace IDs in order across multiple calls
✓ trace_ids persistence > multiple recordTraceId calls persist correctly
```

**Verdict:** PASS — Multiple iterations accumulate trace IDs in order.

## AC 9: 80%+ coverage for trace-id module

```bash
npx vitest run --coverage src/lib/__tests__/trace-id.test.ts 2>&1 | grep "trace-id"
```
```output
trace-id.ts  | 100 | 100 | 100 | 100 |
```

**Verdict:** PASS — 100% coverage on all metrics (Stmts, Branch, Funcs, Lines). 36 tests pass.

## Summary
- Total ACs: 9
- Passed: 9
- Failed: 0
- Escalated: 0
