# Showboat Proof: 25-1-gate-machine

**Verified:** 2026-04-06  
**Story:** Create gate machine

---

## AC1 — Build exits 0 with no TypeScript errors

```text
$ npm run build
ESM ⚡️ Build success in 43ms
DTS ⚡️ Build success in 887ms
```
✅ PASS

---

## AC2 — Full Vitest suite passes with zero failures

```text
$ npx vitest run
Test Files  194 passed (194)
      Tests  5117 passed (5117)
```
✅ PASS

---

## AC3 — All-pass gate reaches `passed`

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > gate with all-pass verdicts reaches passed final state
```
✅ PASS

---

## AC4 — Max retries gate reaches `maxedOut`

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > gate hitting max_retries reaches maxedOut final state
```
✅ PASS

---

## AC5 — Circuit breaker gate reaches `halted`

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > gate with circuit breaker triggered reaches halted final state
```
✅ PASS

---

## AC6 — `INTERRUPT` reaches `interrupted`

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > INTERRUPT event transitions to interrupted final state
```
✅ PASS

---

## AC7 — Fix-and-retry cycle reaches `passed`

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > check-fail → evaluate → fix → check-pass cycle reaches passed
```
✅ PASS

---

## AC8 — Sequential check tasks accumulate verdicts

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > two check tasks produce sequential verdicts in context
```
✅ PASS

---

## AC9 — Halt error from actor reaches `halted`

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > halt error from check actor transitions to halted state
```
✅ PASS

---

## AC10 — Gate machine source lints cleanly

```text
$ npx eslint src/lib/workflow-gate-machine.ts
(no output)
```
✅ PASS

---

## AC11 — Gate machine source file is within size limit

```text
$ wc -l src/lib/workflow-gate-machine.ts
236 src/lib/workflow-gate-machine.ts
```
✅ PASS

---

## AC12 — Null-task checks use null-task actor path

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > null task check uses nullTaskCore path, not dispatchTaskCore
```
✅ PASS

---

## AC13 — Boundary imports are respected

```text
$ grep -nE "from.*workflow-runner|from.*workflow-visualizer|from.*workflow-persistence" src/lib/workflow-gate-machine.ts
(no output)
```
✅ PASS

---

## AC14 — Machine output includes structured results

```text
$ npx vitest run src/lib/__tests__/workflow-gate-machine.test.ts --reporter=verbose
✓ lib/__tests__/workflow-gate-machine.test.ts > gateMachine > machine output includes workflowState, errors, tasksCompleted, accumulatedCostUsd
```
✅ PASS
