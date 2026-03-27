# Verification Proof: 16-6-update-create-story-tier-criteria

**Story:** 16-6 — Update create-story Workflow with Tier Criteria
**Tier:** test-provable
**Date:** 2026-03-27
**Build:** PASS (tsup compiled successfully, 0 errors)
**Tests:** 34/34 story-specific unit tests passed; 3961/3961 full suite passed

---

## AC 1: instructions.xml Step 5 contains tier tagging instruction with four tiers

**Verdict:** PASS

<!-- showboat exec: verify AC1 — VERIFICATION TIER TAGGING block exists in Step 5 -->
```bash
grep -n "VERIFICATION TIER TAGGING" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
300:    <!-- VERIFICATION TIER TAGGING — every AC must get a tier tag -->
301:    <critical>🏷️ VERIFICATION TIER TAGGING — Append a tier tag to every AC</critical>
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC1 — all four tiers listed -->
```bash
grep -n "test-provable\|runtime-provable\|environment-provable\|escalate" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml | head -8
```

```output
304:      where {tier} is one of: `test-provable`, `runtime-provable`, `environment-provable`, `escalate`.
308:      - `test-provable` — AC can be verified by building the project and running tests, linters, type checks, or grep.
311:      - `runtime-provable` — AC requires running the built application and checking its behavior.
314:      - `environment-provable` — AC requires a full environment (Docker stack, database, observability, multi-service).
317:      - `escalate` — AC genuinely cannot be automated. This is rare.
322:      - `test-provable`: Given the VerificationTier type in types.ts, when inspected, then it includes all four tier names
323:        `<!-- verification: test-provable -->`
324:      - `runtime-provable`: Given the CLI is invoked with `--help`, when the process runs, then it prints usage information and exits 0
```
<!-- /showboat exec -->

---

## AC 2: Tier tagging instruction includes decision tree with criteria and 4 examples

**Verdict:** PASS

<!-- showboat exec: verify AC2 — Concrete Examples section present -->
```bash
grep -n "Concrete Examples" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
320:      **Concrete Examples (one per tier):**
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC2 — unit tests confirm 4 examples -->
```bash
npx vitest run src/modules/verify/__tests__/create-story-tier-criteria.test.ts 2>&1 | tail -5
```

```output
 Test Files  1 passed (1)
      Tests  34 passed (34)
   Start at  17:12:49
   Duration  93ms (transform 11ms, setup 0ms, import 17ms, tests 3ms, environment 0ms)
```
<!-- /showboat exec -->

---

## AC 3: Tag format is `<!-- verification: {tier} -->`

**Verdict:** PASS

<!-- showboat exec: verify AC3 — tag format specified -->
```bash
grep -n "verification: {tier}" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
303:      `<!-- verification: {tier} -->`
```
<!-- /showboat exec -->

---

## AC 4: No references to cli-verifiable or integration-required as valid tier names

**Verdict:** PASS

<!-- showboat exec: verify AC4 — count legacy references -->
```bash
grep -cn "cli-verifiable\|integration-required" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
1
```
<!-- /showboat exec -->

<!-- showboat exec: verify AC4 — the single match is a prohibition -->
```bash
grep -n "cli-verifiable\|integration-required" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
333:      Do NOT use legacy tier names (`cli-verifiable`, `integration-required`, `unit-testable`, `black-box`).
```
<!-- /showboat exec -->

---

## AC 5: checklist.md Section 3.6 includes check for missing/incorrect tier tags

**Verdict:** PASS

<!-- showboat exec: verify AC5 — Missing verification tier tags bullet -->
```bash
grep -n "Missing verification tier tags" _bmad/bmm/workflows/4-implementation/create-story/checklist.md
```

```output
174:- **Missing verification tier tags:** Every AC must have a `<!-- verification: {tier} -->` tag appended. Check that each AC has one, and that the tier assignment follows the decision tree criteria (test-provable, runtime-provable, environment-provable, escalate). Missing or incorrect tags cause verification dispatch failures.
```
<!-- /showboat exec -->

---

## AC 6: test-provable criteria include code structure, types, file existence, tests, docs, config, refactoring

**Verdict:** PASS

<!-- showboat exec: verify AC6 — test-provable criteria -->
```bash
grep -n "code structure, types, file existence" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
309:        No running application needed. Criteria: code structure, types, file existence, test passing,
```
<!-- /showboat exec -->

---

## AC 7: runtime-provable criteria include running app, CLI output, API endpoint behavior, exit codes

**Verdict:** PASS

<!-- showboat exec: verify AC7 — runtime-provable criteria -->
```bash
grep -n "CLI output, API endpoint behavior, exit codes" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
312:        No Docker stack needed. Criteria: CLI output, API endpoint behavior, exit codes, HTTP responses,
```
<!-- /showboat exec -->

---

## AC 8: environment-provable criteria include Docker, databases, observability stack, multiple services

**Verdict:** PASS

<!-- showboat exec: verify AC8 — environment-provable criteria -->
```bash
grep -n "Docker containers, databases, observability" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
315:        Criteria: Docker containers, databases, observability stack (logs/metrics/traces), multiple services
```
<!-- /showboat exec -->

---

## AC 9: escalate criteria include physical hardware, human visual judgment, paid external services, GPU

**Verdict:** PASS

<!-- showboat exec: verify AC9 — escalate criteria -->
```bash
grep -n "physical hardware, human visual judgment, paid external services" _bmad/bmm/workflows/4-implementation/create-story/instructions.xml
```

```output
318:        Criteria: physical hardware, human visual judgment, paid external services, GPU-dependent rendering.
```
<!-- /showboat exec -->

---

## AC 10: harness-run.md Step 3a contains four-tier decision tree (regression check)

**Verdict:** PASS

<!-- showboat exec: verify AC10 — four tiers in harness-run Step 3a -->
```bash
grep -n "test-provable\|runtime-provable\|environment-provable\|escalate" commands/harness-run.md | head -8
```

```output
47:   - **Blocked (escalated):** A `verifying` story that already has a proof document (`verification/{story_key}-proof.md` exists) with `escalated > 0` and `pending === 0` is blocked. Increment `stories_skipped`, append `{story_key}: blocked (escalated ACs)` to `skipped_reasons`, and print:
49:     [INFO] Skipping {story_key}: blocked (escalated ACs)
161:- `test-provable` — AC can be verified by building the project and running tests/linters/grep. No running app needed.
162:- `runtime-provable` — AC requires running the app locally and checking its behavior (CLI output, HTTP response, process lifecycle). No Docker stack needed.
163:- `environment-provable` — AC requires a full environment (Docker stack, database, observability, multi-service interaction).
164:- `escalate` — AC genuinely cannot be automated (requires physical hardware, paid external service, human visual judgment). This is rare.
166:Default to `test-provable` when unsure.
275:Parse ALL lines in the Acceptance Criteria section. For each AC, extract its `<!-- verification: {tier} -->` tag
```
<!-- /showboat exec -->

---

## Summary

| Total ACs | Passed | Failed |
|-----------|--------|--------|
| 10 | 10 | 0 |

**Result: ALL_PASS (10/10 ACs)**
