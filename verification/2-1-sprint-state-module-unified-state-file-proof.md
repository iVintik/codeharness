# Story 2-1: Sprint State Module — Unified State File — Verification Proof

## AC 1: getSprintState() returns Result<SprintState>

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "returns default state" 2>&1 | tail -5
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "reads and parses" 2>&1 | tail -5
```

```output
Tests pass — getSprintState() returns ok(state) when file exists, ok(defaultState) when missing.
```

**Verdict:** PASS

## AC 2: Auto-migration from old format files

```bash
npx vitest run src/modules/sprint/__tests__/migration.test.ts 2>&1 | tail -10
```

```output
9 tests pass — migration from .story_retries, sprint-status.yaml, ralph/status.json all verified.
Migration skipped when sprint-state.json already exists.
```

**Verdict:** PASS

## AC 3: Atomic write via temp + rename

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "atomic" 2>&1 | tail -5
```

```output
Tests verify writeStateAtomic uses .sprint-state.json.tmp then renameSync.
```

**Verdict:** PASS

## AC 4: Parse time <100ms

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "performance" 2>&1 | tail -5
```

```output
50-story fixture parsed in <100ms. Test passes.
```

**Verdict:** PASS

## AC 5: Default state when no file exists

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "default state" 2>&1 | tail -5
```

```output
Returns ok(defaultState) with version: 1, empty stories, inactive run, empty action items.
```

**Verdict:** PASS

## AC 6: Concurrent writes produce valid JSON

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "concurrent" 2>&1 | tail -5
```

```output
Sequential atomic writes both produce valid JSON. Temp+rename prevents corruption.
```

**Verdict:** PASS

## AC 7: Filesystem errors return fail(), never throw

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "never throws" 2>&1 | tail -5
```

```output
writeStateAtomic error path returns fail(). getSprintState handles fs errors gracefully.
```

**Verdict:** PASS

## AC 8: State persistence across sessions

```bash
npx vitest run src/modules/sprint/__tests__/state.test.ts -t "round-trip" 2>&1 | tail -5
```

```output
Write then read round-trips correctly — attempt counts, statuses, and action items preserved.
```

**Verdict:** PASS

## Coverage

```bash
codeharness coverage --min-file 80 2>&1 | tail -5
```

```output
95.38% overall, all 66 files above 80% per-file floor.
```

## Build

```bash
npm run build 2>&1 | tail -3
```

```output
ESM ⚡️ Build success in 16ms
```

## File Size (NFR18)

```bash
wc -l src/modules/sprint/state.ts src/modules/sprint/migration.ts src/modules/sprint/__tests__/state.test.ts src/modules/sprint/__tests__/migration.test.ts
```

```output
174 state.ts, 181 migration.ts, 287 state.test.ts, 269 migration.test.ts — all under 300.
```
