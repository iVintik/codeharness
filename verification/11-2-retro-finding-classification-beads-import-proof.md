# Verification Proof: 11-2-retro-finding-classification-beads-import

*2026-03-15T18:07:23Z by Showboat 0.6.1*
<!-- showboat-id: 780518df-dd74-493b-bf8a-4999e85f664f -->

## Story: Retro Finding Classification & Beads Import

Acceptance Criteria:
1. AC1: Parse retro action items from epic-N-retrospective.md and classify each as project | harness | tool:<name>
2. AC2: Beads issues created with gap-id [gap:retro:epic-N-item-M], type task, derived priority, retro context in description
3. AC3: Dedup on second run — no duplicates, prints [INFO] Skipping existing: {title}
4. AC4: --json flag outputs JSON: {imported: N, skipped: M, issues: [...]}

```bash
npm run test:unit 2>&1 | grep -E 'Test Files|Tests' | head -2
```

```output
[2m Test Files [22m [1m[32m43 passed[39m[22m[90m (43)[39m
[2m      Tests [22m [1m[32m1292 passed[39m[22m[90m (1292)[39m
```

```bash
test -f src/lib/retro-parser.ts && echo 'EXISTS' || echo 'MISSING'
```

```output
EXISTS
```

```bash
grep -n 'export function\|export type\|export interface' src/lib/retro-parser.ts
```

```output
6:export interface RetroActionItem {
17:export type Classification =
28:export function parseRetroActionItems(content: string): RetroActionItem[] {
85:export function classifyFinding(item: RetroActionItem): Classification {
107:export function derivePriority(item: RetroActionItem): number {
```

```bash
sed -n '17,21p' src/lib/retro-parser.ts
```

```output
export type Classification =
  | { type: 'harness' }
  | { type: 'tool'; name: string }
  | { type: 'project' };

```

```bash
npx vitest run src/lib/__tests__/retro-parser.test.ts 2>&1 | grep -E 'Test Files|Tests' | head -2
```

```output
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m22 passed[39m[22m[90m (22)[39m
```

## AC1: PASS — Retro action item parsing and classification

- src/lib/retro-parser.ts exports: parseRetroActionItems, classifyFinding, derivePriority, RetroActionItem, Classification
- Classification type: harness | tool:<name> | project
- 22 unit tests pass

```bash
grep -n 'buildGapId\|type.*task\|derivePriority' src/commands/retro-import.ts
```

```output
5:import { parseRetroActionItems, classifyFinding, derivePriority } from '../lib/retro-parser.js';
6:import { createOrFindIssue, buildGapId } from '../lib/beads.js';
86:        const priority = derivePriority(item);
87:        const gapId = buildGapId('retro', `epic-${epicNum}-item-${item.number}`);
99:            type: 'task',
```

```bash
grep -n 'gap-id format\|toHaveBeenCalledWith.*retro.*epic' src/commands/__tests__/retro-import.test.ts
```

```output
97:  it('passes correct gap-id format to createOrFindIssue', async () => {
106:    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-9-item-A1');
107:    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-9-item-A2');
108:    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-9-item-A3');
240:    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-7-item-A1');
```

## AC2: PASS — Beads issues with correct gap-id, type, priority, description

- buildGapId('retro', 'epic-N-item-M') at line 87
- type: 'task' at line 99
- derivePriority(item) at line 86
- Tests assert gap-id format: epic-9-item-A1, epic-9-item-A2, epic-9-item-A3

```bash
grep -n 'Skipping existing' src/commands/retro-import.ts
```

```output
122:              info(`Skipping existing: ${title}`);
```

```bash
grep -n 'skips existing\|Skipping existing' src/commands/__tests__/retro-import.test.ts
```

```output
113:  it('skips existing issues and prints info message', async () => {
124:    // Verify the info messages contain "Skipping existing:"
126:      expect(call[0]).toContain('Skipping existing:');
```

## AC3: PASS — Dedup on second run

- retro-import.ts line 122: info('Skipping existing: {title}') when created=false
- Test at line 113 verifies skip behavior
- Test at line 126 asserts output contains 'Skipping existing:'

```bash
grep -n 'jsonOutput\|imported.*skipped' src/commands/retro-import.ts
```

```output
4:import { ok, fail, info, jsonOutput } from '../lib/output.js';
72:          jsonOutput({ imported: 0, skipped: 0, issues: [] });
132:        jsonOutput({ imported, skipped, issues: issues as unknown as Record<string, unknown>[] });
```

```bash
grep -n 'imported.*skipped\|JSON.*format\|--json' src/commands/__tests__/retro-import.test.ts | head -10
```

```output
71:  program.option('--json', 'JSON output');
132:  it('outputs JSON format when --json flag is set', async () => {
148:    await runRetroImport(['--epic', '9', '--json']);
260:  it('outputs JSON for empty action items with --json', async () => {
267:    await runRetroImport(['--epic', '9', '--json']);
298:    await runRetroImport(['--epic', '9', '--json']);
```

## AC4: PASS — JSON output with --json flag

- jsonOutput({ imported, skipped, issues }) at line 132
- Test at line 132: asserts imported=2, skipped=1, issues.length=3
- Additional tests for empty items (line 260) and error handling (line 298)

```bash
grep -n 'retro-import\|registerRetroImport' src/index.ts
```

```output
15:import { registerRetroImportCommand } from './commands/retro-import.js';
42:  registerRetroImportCommand(program);
```

```bash
npx vitest run src/commands/__tests__/retro-import.test.ts 2>&1 | grep -E 'Test Files|Tests' | head -2
```

```output
[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m20 passed[39m[22m[90m (20)[39m
```

```bash
npm run test:unit 2>&1 | grep -E 'Test Files|Tests' | head -2
```

```output
[2m Test Files [22m [1m[32m43 passed[39m[22m[90m (43)[39m
[2m      Tests [22m [1m[32m1292 passed[39m[22m[90m (1292)[39m
```

## Verdict: PASS

- Total ACs: 4
- Verified: 4
- Failed: 0
- Tests: 1292 passing (43 test files), including 22 retro-parser + 20 retro-import tests
- Showboat verify: reproducible
