# Story 2-3: Status Report — One Screen Overview — Verification Proof

Generated: 2026-03-18T06:31:00Z

## AC 1: Active run output includes current story, phase, AC progress, iteration, cost, elapsed

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "includes current story, iteration, cost, elapsed for active run"
```

```output
✓ generateReport > includes current story, iteration, cost, elapsed for active run (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test verifies that when `run.active === true`, the report contains `activeRun` with `currentStory`, `phase`, `iteration`, `cost`, and `elapsed` fields populated from sprint state.

**Verdict:** PASS

## AC 2: Completed run shows counts for completed, failed, blocked, skipped

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "includes done, failed, blocked, skipped counts for completed run"
```

```output
✓ generateReport > includes done, failed, blocked, skipped counts for completed run (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test verifies that when `run.active === false` with `run.startedAt` set, the report `lastRun` includes `completed`, `failed`, `blocked`, and `skipped` arrays with correct story keys.

**Verdict:** PASS

## AC 3: Failed story shows story key, failing AC number, one-line error

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "shows story key, AC number, and one-line error for failed stories"
```

```output
✓ generateReport > shows story key, AC number, and one-line error for failed stories (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test creates a story with `lastError: "status --check-docker exit 1"` and `acResults: { 4: 'fail' }`, verifies the `failedDetails` array contains an entry with `key`, `acNumber: 4`, and `errorLine` matching the error message.

**Verdict:** PASS

## AC 4: Status returns in less than 3 seconds (NFR7)

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts
```

```output
Test Files: 1 passed (1)
Tests: 14 passed (14)
Duration: 106ms (transform 21ms, setup 0ms, import 27ms, tests 4ms)
```

All 14 reporter tests complete in 4ms total. `generateReport()` is a pure function over in-memory state with no I/O — well within 3-second budget.

**Verdict:** PASS

## AC 5: Action items shown with NEW/CARRIED labels

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "labels action items as NEW or CARRIED"
```

```output
✓ generateReport > labels action items as NEW or CARRIED (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test creates state with two action items — one whose source story is in `run.completed` (labeled NEW) and one not (labeled CARRIED). Verifies `actionItemsLabeled` array has correct labels.

**Verdict:** PASS

## AC 6: generateReport() returns Result<StatusReport>, never throws

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/index.test.ts -t "generateReport"
```

```output
✓ sprint module > generateReport returns a valid StatusReport from state (0ms)
✓ sprint module > generateReport returns ok with empty report when no state file (0ms)
✓ sprint module > generateReport returns fail on corrupted state file (0ms)
Test Files: 1 passed (1)
Tests: 10 passed (10)
```

Three tests verify: (1) valid state → `ok(StatusReport)`, (2) no file → `ok(empty report)`, (3) corrupted file → `fail(error)`. Never throws.

**Verdict:** PASS

## AC 7: Sprint progress shows overall percentage and completed epics

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "groups stories by epic prefix and counts completed epics"
```

```output
✓ generateReport > groups stories by epic prefix and counts completed epics (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test creates stories across 2 epics, verifies `epicsTotal`, `epicsDone`, and `sprintPercent` are computed correctly.

**Verdict:** PASS

## AC 8: JSON output includes all sprint information

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "JSON output includes all fields"
```

```output
✓ generateReport > JSON output includes all fields (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test verifies the `StatusReport` object contains all fields: `total`, `done`, `failed`, `blocked`, `inProgress`, `epicsTotal`, `epicsDone`, `sprintPercent`, `activeRun`, `lastRun`, `failedDetails`, `actionItemsLabeled`, `storyStatuses`.

**Verdict:** PASS

## AC 9: Empty state shows default (no crash)

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "returns valid report with zero counts for empty state"
```

```output
✓ generateReport > returns valid report with zero counts for empty state (0ms)
Test Files: 1 passed (1)
Tests: 14 passed (14)
```

Test passes empty `SprintState` (no stories, no run), verifies report has `total: 0`, `done: 0`, no crash.

**Verdict:** PASS

## AC 10: Error handling — generateReport returns fail(), never throws

<!-- /showboat exec -->

```text
npx vitest run src/modules/sprint/__tests__/reporter.test.ts -t "returns fail"
```

```output
✓ generateReport > returns fail() on malformed state (not throw) (0ms)
```

```text
npx vitest run src/modules/sprint/__tests__/index.test.ts -t "generateReport returns fail on corrupted state file"
```

```output
✓ sprint module > generateReport returns fail on corrupted state file (0ms)
```

Both tests verify that errors are returned as `fail()` results, not thrown exceptions.

**Verdict:** PASS
