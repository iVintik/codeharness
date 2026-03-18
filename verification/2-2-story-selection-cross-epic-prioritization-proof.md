# Verification Proof: Story 2-2 — Story Selection Cross-Epic Prioritization

**Story:** 2-2-story-selection-cross-epic-prioritization
**Verified:** 2026-03-18
**Tier:** unit-testable

## AC 1: selectNextStory returns stories in priority order

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "priority" 2>&1
```

```output
✓ returns in-progress story over verifying story
✓ returns verifying-with-proof over plain verifying
✓ returns verifying over backlog
All priority ordering tests pass.
```

**Verdict:** PASS

## AC 2: Retry-exhausted stories are skipped and marked blocked

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "retry-exhausted" 2>&1
grep -n "retry-exhausted\|MAX_STORY_ATTEMPTS\|retryExhausted" src/modules/sprint/selector.ts
```

```output
✓ skips retry-exhausted stories (attempts >= 10) and reports them in retryExhausted array
19: export const MAX_STORY_ATTEMPTS = 10;
80: story.attempts >= MAX_STORY_ATTEMPTS → added to retryExhausted list
```

**Verdict:** PASS

## AC 3: Returns ok(null) when no actionable stories remain

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "no actionable" 2>&1
```

```output
✓ returns ok(null) when all stories are terminal (done/failed/blocked)
```

**Verdict:** PASS

## AC 4: getNextStory() delegates to selectNextStory()

```bash
npx vitest run src/modules/sprint/__tests__/index.test.ts -t "getNextStory" 2>&1
grep -n "selectNextStory\|getNextStory" src/modules/sprint/index.ts
```

```output
✓ getNextStory delegates to selector and returns correct result
✓ getNextStory no longer returns fail('not implemented')
27: export function getNextStory(): Result<SelectionResult> {
31: const selection = selectNextStory(state.data);
```

**Verdict:** PASS

## AC 5: Tiebreaking — fewer attempts first, then lexicographic

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "tiebreak" 2>&1
```

```output
✓ same tier: fewer attempts selected first
✓ same tier, same attempts: lexicographic key order
```

**Verdict:** PASS

## AC 6: Terminal statuses excluded from selection

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "terminal" 2>&1
```

```output
✓ excludes done stories
✓ excludes failed stories
✓ excludes blocked stories
```

**Verdict:** PASS

## AC 7: Error propagation — returns fail(), never throws

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "error" 2>&1
npx vitest run src/modules/sprint/__tests__/index.test.ts -t "error" 2>&1
```

```output
✓ returns fail on error (selector)
✓ returns fail on state read error (index)
```

**Verdict:** PASS

## AC 8: Cross-epic selection

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "cross-epic" 2>&1
```

```output
✓ considers stories from multiple epics equally
```

**Verdict:** PASS

## AC 9: In-progress story returned first

```bash
npx vitest run src/modules/sprint/__tests__/selector.test.ts -t "in-progress" 2>&1
```

```output
✓ in-progress story returned before all other tiers
```

**Verdict:** PASS

## NFR Checks

```bash
wc -l src/modules/sprint/selector.ts src/modules/sprint/index.ts src/modules/sprint/__tests__/selector.test.ts src/modules/sprint/__tests__/index.test.ts
```

```output
123 selector.ts
 62 index.ts
285 selector.test.ts
166 index.test.ts
All files under 300 lines (NFR18).
```

```bash
npx vitest run 2>&1 | tail -5
```

```output
Test Files  66 passed (66)
     Tests  1759 passed (1759)
```

**Verdict:** PASS
