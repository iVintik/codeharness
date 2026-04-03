# Story 9-2: Custom Workflow Creation — Verification Proof

**Story:** `_bmad-output/implementation-artifacts/9-2-custom-workflow-creation.md`
**Tier:** test-provable
**Date:** 2026-04-03

## Pre-checks

### Build

**Verdict:** PASS

```bash
npm run build
```

```output
ESM dist/index.js           344.12 KB
ESM Build success in 27ms
DTS Build success in 880ms
```

### Unit Tests

**Verdict:** PASS (4210 passed)

```bash
npm run test:unit
```

```output
Test Files  161 passed (161)
     Tests  4210 passed (4210)
  Duration  8.65s
```

### Lint

**Verdict:** PASS (0 errors, 51 warnings)

```bash
npm run lint
```

```output
51 problems (0 errors, 51 warnings)
```

### Coverage

**Verdict:** PASS

```bash
npm run test:unit -- --coverage
```

```output
All files  | 96.75% Stmts | 88.04% Branch | 98.19% Funcs | 97.44% Lines
```

---

## AC 1: Custom workflow loaded from `.codeharness/workflows/my-workflow.yaml`

**Verdict:** PASS

```bash
grep -n 'loads a custom workflow from .codeharness/workflows/{name}.yaml by name' src/lib/__tests__/workflow-parser.test.ts
```

```output
751:    it('loads a custom workflow from .codeharness/workflows/{name}.yaml by name', () => {
```

Test at line 751 creates a custom workflow file, calls `resolveWorkflow({ cwd: testDir, name: 'my-workflow' })`, and asserts the tasks and flow are loaded correctly. The resolver checks `projectCustomPath` at line 314 of `workflow-parser.ts` and loads it directly when no `extends` key is present (line 316-318).

## AC 2: Schema validation failure throws `WorkflowParseError`

**Verdict:** PASS

```bash
grep -n 'custom workflow fails schema validation' src/lib/__tests__/workflow-parser.test.ts
```

```output
769:    it('custom workflow fails schema validation — throws WorkflowParseError', () => {
```

Test at line 769 writes a YAML missing the `tasks` key, asserts `WorkflowParseError` is thrown, and verifies `pe.message` contains `'Schema validation failed'` with `pe.errors.length > 0`.

## AC 3: Dangling task references throw `WorkflowParseError`

**Verdict:** PASS

```bash
grep -n 'dangling flow refs' src/lib/__tests__/workflow-parser.test.ts
```

```output
789:    it('custom workflow passes schema but has dangling flow refs — throws WorkflowParseError', () => {
```

Test at line 789 creates a workflow with `flow: [deploy, nonexistent]` where only `deploy` is defined in `tasks`. Asserts `WorkflowParseError` with message containing `'Dangling task references'` and error listing `nonexistent`. Source logic at `workflow-parser.ts:99`.

## AC 4: Agent references resolve through config chain

**Verdict:** PASS

```bash
grep -n 'custom agent names resolves agent field' src/lib/__tests__/workflow-parser.test.ts
```

```output
881:    it('custom workflow with custom agent names resolves agent field correctly', () => {
```

Test at line 881 creates a workflow with three custom agent names (`my-custom-builder`, `my-custom-tester`, `my-custom-deployer`), loads via `resolveWorkflow`, and asserts each task's `agent` field is preserved. Agent resolution happens downstream in `run.ts` via `resolveAgent()`/`compileSubagentDefinition()` — the workflow parser correctly passes through custom names without validation at parse time.

## AC 5: `--workflow` CLI flag passes name to `resolveWorkflow()`

**Verdict:** PASS

```bash
grep -n "passes --workflow name and cwd to resolveWorkflow" src/commands/__tests__/run.test.ts
```

```output
599:    it('passes --workflow name and cwd to resolveWorkflow', async () => {
```

Test at line 599 calls `runCommand(['--workflow', 'my-workflow'])` and asserts `resolveWorkflowMock` was called with `{ name: 'my-workflow', cwd: expect.any(String) }`. The `--workflow` option is registered at `run.ts:36`:

```bash
grep -n '\-\-workflow' src/commands/run.ts
```

```output
36:    .option('--workflow <name>', 'Workflow name to load (default: "default")')
```

The plumbing at `run.ts:115`: `resolveWorkflow({ cwd: projectDir, name: workflowName })`.

## AC 6: Missing workflow exits with clear error

**Verdict:** PASS

```bash
grep -n 'exits 1 with clear error when custom workflow not found' src/commands/__tests__/run.test.ts
```

```output
623:    it('exits 1 with clear error when custom workflow not found (no fallback)', async () => {
```

Test at line 623 mocks `resolveWorkflow` to throw `'Embedded workflow not found: my-workflow'`, calls `runCommand(['--workflow', 'my-workflow'])`, and asserts: (1) console output contains `'Failed to resolve workflow'` and `'my-workflow'`, (2) `process.exitCode === 1`, (3) `parseWorkflowMock` was NOT called (no fallback for non-default).

Additionally, `workflow-parser.ts:329` throws: `WorkflowParseError('Embedded workflow not found: ${name}', [{ path: embeddedPath, message: detail }])` — includes the expected file path.

## AC 7: Default behavior unchanged without `--workflow`

**Verdict:** PASS

```bash
grep -n 'defaults to "default" when --workflow is not specified' src/commands/__tests__/run.test.ts
```

```output
611:    it('defaults to "default" when --workflow is not specified', async () => {
```

Test at line 611 calls `runCommand()` without `--workflow` and asserts `resolveWorkflowMock` was called with `{ name: 'default' }`.

```bash
grep -n 'resolveWorkflow.*with no name defaults to.*backward-compatible' src/lib/__tests__/workflow-parser.test.ts
```

```output
822:    it('resolveWorkflow() with no name defaults to "default" — backward-compatible', () => {
```

Test at line 822 calls `resolveWorkflow({ cwd: testDir })` (no name) and asserts default tasks and flow are loaded.

## AC 8: Custom workflow ignores co-located patch file

**Verdict:** PASS

```bash
grep -n 'patch is ignored for full custom workflows' src/lib/__tests__/workflow-parser.test.ts
```

```output
855:    it('custom workflow alongside patch file: patch is ignored for full custom workflows', () => {
```

Test at line 855 creates both `ci.yaml` (full custom, no `extends`) and `ci.patch.yaml` (patch), calls `resolveWorkflow({ cwd: testDir, name: 'ci' })`, and asserts the agent is `'builder'` (from the custom file), not `'patched-builder'` (from the patch).

Also tests the inverse — line 830: `custom workflow with extends key is NOT treated as full custom` — verifying the `extends` detection at `workflow-parser.ts:316`.

## AC 9: Build and tests pass

**Verdict:** PASS

```bash
npm run build && npm run test:unit
```

```output
ESM dist/index.js           344.12 KB
ESM Build success in 27ms
DTS Build success in 880ms
Test Files  161 passed (161)
     Tests  4210 passed (4210)
  Duration  8.65s
```

Build succeeds with zero errors. All 4210 tests pass across 161 test files with no regressions.

## AC 10: Test coverage for all custom workflow scenarios

**Verdict:** PASS

```bash
grep -n 'Story 9.2' src/lib/__tests__/workflow-parser.test.ts src/commands/__tests__/run.test.ts
```

```output
src/lib/__tests__/workflow-parser.test.ts:748:  // --- Story 9.2: Custom Workflow Creation ---
src/lib/__tests__/workflow-parser.test.ts:750:  describe('custom workflow by name (Story 9.2)', () => {
src/commands/__tests__/run.test.ts:598:  describe('--workflow option (Story 9.2)', () => {
```

All required test scenarios are present in the `custom workflow by name (Story 9.2)` describe block at `workflow-parser.test.ts:750` and the `--workflow option (Story 9.2)` describe block at `run.test.ts:598`:

| Scenario | Test Location |
|---|---|
| Custom workflow loading by name | `workflow-parser.test.ts:751` |
| Schema validation of custom workflows | `workflow-parser.test.ts:769` |
| Referential integrity of custom workflows | `workflow-parser.test.ts:789` |
| `--workflow` CLI flag plumbing | `run.test.ts:599` |
| Missing workflow error path | `workflow-parser.test.ts:812`, `run.test.ts:623` |
| Backward-compatible default behavior | `workflow-parser.test.ts:822`, `run.test.ts:611` |
| Agent resolution with custom agent names | `workflow-parser.test.ts:881` |
| Path traversal rejection | `run.test.ts:640` |
| Patch ignored for full custom | `workflow-parser.test.ts:855` |
| Extends key falls through | `workflow-parser.test.ts:830` |
