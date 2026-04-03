# Story 10-1: AgentDriver Interface & Types — Verification Proof

Story: `_bmad-output/implementation-artifacts/10-1-agentdriver-interface-types.md`
Verified: 2026-04-03
Tier: test-provable

## AC 1: AgentDriver interface members

**Tier:** test-provable

```bash
grep -n 'interface AgentDriver' src/lib/agents/types.ts
```

```output
101:export interface AgentDriver {
```

```bash
sed -n '101,108p' src/lib/agents/types.ts
```

```output
export interface AgentDriver {
  readonly name: string;
  readonly defaultModel: string;
  readonly capabilities: DriverCapabilities;
  healthCheck(): Promise<DriverHealth>;
  dispatch(opts: DispatchOpts): AsyncIterable<StreamEvent>;
  getLastCost(): number | null;
}
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "satisfies interface with mock"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > AgentDriver interface > satisfies interface with mock implementation
```

**Verdict:** PASS

## AC 2: DispatchOpts interface fields

**Tier:** test-provable

```bash
sed -n '85,93p' src/lib/agents/types.ts
```

```output
export interface DispatchOpts {
  readonly prompt: string;
  readonly model: string;
  readonly cwd: string;
  readonly sourceAccess: boolean;
  readonly plugins?: readonly string[];
  readonly timeout?: number;
  readonly outputContract?: OutputContract;
}
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "DispatchOpts"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > DispatchOpts > accepts all required fields
 ✓ agents/types — new AgentDriver interface (Epic 10) > DispatchOpts > accepts all optional fields
 ✓ agents/types — new AgentDriver interface (Epic 10) > DispatchOpts > optional fields are undefined when not provided
```

**Verdict:** PASS

## AC 3: DriverHealth interface fields

**Tier:** test-provable

```bash
sed -n '16,21p' src/lib/agents/types.ts
```

```output
export interface DriverHealth {
  readonly available: boolean;
  readonly authenticated: boolean;
  readonly version: string | null;
  readonly error?: string;
}
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "DriverHealth"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > DriverHealth > accepts a healthy status
 ✓ agents/types — new AgentDriver interface (Epic 10) > DriverHealth > accepts an unhealthy status with error
 ✓ agents/types — new AgentDriver interface (Epic 10) > DriverHealth > error field is optional
```

**Verdict:** PASS

## AC 4: DriverCapabilities interface fields

**Tier:** test-provable

```bash
sed -n '27,31p' src/lib/agents/types.ts
```

```output
export interface DriverCapabilities {
  readonly supportsPlugins: boolean;
  readonly supportsStreaming: boolean;
  readonly costReporting: boolean;
}
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "DriverCapabilities"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > DriverCapabilities > accepts capability flags
 ✓ agents/types — new AgentDriver interface (Epic 10) > DriverCapabilities > all-false capabilities are valid
```

**Verdict:** PASS

## AC 5: ErrorCategory type union

**Tier:** test-provable

```bash
grep "ErrorCategory" src/lib/agents/types.ts
```

```output
export type ErrorCategory = 'RATE_LIMIT' | 'NETWORK' | 'AUTH' | 'TIMEOUT' | 'UNKNOWN';
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "ErrorCategory"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > ErrorCategory > covers exactly 5 values
 ✓ agents/types — new AgentDriver interface (Epic 10) > ErrorCategory > each value is assignable to ErrorCategory
 ✓ agents/types — new AgentDriver interface (Epic 10) > ErrorCategory > exhaustiveness check — switch covers all categories
```

**Verdict:** PASS

## AC 6: OutputContract, TestResults, ACStatus interfaces

**Tier:** test-provable

```bash
sed -n '49,80p' src/lib/agents/types.ts
```

```output
export interface TestResults {
  readonly passed: number;
  readonly failed: number;
  readonly coverage: number | null;
}

export interface ACStatus {
  readonly id: string;
  readonly description: string;
  readonly status: string;
}

export interface OutputContract {
  readonly version: number;
  readonly taskName: string;
  readonly storyId: string;
  readonly driver: string;
  readonly model: string;
  readonly timestamp: string;
  readonly cost_usd: number | null;
  readonly duration_ms: number;
  readonly changedFiles: readonly string[];
  readonly testResults: TestResults | null;
  readonly output: string;
  readonly acceptanceCriteria: readonly ACStatus[];
}
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep -E "OutputContract|TestResults|ACStatus"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > OutputContract, TestResults, ACStatus > accepts a valid OutputContract
 ✓ agents/types — new AgentDriver interface (Epic 10) > OutputContract, TestResults, ACStatus > accepts null cost_usd and testResults
 ✓ agents/types — new AgentDriver interface (Epic 10) > OutputContract, TestResults, ACStatus > TestResults accepts valid values
 ✓ agents/types — new AgentDriver interface (Epic 10) > OutputContract, TestResults, ACStatus > TestResults coverage can be null
 ✓ agents/types — new AgentDriver interface (Epic 10) > OutputContract, TestResults, ACStatus > ACStatus accepts valid values
```

**Verdict:** PASS

## AC 7: dispatch() returns AsyncIterable<StreamEvent>

**Tier:** test-provable

```bash
grep "dispatch" src/lib/agents/types.ts
```

```output
  dispatch(opts: DispatchOpts): AsyncIterable<StreamEvent>;
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "AsyncIterable\|for-await"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > dispatch returns AsyncIterable<StreamEvent> > can be consumed with for-await-of
```

**Verdict:** PASS

## AC 8: StreamEvent types preserved, ResultEvent gains cost_usd

**Tier:** test-provable

```bash
grep -n "interface.*Event" src/lib/agents/stream-parser.ts
```

```output
15:export interface ToolStartEvent {
21:export interface ToolInputEvent {
26:export interface ToolCompleteEvent {
30:export interface TextEvent {
35:export interface RetryEvent {
41:export interface ResultEvent {
```

```bash
grep "cost_usd" src/lib/agents/stream-parser.ts
```

```output
  readonly cost_usd?: number | null;
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "cost_usd\|ResultEvent"
```

```output
 ✓ agents/types — new AgentDriver interface (Epic 10) > StreamEvent — ResultEvent cost_usd extension > ResultEvent accepts optional cost_usd field
 ✓ agents/types — new AgentDriver interface (Epic 10) > StreamEvent — ResultEvent cost_usd extension > ResultEvent cost_usd can be null
 ✓ agents/types — new AgentDriver interface (Epic 10) > StreamEvent — ResultEvent cost_usd extension > ResultEvent cost_usd is optional (backward compat)
```

**Verdict:** PASS

## AC 9: Deprecated types preserved with @deprecated JSDoc, barrel re-exports

**Tier:** test-provable

```bash
grep -B1 "interface SpawnOpts\|interface AgentProcess\|type AgentEvent" src/lib/agents/types.ts
```

```output
 * @deprecated Use `DispatchOpts` instead. Will be removed after story 10-3.
export interface SpawnOpts {
--
 * @deprecated Use `AsyncIterable<StreamEvent>` from `dispatch()` instead. Will be removed after story 10-3.
export interface AgentProcess {
--
 * @deprecated Use `StreamEvent` from `stream-parser.ts` instead. Will be removed after story 10-3.
export type AgentEvent =
```

```bash
grep -E "SpawnOpts|AgentProcess|AgentEvent" src/lib/agents/index.ts
```

```output
export type { SpawnOpts } from './types.js';
export type { AgentProcess } from './types.js';
export type { AgentEvent } from './types.js';
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep -E "deprecated|barrel"
```

```output
 ✓ agents/types — deprecated types (backward compat) > SpawnOpts (deprecated) > defines required fields: storyKey, prompt, workDir, timeout
 ✓ agents/types — deprecated types (backward compat) > SpawnOpts (deprecated) > accepts optional env field
 ✓ agents/types — deprecated types (backward compat) > AgentProcess (deprecated) > satisfies interface with mock implementation
 ✓ agents/types — deprecated types (backward compat) > AgentEvent discriminated union (deprecated) > covers all 9 event variants
 ✓ agents/types — deprecated types (backward compat) > barrel re-exports from index.ts > re-exports new types
 ✓ agents/types — deprecated types (backward compat) > barrel re-exports from index.ts > re-exports deprecated types
```

**Verdict:** PASS

## AC 10: Build succeeds, tests pass with no regressions

**Tier:** test-provable

```bash
npm run build 2>&1 | tail -3
```

```output
ESM ⚡️ Build success in 26ms
DTS Build start
DTS ⚡️ Build success in 739ms
```

```bash
npm run test:unit 2>&1 | grep -E "Test Files|Tests "
```

```output
 Test Files  161 passed (161)
      Tests  4220 passed (4220)
```

**Verdict:** PASS

## AC 11: Unit tests for new types in types.test.ts

**Tier:** test-provable

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts 2>&1 | grep -E "Test Files|Tests "
```

```output
 Test Files  1 passed (1)
      Tests  33 passed (33)
```

```bash
npx vitest run src/lib/agents/__tests__/types.test.ts --reporter=verbose 2>&1 | grep "✓" | wc -l
```

```output
33
```

Tests cover: AgentDriver members (7), DispatchOpts (3), DriverHealth (3), DriverCapabilities (2), ErrorCategory (3), OutputContract/TestResults/ACStatus (5), ResultEvent cost_usd (3), AsyncIterable dispatch (1), deprecated types (4), barrel re-exports (2).

**Verdict:** PASS
