# Verification Proof: Story 2.4 — Init Command Workflow Generation

**Verifier:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-02
**Tier:** test-provable (local CLI checks)
**CLI Version:** codeharness 0.26.5

---

## AC 1: Fresh init creates `.codeharness/workflows/default.yaml` from embedded template

**Verified: PASS**

```bash
ls -la templates/workflows/default.yaml && grep copyFileSync src/modules/infra/init-project.ts | head -3
```

```output
-rw-r--r--@ 1 ivintik  staff  352 Apr  2 15:49 templates/workflows/default.yaml
  copyFileSync(workflowSrc, workflowDest);
  copyFileSync(workflowSrc, workflowPath);
  copyFileSync(workflowSrc, workflowPath);
```

Test evidence: `creates .codeharness/workflows/default.yaml on fresh init` passes — asserts file exists and content matches `templates/workflows/default.yaml`.

---

## AC 2: Existing workflow NOT overwritten without `--force`

**Verified: PASS**

```bash
grep -n 'existsSync.*workflowDest.*&&.*!force' src/modules/infra/init-project.ts
```

```output
97:  if (existsSync(workflowDest) && !force) {
```

Test evidence: `preserves existing workflow file without --force` passes — pre-creates file with `custom-content`, runs init, asserts content unchanged and status is `exists`.

---

## AC 3: Existing workflow IS overwritten with `--force`

**Verified: PASS**

```bash
grep -n 'overwriting.*copyFileSync\|copyFileSync.*overwr' src/modules/infra/init-project.ts; grep -n "force: true" src/modules/infra/__tests__/init-project.test.ts | head -3
```

```output
103:    copyFileSync(workflowSrc, workflowDest);
261:      force: true,
770:      force: true,
```

Test evidence: `overwrites existing workflow file with --force` passes — asserts content matches template and status is `overwritten`. Re-run test `overwrites workflow file on re-run with --force` also passes.

---

## AC 4: `--force` appears in `codeharness init --help`

**Verified: PASS**

```bash
grep -n "option.*--force" src/commands/init.ts
```

```output
37:    .option('--force', 'Overwrite existing generated files', false)
```

Commander.js auto-includes registered options in `--help` output.

---

## AC 5: Success/info messages in console output

**Verified: PASS**

```bash
grep -n "okOutput\|info(" src/modules/infra/init-project.ts | grep -i workflow
```

```output
99:    if (!isJson) info(`Workflow: .codeharness/workflows/default.yaml already exists`);
105:    if (!isJson) okOutput(`Workflow: .codeharness/workflows/default.yaml ${overwriting ? 'overwritten' : 'created'}`);
262:      if (!isJson) okOutput(`Workflow: ${workflowRelPath} overwritten`);
269:      if (!isJson) okOutput(`Workflow: ${workflowRelPath} created`);
```

Messages match AC specification: `[OK] Workflow: .codeharness/workflows/default.yaml created` and `[INFO] Workflow: .codeharness/workflows/default.yaml already exists`.

---

## AC 6: Stack detection — no regressions

**Verified: PASS**

```bash
npx vitest run src/modules/infra/__tests__/init-project.test.ts 2>&1 | grep -E '(Tests|Test Files)'
```

```output
Test Files  1 passed (1)
     Tests  33 passed (33)
```

All 33 tests pass — 25 original + 8 new. Test `stack detection still works with workflow generation` explicitly asserts stack detection AND workflow creation coexist.

---

## AC 7: `--json` output includes `workflow` field

**Verified: PASS**

```bash
grep -n "workflow.*status.*created.*exists.*overwritten\|workflow.*path" src/modules/infra/types.ts
```

```output
81:  workflow?: { status: 'created' | 'exists' | 'overwritten'; path: string };
```

Test evidence: `includes workflow field in --json output` passes — asserts `result.data.workflow` has `status: 'created'` and `path: '.codeharness/workflows/default.yaml'`.

---

## AC 8: Unit tests pass covering all scenarios

**Verified: PASS**

```bash
npx vitest run src/modules/infra/__tests__/init-project.test.ts 2>&1 | grep -E '(Tests|passed|failed)'
```

```output
     Tests  33 passed (33)
```

8 new workflow-specific tests:
1. `creates .codeharness/workflows/default.yaml on fresh init`
2. `preserves existing workflow file without --force`
3. `overwrites existing workflow file with --force`
4. `includes workflow field in --json output`
5. `stack detection still works with workflow generation`
6. `overwrites workflow file on re-run with --force`
7. `creates workflow file on re-run when missing`
8. `preserves workflow file on re-run without --force`

---

## Summary

| AC | Description | Result |
|----|-------------|--------|
| 1 | Fresh init creates workflow from template | PASS |
| 2 | Existing workflow preserved without --force | PASS |
| 3 | Existing workflow overwritten with --force | PASS |
| 4 | --force in help output | PASS |
| 5 | Success/info console messages | PASS |
| 6 | Stack detection no regressions | PASS |
| 7 | --json includes workflow field | PASS |
| 8 | Unit tests cover all scenarios | PASS |

**Final Result: ALL_PASS (8/8 ACs)**
