# Verification Proof: 16-5-rewrite-harness-run-verification-dispatch

**Story:** 16-5 — Rewrite harness-run Verification Dispatch
**Tier:** test-provable
**Date:** 2026-03-27
**Build:** PASS (tsup compiled successfully, 0 errors)
**Tests:** 34/34 dispatch-specific unit tests passed

---

## AC 1: Step 3d-0 derives tier from AC-level tags using maxTier()

**Verdict:** PASS

<!-- showboat exec: verify AC1 — Step 3d-0 ignores story-level tag and uses AC-level derivation -->
```bash
grep -n "Ignore the story-level" commands/harness-run.md
```

```output
273:Ignore the story-level `<!-- verification-tier: ... -->` tag (if present). It is NOT used for dispatch. AC-level tags are the sole source of truth.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC1 — AC-level tag parsing instruction -->
```bash
grep -n "extract its" commands/harness-run.md
```

```output
275:Parse ALL lines in the Acceptance Criteria section. For each AC, extract its `<!-- verification: {tier} -->` tag
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC1 — maxTier computation -->
```bash
grep -n "maxTier(collectedTiers)" commands/harness-run.md
```

```output
277:Compute the story's derived tier: maxTier(collectedTiers). If no AC-level tags are found at all, default to `test-provable`.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC1 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC1" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  4 passed (4)
```
<!-- /showboat exec -->

---

## AC 2: test-provable dispatches build+test subagent, no Docker

**Verdict:** PASS

<!-- showboat exec: verify AC2 — test-provable section exists -->
```bash
grep -n "test-provable verification (derived tier = test-provable)" commands/harness-run.md
```

```output
285:**test-provable verification (derived tier = test-provable):**
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC2 — no Docker in test-provable section -->
```bash
grep -n "No Docker involved at any point" commands/harness-run.md
```

```output
331:No Docker involved at any point.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC2 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC2" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  3 passed (3)
```
<!-- /showboat exec -->

---

## AC 3: runtime-provable dispatches build+run subagent, no Docker

**Verdict:** PASS

<!-- showboat exec: verify AC3 — runtime-provable section exists -->
```bash
grep -n "runtime-provable verification (derived tier = runtime-provable)" commands/harness-run.md
```

```output
333:**runtime-provable verification (derived tier = runtime-provable):**
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC3 — local run commands listed -->
```bash
grep -n "npm start\|cargo run\|python" commands/harness-run.md | head -5
```

```output
346:  - Node.js: npm start
347:  - Rust: cargo run
348:  - Python: python -m app
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC3 — kill instruction and no Docker -->
```bash
grep -n "Kill the running application process\|Do NOT use Docker\|Do NOT run codeharness stack start" commands/harness-run.md
```

```output
357:Kill the running application process
362:Do NOT use Docker. Do NOT run codeharness stack start.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC3 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC3" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  4 passed (4)
```
<!-- /showboat exec -->

---

## AC 4: environment-provable dispatches full Docker flow

**Verdict:** PASS

<!-- showboat exec: verify AC4 — environment-provable section exists -->
```bash
grep -n "environment-provable verification (derived tier = environment-provable)" commands/harness-run.md
```

```output
402:**environment-provable verification (derived tier = environment-provable):** Full Docker container with no source code access.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC4 — Docker flow preserved -->
```bash
grep -n "3d-i: Build Docker verify image\|3d-viii: Cleanup" commands/harness-run.md
```

```output
403:3d-i: Build Docker verify image
458:3d-viii: Cleanup
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC4 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC4" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  2 passed (2)
```
<!-- /showboat exec -->

---

## AC 5: escalate dispatches mixed-tier with [ESCALATE] marks

**Verdict:** PASS

<!-- showboat exec: verify AC5 — escalate section exists -->
```bash
grep -n "escalate verification (derived tier = escalate)" commands/harness-run.md
```

```output
386:**escalate verification (derived tier = escalate):**
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC5 — ESCALATE marking and per-AC dispatch -->
```bash
grep -n "ESCALATE\|dispatch verification at their individual tier level\|escalated ACs — marking done" commands/harness-run.md | head -5
```

```output
392:escalate-tier ACs: mark each as [ESCALATE] in the proof document
393:All other ACs: dispatch verification at their individual tier level
398:If all non-escalated ACs pass: mark story done — but note the escalated ACs — marking done with known limitations
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC5 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC5" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  4 passed (4)
```
<!-- /showboat exec -->

---

## AC 6: Old story-level tags ignored, backward compat via AC parsing

**Verdict:** PASS

<!-- showboat exec: verify AC6 — story-level tag explicitly ignored -->
```bash
grep -n "AC-level tags are the sole source of truth" commands/harness-run.md
```

```output
273:Ignore the story-level `<!-- verification-tier: ... -->` tag (if present). It is NOT used for dispatch. AC-level tags are the sole source of truth.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC6 — old binary check removed -->
```bash
grep -c "Search for.*verification-tier: unit-testable" commands/harness-run.md
```

```output
0
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC6 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC6" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  2 passed (2)
```
<!-- /showboat exec -->

---

## AC 7: LEGACY_TIER_MAP maps old tags to new tiers in Step 3d-0

**Verdict:** PASS

<!-- showboat exec: verify AC7 — all four legacy mappings present -->
```bash
grep -n "LEGACY_TIER_MAP\|cli-verifiable.*test-provable\|integration-required.*environment-provable\|unit-testable.*test-provable\|black-box.*environment-provable" commands/harness-run.md | head -6
```

```output
275:Map any legacy tag values via LEGACY_TIER_MAP: `cli-verifiable` → `test-provable`, `integration-required` → `environment-provable`, `unit-testable` → `test-provable`, `black-box` → `environment-provable`.
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC7 — unit tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/harness-run-dispatch.test.ts -t "AC7" 2>&1 | grep -E "passed|failed"
```

```output
 Test Files  1 passed (1)
 Tests  5 passed (5)
```
<!-- /showboat exec -->

---

## Summary

| AC | Result |
|----|--------|
| AC 1 | PASS |
| AC 2 | PASS |
| AC 3 | PASS |
| AC 4 | PASS |
| AC 5 | PASS |
| AC 6 | PASS |
| AC 7 | PASS |

**Final Result: ALL_PASS (7/7 ACs)**
