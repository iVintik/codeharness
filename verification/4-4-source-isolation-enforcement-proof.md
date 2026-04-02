# Verification Proof: 4-4-source-isolation-enforcement

Generated: 2026-04-03T01:28:00Z
Tier: test-provable

## AC 1: createIsolatedWorkspace export
**Verdict:** PASS
**Evidence:**
`src/lib/source-isolation.ts` exports `createIsolatedWorkspace(options: IsolationOptions): Promise<IsolatedWorkspace>` at line 77. The function creates a temp directory at `/tmp/codeharness-verify-{runId}/` with `story-files/` and `verdict/` subdirectories. The `IsolationOptions` interface (line 11) has `runId: string` and `storyFiles: string[]`. The `IsolatedWorkspace` interface (line 21) has `dir`, `storyFilesDir`, `verdictDir`, `toDispatchOptions()`, and `cleanup()`.

Test evidence: test "creates temp dir with expected structure" passes, verifying `workspace.dir === '/tmp/codeharness-verify-test-run-1'` and subdirectories exist.

## AC 2: Workspace creation with story files
**Verdict:** PASS
**Evidence:**
Test "copies story files into story-files/ subdirectory" creates two dummy files, calls `createIsolatedWorkspace()`, and verifies both files appear in `story-files/` with correct content. Test "workspace does NOT contain src/ directory" verifies the workspace directory does not contain `src`, `node_modules`, or `package.json`. All 21 tests pass.

## AC 3: toDispatchOptions() method
**Verdict:** PASS
**Evidence:**
Test "returns DispatchOptions with cwd set to the temp directory" verifies `workspace.toDispatchOptions()` returns `{ cwd: workspace.dir }`. Test "returns object with only cwd property" verifies `Object.keys(opts)` equals `['cwd']`. The method is defined at line 110 of `source-isolation.ts`:
```typescript
toDispatchOptions(): DispatchOptions {
  return { cwd: dir };
}
```

## AC 4: disallowedTools enforcement
**Verdict:** PASS
**Evidence:**
`templates/agents/evaluator.yaml` contains `disallowedTools: [Edit, Write]` (confirmed via file read, lines 20-22).

`src/lib/agent-resolver.ts` line 343: `disallowedTools: agent.disallowedTools ?? []` — passes disallowedTools through in `compileSubagentDefinition()`.

Test "evaluator template has disallowedTools: [Edit, Write]" in `source-isolation.test.ts` (line 310) parses the YAML template and asserts `parsed.disallowedTools` equals `['Edit', 'Write']`.

## AC 5: cleanup() method
**Verdict:** PASS
**Evidence:**
Test "removes the temp directory and all contents" creates workspace, calls `cleanup()`, verifies `existsSync(dir)` is `false`.
Test "calling cleanup() twice does not throw (idempotent)" calls `cleanup()` twice and asserts second call resolves without error.
Test "cleanup removes files that were copied" verifies copied story files are removed after cleanup.

Implementation at line 114:
```typescript
async cleanup(): Promise<void> {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

## AC 6: Empty storyFiles array
**Verdict:** PASS
**Evidence:**
Test "empty storyFiles array creates directories but no files in story-files/" (line 87) calls `createIsolatedWorkspace({ runId: 'test-run-5', storyFiles: [] })` and verifies:
- `storyFilesDir` exists
- `verdictDir` exists
- `readdirSync(workspace.storyFilesDir)` has length 0

## AC 7: Missing file handling with warn()
**Verdict:** PASS
**Evidence:**
Test "logs a warning and skips missing story file" (line 105) passes a non-existent file path and verifies:
- `warn` was called with string containing `'story file not found, skipping'`
- `warn` was called with string containing the missing file path
- `story-files/` directory is empty (file was skipped)

Test "copies valid files and skips missing ones without throwing" (line 124) mixes valid and missing files and verifies only the valid file was copied and `warn` was called once.

Implementation at line 96-98:
```typescript
if (!existsSync(filePath)) {
  warn(`Source isolation: story file not found, skipping: ${filePath}`);
  continue;
}
```

## AC 8: agent-dispatch.ts passes options.cwd to query
**Verdict:** PASS
**Evidence:**
`src/lib/agent-dispatch.ts` line 134:
```typescript
...(options?.cwd ? { cwd: options.cwd } : {}),
```
This passes the `cwd` from `DispatchOptions` to the SDK `query()` call, ensuring the agent session runs in the isolated workspace directory.

## AC 9: Tests pass with 80%+ coverage
**Verdict:** PASS
**Evidence:**
- 21 tests pass (0 failures)
- Coverage for `source-isolation.ts`: 100% Statements, 100% Branch, 100% Functions, 100% Lines
- Coverage command: `npx vitest run --coverage --coverage.include='src/lib/source-isolation.ts' src/lib/__tests__/source-isolation.test.ts`

```
File               | % Stmts | % Branch | % Funcs | % Lines
source-isolation.ts|     100 |      100 |     100 |     100
```

## Summary
- Total ACs: 9
- Passed: 9
- Failed: 0
- Escalated: 0
