# Verification Proof: 2-3-default-embedded-workflow

Story: Default Embedded Workflow
Verified: 2026-04-02T18:30:00Z
**Tier:** test-provable

## Summary

| AC | Verdict | Evidence |
|----|---------|----------|
| 1  | PASS | `templates/workflows/default.yaml` exists with `tasks` and `flow` top-level keys |
| 2  | PASS | Tasks section defines implement (dev/per-story/fresh/true), verify (evaluator/per-run/fresh/false), retry (dev/per-story/fresh/true) |
| 3  | PASS | Flow order is implement, verify, loop:[retry, verify] |
| 4  | PASS | `parseWorkflow()` succeeds and returns typed ResolvedWorkflow with tasks and flow |
| 5  | PASS | verify task has source_access: false and scope: per-run |
| 6  | PASS | retry task has source_access: true and scope: per-story |
| 7  | PASS | `templates/workflows/` is included in package.json files array |
| 8  | PASS | All 7 unit tests pass; workflow-parser.ts at 100% statement coverage |

## AC 1: Default workflow file exists with required keys

**Verdict:** PASS

```bash
cat templates/workflows/default.yaml
```

```output
tasks:
  implement:
    agent: dev
    scope: per-story
    session: fresh
    source_access: true
  verify:
    agent: evaluator
    scope: per-run
    session: fresh
    source_access: false
  retry:
    agent: dev
    scope: per-story
    session: fresh
    source_access: true

flow:
  - implement
  - verify
  - loop:
      - retry
      - verify
```

File exists. Contains `tasks:` and `flow:` top-level keys.

## AC 2: Task definitions

**Verdict:** PASS

```bash
node -e "const y=require('yaml');const f=require('fs').readFileSync('templates/workflows/default.yaml','utf8');const d=y.parse(f);Object.entries(d.tasks).forEach(([k,v])=>console.log(k,JSON.stringify(v)))"
```

```output
implement {"agent":"dev","scope":"per-story","session":"fresh","source_access":true}
verify {"agent":"evaluator","scope":"per-run","session":"fresh","source_access":false}
retry {"agent":"dev","scope":"per-story","session":"fresh","source_access":true}
```

Three tasks with correct properties confirmed.

## AC 3: Flow structure

**Verdict:** PASS

```bash
node -e "const y=require('yaml');const f=require('fs').readFileSync('templates/workflows/default.yaml','utf8');const d=y.parse(f);console.log(JSON.stringify(d.flow))"
```

```output
["implement","verify",{"loop":["retry","verify"]}]
```

Flow order: implement, verify, loop:[retry, verify].

## AC 4: parseWorkflow() succeeds and returns typed ResolvedWorkflow

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/default-workflow.test.ts 2>&1 | grep -E 'passes schema validation'
```

```output
 ✓ src/lib/__tests__/default-workflow.test.ts > default embedded workflow > schema validation via parseWorkflow (AC #4) > passes schema validation and returns a ResolvedWorkflow
```

parseWorkflow() returns a typed ResolvedWorkflow with tasks and flow.

## AC 5: verify task has source_access false and scope per-run

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/default-workflow.test.ts 2>&1 | grep -E 'source_access false'
```

```output
 ✓ src/lib/__tests__/default-workflow.test.ts > default embedded workflow > task definitions (AC #2) > verify task has source_access false and scope per-run (AC #5)
```

verify task: source_access=false, scope=per-run.

## AC 6: retry task has source_access true and scope per-story

**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/default-workflow.test.ts 2>&1 | grep -E 'source_access true'
```

```output
 ✓ src/lib/__tests__/default-workflow.test.ts > default embedded workflow > task definitions (AC #2) > retry task has source_access true and scope per-story (AC #6)
```

retry task: source_access=true, scope=per-story.

## AC 7: package.json files array includes templates/workflows/

**Verdict:** PASS

```bash
node -e "const p=require('./package.json');console.log(p.files.filter(f=>f.includes('workflows')))"
```

```output
[ 'templates/workflows/' ]
```

`templates/workflows/` is present in package.json files array.

## AC 8: Unit tests pass with 80%+ coverage

**Verdict:** PASS

```bash
npx vitest run --coverage src/lib/__tests__/default-workflow.test.ts 2>&1 | grep -E 'Test Files|Tests |low-parser'
```

```output
 Test Files  1 passed (1)
      Tests  7 passed (7)
  ...low-parser.ts |     100 |    88.88 |     100 |     100 | 53,56-71,103
```

7 tests pass. workflow-parser.ts: 100% statements, 88.88% branches, 100% functions, 100% lines. Exceeds 80% target.
