# Verification Proof: 11-2-sprint-status-yaml-derived-view

**Story:** sprint-status.yaml Becomes Derived View
**Verified:** 2026-03-24
**Tier:** unit-testable

---

## AC 1: generateSprintStatusYaml() produces valid YAML matching sprint-status.yaml format

**Verdict:** PASS

```bash
grep -n 'export function generateSprintStatusYaml' src/modules/sprint/state.ts
```
```output
116:export function generateSprintStatusYaml(state: SprintState): string {
```

```bash
grep -c 'generateSprintStatusYaml\|getStoryStatusesFromState\|sprintStatusYamlPath\|writeSprintStatusYaml' src/modules/sprint/__tests__/sprint-yaml.test.ts
```
```output
18
```

```bash
npx vitest run src/modules/sprint/__tests__/sprint-yaml.test.ts --reporter=verbose 2>&1 | grep -E '✓|Tests|PASS'
```
```output
 ✓ getStoryStatusesFromState > returns empty map for empty state
 ✓ getStoryStatusesFromState > returns flat key->status map from state stories
 ✓ getStoryStatusesFromState > preserves all status types
 ✓ generateSprintStatusYaml > produces valid YAML for empty state
 ✓ generateSprintStatusYaml > groups stories by epic and sorts by epic/story number
 ✓ generateSprintStatusYaml > computes epic status as done when all stories done
 ✓ generateSprintStatusYaml > computes epic status as backlog when not all stories done
 ✓ generateSprintStatusYaml > maps "ready" status to "ready-for-dev" in YAML
 ✓ generateSprintStatusYaml > produces parseable YAML with correct development_status
 ✓ generateSprintStatusYaml > includes auto-generated header comment
 ✓ generateSprintStatusYaml > handles multiple epics with mixed statuses
 ✓ generateSprintStatusYaml > handles stories with non-standard keys gracefully
 ✓ generateSprintStatusYaml > handles state with epics field populated
 ✓ writeStateAtomic regenerates sprint-status.yaml > writes sprint-status.yaml when directory exists
 ✓ writeStateAtomic regenerates sprint-status.yaml > YAML updates on every state write
 ✓ writeStateAtomic regenerates sprint-status.yaml > skips YAML write when output directory does not exist
 ✓ writeStateAtomic regenerates sprint-status.yaml > YAML write failure does not fail the state write
 ✓ sprintStatusYamlPath > returns expected path
 Tests  18 passed (18)
```

All 18 tests pass. Function exists and produces valid YAML with epic groupings, story sorting, and correct status mapping.

---

## AC 2: writeSprintState() auto-regenerates sprint-status.yaml

**Verdict:** PASS

```bash
grep -n 'writeSprintStatusYaml' src/modules/sprint/state.ts
```
```output
179:function writeSprintStatusYaml(state: SprintState): void {
204:    writeSprintStatusYaml(state);
```

Line 204 shows `writeSprintStatusYaml(state)` is called inside `writeStateAtomic()` after the JSON write completes. Every state write auto-regenerates the YAML view.

```bash
grep -A2 'YAML updates on every state write' src/modules/sprint/__tests__/sprint-yaml.test.ts
```
```output
  it('YAML updates on every state write', () => {
    const yamlDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(yamlDir, { recursive: true });
```

Test confirms YAML content updates when state changes from backlog to done.

---

## AC 3: harness-run reads from sprint-state.json directly (not sprint-status.yaml)

**Verdict:** PASS

```bash
grep -n 'readSprintStatusFromState\|readSprintStatus' src/commands/run.ts
```
```output
7:import { readSprintStatusFromState } from '../modules/sprint/index.js';
67:      const statuses = readSprintStatusFromState();
163:        const initialStatuses = readSprintStatusFromState();
205:              const currentStatuses = readSprintStatusFromState();
233:              const finalStatuses = readSprintStatusFromState();
259:            const finalStatuses = readSprintStatusFromState();
```

```bash
grep -n 'readSprintStatusFromState\|readSprintStatus' src/lib/onboard-checks.ts
```
```output
16:import { readSprintStatusFromState } from '../modules/sprint/index.js';
98:  const statuses = readSprintStatusFromState();
```

Both consumers import `readSprintStatusFromState` from the sprint module (JSON-backed), not `readSprintStatus` from beads-sync (YAML-backed).

```bash
grep -n 'readSprintStatusFromState' src/modules/sprint/index.ts
```
```output
42:export function readSprintStatusFromState(): Record<string, string> {
```

The function reads `sprint-state.json` via `readSprintState()` and extracts story statuses via `getStoryStatusesFromState()` — no YAML parsing involved.

---

## Summary

| AC | Verdict |
|----|---------|
| AC 1 | PASS |
| AC 2 | PASS |
| AC 3 | PASS |

All acceptance criteria verified. Story is complete.
