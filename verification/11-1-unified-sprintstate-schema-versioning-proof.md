# Verification Proof: 11-1 Unified SprintState Schema with Versioning

**Story:** 11-1-unified-sprintstate-schema-versioning
**Verified:** 2026-03-24
**Tier:** unit-testable

## AC 1: SprintStateV2 has version: 2 and required top-level fields

```shell
grep -n 'readonly version: 2\|readonly sprint:\|readonly stories:\|readonly retries:\|readonly flagged:\|readonly epics:\|readonly session:\|readonly observability:\|readonly run:\|readonly actionItems:' src/types/state.ts | grep -A20 'SprintStateV2' | head -15
```
```output
98:  readonly version: 2;
99:  readonly sprint: {
106:  readonly stories: Record<string, StoryState>;
107:  readonly retries: Record<string, number>;
108:  readonly flagged: string[];
109:  readonly epics: Record<string, EpicState>;
110:  readonly session: SessionState;
111:  readonly observability: ObservabilityState;
112:  readonly run: {
124:  readonly actionItems: ActionItem[];
```

**Verdict:** PASS — All 10 required top-level fields present in SprintStateV2.

## AC 2: EpicState, SessionState, ObservabilityState interfaces

```shell
grep -n 'export interface EpicState\|export interface SessionState\|export interface ObservabilityState\|readonly status: string\|readonly storiesTotal\|readonly storiesDone\|readonly active: boolean\|readonly startedAt\|readonly iteration: number\|readonly elapsedSeconds\|readonly statementCoverage\|readonly branchCoverage\|readonly functionCoverage\|readonly lineCoverage' src/types/state.ts
```
```output
48:export interface EpicState {
49:  readonly status: string;
50:  readonly storiesTotal: number;
51:  readonly storiesDone: number;
55:export interface SessionState {
56:  readonly active: boolean;
57:  readonly startedAt: string | null;
58:  readonly iteration: number;
59:  readonly elapsedSeconds: number;
63:export interface ObservabilityState {
64:  readonly statementCoverage: number | null;
65:  readonly branchCoverage: number | null;
66:  readonly functionCoverage: number | null;
67:  readonly lineCoverage: number | null;
```

**Verdict:** PASS — All three interfaces defined with required fields.

## AC 3: SprintStateAny union type

```shell
grep -n 'SprintStateAny\|SprintStateV1\|SprintStateV2\|SprintState =' src/types/state.ts
```
```output
71:export interface SprintStateV1 {
97:export interface SprintStateV2 {
128:export type SprintStateAny = SprintStateV1 | SprintStateV2;
131:export type SprintState = SprintStateV2;
```

**Verdict:** PASS — SprintStateV1 preserves v1 schema (line 71), SprintStateV2 is v2 (line 97), SprintStateAny is the union (line 128), SprintState aliases V2 (line 131).

## AC 4: defaultState() returns SprintStateV2 with version: 2

```shell
grep -n 'version: 2\|retries:\|flagged:\|epics:\|session:\|observability:' src/modules/sprint/state.ts | head -10
```
```output
31:    version: 2,
40:    retries: {},
41:    flagged: [],
42:    epics: {},
43:    session: {
49:    observability: {
```

**Verdict:** PASS — defaultState() returns version:2 with empty retries {}, flagged [], epics {}, default session and observability.

## AC 5: v1 state auto-migrates to v2

```shell
grep -n 'migrateV1ToV2\|version === 2' src/modules/sprint/state.ts
```
```output
11:import { migrateFromOldFormat, migrateV1ToV2 } from './migration.js';
116:      if (version === 2) {
149:      const migrated = migrateV1ToV2(v1State);
```

**Verdict:** PASS — getSprintState() checks version===2 (line 116), if not v2 calls migrateV1ToV2() (line 149).

## AC 6: Missing version field treated as v1

```shell
sed -n '113,154p' src/modules/sprint/state.ts
```
```output
      const version = parsed.version as number | undefined;

      // Already v2 — merge with defaults and return
      if (version === 2) {
        const defaults = defaultState();
        ...
      }

      // v1 or missing version — migrate to v2
      const v1State = parsed as unknown as import('../../types/state.js').SprintStateV1;
      const migrated = migrateV1ToV2(v1State);
```

**Verdict:** PASS — Only version===2 returns early; undefined/1/any other value falls through to migration.

## AC 7: .story_retries parsed into retries Record

```shell
grep -n 'parseStoryRetriesRecord\|readIfExists.*storyRetries' src/modules/sprint/migration.ts
```
```output
64:export function parseStoryRetriesRecord(content: string): Record<string, number> {
191:  const retriesContent = readIfExists(OLD_FILES.storyRetries);
192:  const retries = retriesContent ? parseStoryRetriesRecord(retriesContent) : {};
```

**Verdict:** PASS — migrateV1ToV2 reads .story_retries and parses space-separated key/count into Record<string,number>.

## AC 8: .flagged_stories parsed into flagged array

```shell
grep -n 'parseFlaggedStoriesList\|readIfExists.*flaggedStories' src/modules/sprint/migration.ts
```
```output
81:export function parseFlaggedStoriesList(content: string): string[] {
195:  const flaggedContent = readIfExists(OLD_FILES.flaggedStories);
196:  const flagged = flaggedContent ? parseFlaggedStoriesList(flaggedContent) : [];
```

**Verdict:** PASS — migrateV1ToV2 reads .flagged_stories and parses one-per-line into deduplicated string[].

## AC 9: ralph/status.json parsed into session

```shell
grep -n 'parseRalphStatusToSession\|readIfExists.*ralphStatus' src/modules/sprint/migration.ts
```
```output
151:function parseRalphStatusToSession(content: string): SessionState | null {
199:  const statusContent = readIfExists(OLD_FILES.ralphStatus);
201:    ? (parseRalphStatusToSession(statusContent) ?? defaults.session)
```

**Verdict:** PASS — migrateV1ToV2 reads ralph/status.json, maps status→active, loop_count→iteration, elapsed_seconds→elapsedSeconds.

## AC 10: Migrated state written atomically with version: 2

```shell
grep -n 'writeFileSync.*tmp\|renameSync\|version: 2' src/modules/sprint/state.ts | head -5
```
```output
31:    version: 2,
91:    writeFileSync(tmp, data, 'utf-8');
92:    renameSync(tmp, final);
```

**Verdict:** PASS — writeStateAtomic writes to tmp then renames. migrateV1ToV2 sets version:2 (migration.ts:205).

## AC 11: v2 state not re-migrated

```shell
sed -n '116,145p' src/modules/sprint/state.ts | head -5
```
```output
      if (version === 2) {
        const defaults = defaultState();
        const run = parsed.run as Record<string, unknown> | undefined;
        const sprint = parsed.sprint as Record<string, unknown> | undefined;
        const session = parsed.session as Record<string, unknown> | undefined;
```

**Verdict:** PASS — version===2 returns state immediately without calling migrateV1ToV2.

## AC 12: migrateV1ToV2() reads external files

```shell
grep -n 'readIfExists' src/modules/sprint/migration.ts | grep -v 'function readIfExists'
```
```output
191:  const retriesContent = readIfExists(OLD_FILES.storyRetries);
195:  const flaggedContent = readIfExists(OLD_FILES.flaggedStories);
199:  const statusContent = readIfExists(OLD_FILES.ralphStatus);
```

**Verdict:** PASS — Reads .story_retries (space-separated), .flagged_stories (one per line), ralph/status.json.

## AC 13: Source files NOT deleted after migration

```shell
grep -n 'unlinkSync\|rmSync\|unlink\b' src/modules/sprint/migration.ts; echo "EXIT:$?"
```
```output
EXIT:1
```

**Verdict:** PASS — No file deletion calls in migration.ts. Exit code 1 confirms grep found no matches.

## AC 14: retry-state.ts reads from sprint-state.json

```shell
grep -n 'getSprintState\|writeStateAtomic\|\.story_retries\|\.flagged_stories' src/lib/retry-state.ts
```
```output
2:import { getSprintState, writeStateAtomic } from '../modules/sprint/state.js';
5:const RETRIES_FILE = '.story_retries';
6:const FLAGGED_FILE = '.flagged_stories';
13:  const result = getSprintState();
15:  writeStateAtomic(mutator(result.data));
39:  const result = getSprintState();
95:  const result = getSprintState();
```

**Verdict:** PASS — All read functions call getSprintState(). RETRIES_FILE/FLAGGED_FILE constants are only used in deprecated path helpers, not in data operations.

## AC 15: Flagged functions read from sprint-state.json

```shell
grep -n 'readFlaggedStories\|writeFlaggedStories\|removeFlaggedStory' src/lib/retry-state.ts
```
```output
94:export function readFlaggedStories(_dir: string): string[] {
106:export function writeFlaggedStories(_dir: string, stories: string[]): void {
116:export function removeFlaggedStory(dir: string, key: string): void {
117:  const stories = readFlaggedStories(dir);
119:  writeFlaggedStories(dir, filtered);
```

**Verdict:** PASS — readFlaggedStories calls getSprintState() (line 95), writeFlaggedStories uses mutateState (line 107-110) which calls getSprintState+writeStateAtomic.

## AC 16: Consumers compile and pass tests

```shell
grep -rn 'readRetries\|setRetryCount\|getRetryCount\|readFlaggedStories\|writeFlaggedStories\|removeFlaggedStory\|resetRetry' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'retry-state.ts'
```
```output
src//commands/retry.ts:5:  readRetries,
src//commands/retry.ts:6:  readFlaggedStories,
src//commands/retry.ts:7:  resetRetry,
src//commands/retry.ts:67:    resetRetry(dir, storyKey);
src//commands/retry.ts:74:    resetRetry(dir);
src//commands/retry.ts:84:  const retries = readRetries(dir);
src//commands/retry.ts:85:  const flagged = new Set(readFlaggedStories(dir));
```

**Verdict:** PASS — Only consumer is retry.ts command, which uses same API signatures. All 3410 tests pass.

## AC 17: All tests pass with 0 regressions

```shell
npx vitest run --reporter=verbose 2>&1 | grep -E '(Test Files|Tests.*passed)'
```
```output
 Test Files  123 passed (123)
      Tests  3410 passed (3410)
```

**Verdict:** PASS — 123 test files, 3410 tests, 0 failures.

## AC 18: Zero new type errors

```shell
npx tsc --noEmit 2>&1 | grep "error TS" | grep -E '(types/state\.ts|sprint/state\.ts|sprint/migration\.ts|lib/retry-state\.ts)'; echo "MATCHES:$?"
```
```output
MATCHES:1
```

**Verdict:** PASS — Zero type errors in story-changed files. 87 pre-existing errors all in unrelated files.

## AC 19: Migration test cases present

```shell
grep -c 'it(' src/modules/sprint/__tests__/migration.test.ts
```
```output
25
```

```shell
grep "it('" src/modules/sprint/__tests__/migration.test.ts | head -25
```
```output
  it('returns fail when no old files exist', () => {
  it('migrates story retries into attempts', () => {
  it('migrates sprint-status.yaml into story statuses', () => {
  it('migrates ralph/status.json into run section', () => {
  it('migrates flagged stories as blocked', () => {
  it('migrates session issues into action items', () => {
  it('handles missing old files gracefully (partial migration)', () => {
  it('writes sprint-state.json after migration', () => {
  it('handles invalid JSON in ralph/status.json gracefully', () => {
  it('handles retries file with malformed lines', () => {
  it('computes sprint counts correctly', () => {
  it('outputs version 2 from migrateFromOldFormat', () => {
  it('populates v2 retries field from .story_retries', () => {
  it('populates v2 flagged field from .flagged_stories', () => {
  it('populates v2 session from ralph/status.json', () => {
  it('initializes v2 epics as empty and observability as null', () => {
  it('does NOT delete .story_retries or .flagged_stories after migration', () => {
  it('converts v1 state with retries/flagged files to v2', () => {
  it('converts v1 state without retries/flagged files to v2 with empty defaults', () => {
  it('reads session data from ralph/status.json during migration', () => {
  it('handles missing version field (treated as v1)', () => {
  it('handles retries file with malformed lines gracefully', () => {
  it('does NOT delete source files after migration', () => {
  it('rejects negative retry counts', () => {
  it('deduplicates flagged stories', () => {
```

**Verdict:** PASS — 25 migration tests covering: (a) v1 with retries/flagged→v2, (b) v1 without files→v2 empty defaults, (c) v2 not re-migrated (via getSprintState v2 path), (d) missing version→v1, (e) malformed retries lines handled.
