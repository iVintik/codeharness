# Story 8.4: Scan Persistence & Onboarding Progress Tracking

Status: ready-for-dev

## Story

As a developer going through onboarding over multiple sessions,
I want scan results to persist and progress to be visible,
So that I can see how far along the onboarding is without re-scanning every time.

## Acceptance Criteria

1. **Given** `codeharness onboard scan` completes, **When** results are ready, **Then** they are saved to `.harness/last-onboard-scan.json`.

2. **Given** a saved scan exists and is less than 24 hours old, **When** `codeharness onboard coverage` or `onboard epic` runs, **Then** the saved scan is reused instead of re-scanning **And** `[INFO] Using cached scan from <timestamp>` is printed.

3. **Given** a saved scan exists but is older than 24 hours, **When** any onboard subcommand runs, **Then** a fresh scan is performed **And** the cache is updated.

4. **Given** `--force-scan` flag is passed, **When** onboard runs, **Then** cache is ignored and a fresh scan is performed.

5. **Given** onboarding has generated 7 gaps and 3 are fixed (closed in beads), **When** I run `codeharness onboard` or `codeharness status`, **Then** `[INFO] Onboarding progress: 3/7 gaps resolved (4 remaining)` is printed.

6. **Given** all onboarding gaps are resolved, **When** I run `codeharness onboard`, **Then** `[OK] Onboarding complete — all gaps resolved` is printed **And** exit code is 0.

## Tasks / Subtasks

- [ ] Task 1: Create scan cache persistence module `src/lib/scan-cache.ts` (AC: #1, #2, #3, #4)
  - [ ] 1.1: Define the cache file path as `.harness/last-onboard-scan.json` relative to project root. Define `ScanCacheEntry` interface:
    ```ts
    interface ScanCacheEntry {
      timestamp: string;       // ISO 8601 timestamp of when scan was performed
      scan: ScanResult;
      coverage: CoverageGapReport;
      audit: DocAuditResult;
    }
    ```
  - [ ] 1.2: Create `saveScanCache(entry: ScanCacheEntry, dir?: string): void` that writes the cache entry as JSON to `.harness/last-onboard-scan.json`. Create the `.harness/` directory if it doesn't exist using `mkdirSync({ recursive: true })`.
  - [ ] 1.3: Create `loadScanCache(dir?: string): ScanCacheEntry | null` that reads the cache file, parses it as JSON, and returns the entry. Returns `null` if the file doesn't exist, is unreadable, or fails to parse.
  - [ ] 1.4: Create `isCacheValid(entry: ScanCacheEntry, maxAgeMs?: number): boolean` that checks if the cache entry's timestamp is within the given max age (default: 24 hours = `86_400_000` ms). Compare `Date.now() - new Date(entry.timestamp).getTime()` against `maxAgeMs`. Returns `false` if timestamp is invalid or missing.
  - [ ] 1.5: Create `loadValidCache(dir?: string, opts?: { forceScan?: boolean; maxAgeMs?: number }): ScanCacheEntry | null` convenience function:
    - If `opts.forceScan` is true, return `null` (skip cache entirely).
    - Call `loadScanCache(dir)`. If null, return null.
    - Call `isCacheValid(entry, opts.maxAgeMs)`. If invalid, return null.
    - Otherwise return the entry.

- [ ] Task 2: Integrate scan cache into `src/commands/onboard.ts` (AC: #1, #2, #3, #4)
  - [ ] 2.1: Add `--force-scan` option to the `onboard` command: `.option('--force-scan', 'Ignore cached scan and perform a fresh scan')`.
  - [ ] 2.2: Update `runScan()` to accept a `forceScan` parameter. After scanning, call `saveScanCache()` with the scan result, current timestamp, and placeholders for coverage/audit (they will be updated later).
  - [ ] 2.3: In the `coverage` subcommand action: before scanning, try `loadValidCache(process.cwd(), { forceScan })`. If a valid cache exists, reuse `cache.scan` and print `info('Using cached scan from <timestamp>')`. Otherwise run a fresh scan.
  - [ ] 2.4: In the `epic` subcommand action: same cache logic — try to load cached scan before running a fresh one.
  - [ ] 2.5: In the default combined action (`onboard` with no subcommand): after all three phases complete (scan, coverage, audit), save the complete `ScanCacheEntry` with all results and the current timestamp.
  - [ ] 2.6: In the `scan` subcommand action: after scanning, save scan results to cache. Coverage and audit fields should be `null` since they haven't run yet. Update `ScanCacheEntry` to make `coverage` and `audit` optional (`coverage?: CoverageGapReport | null`, `audit?: DocAuditResult | null`).
  - [ ] 2.7: When reusing cached scan, format the timestamp for display: use `new Date(cache.timestamp).toLocaleString()` or similar.

- [ ] Task 3: Add onboarding progress tracking (AC: #5, #6)
  - [ ] 3.1: Create `getOnboardingProgress(beadsFns: { listIssues: () => BeadsIssue[] }): { total: number; resolved: number; remaining: number } | null` in `src/lib/onboard-checks.ts`. This function:
    - Calls `beadsFns.listIssues()` to get all issues.
    - Filters issues to those whose description contains a gap-id tag (regex: `/\[gap:[a-z-]+:[^\]]+\]/`).
    - Counts total onboarding gap issues.
    - Counts resolved (status === `'done'` or `'closed'`).
    - Returns `{ total, resolved, remaining: total - resolved }`.
    - If no gap-tagged issues exist, returns `null` (no onboarding has been done).
    - Wraps `listIssues()` in try/catch — if beads is unavailable, returns `null`.
  - [ ] 3.2: In `src/commands/onboard.ts`, after precondition checks and before scan/epic generation, call `getOnboardingProgress({ listIssues })`. If result is not null:
    - If `remaining === 0`: print `ok('Onboarding complete — all gaps resolved')` and return early (exit code 0) — unless `--full` or `--force-scan` is passed.
    - Otherwise: print `info(`Onboarding progress: ${resolved}/${total} gaps resolved (${remaining} remaining)`)`.
  - [ ] 3.3: In `src/commands/status.ts`, add onboarding progress to the status output. Import `getOnboardingProgress` and `listIssues`. Call `getOnboardingProgress({ listIssues })` and if not null, print the progress line in the status report. Add the progress data to JSON output under an `onboarding` key.

- [ ] Task 4: Add `.harness/` to `.gitignore` (AC: #1)
  - [ ] 4.1: Check if `.harness/` or `.harness` is already in the project's `.gitignore`. If not, add `.harness/` to the `.gitignore` file. This is a cache directory and should not be committed.
  - [ ] 4.2: If codeharness manages a `.gitignore` template during `init`, add `.harness/` there as well.

- [ ] Task 5: Update teardown to clean `.harness/` (AC: #1)
  - [ ] 5.1: In `src/commands/teardown.ts`, add `.harness/` directory removal to the teardown sequence. Use `rmSync('.harness', { recursive: true, force: true })` — same pattern as other teardown artifacts.
  - [ ] 5.2: Add `.harness/` to the teardown output listing of removed artifacts.

- [ ] Task 6: Write unit tests (AC: #1-#6)
  - [ ] 6.1: Create `src/lib/__tests__/scan-cache.test.ts` with tests for:
    - `saveScanCache` — writes JSON file to `.harness/last-onboard-scan.json`, creates directory if missing.
    - `loadScanCache` — reads and parses cache file, returns null if missing or malformed.
    - `isCacheValid` — returns true for recent timestamps, false for old timestamps, false for invalid timestamps.
    - `loadValidCache` — returns null when forceScan is true, returns null when cache is expired, returns entry when valid.
  - [ ] 6.2: Add tests for `getOnboardingProgress` in `src/lib/__tests__/onboard-checks.test.ts`:
    - No gap-tagged issues → returns null.
    - Mixed issues (some with gap tags, some without) → counts only gap-tagged ones.
    - All resolved → `{ total: N, resolved: N, remaining: 0 }`.
    - Some resolved → correct counts.
    - Beads unavailable (listIssues throws) → returns null.
  - [ ] 6.3: Update `src/commands/__tests__/onboard.test.ts` to verify:
    - `--force-scan` flag is accepted and bypasses cache.
    - Cached scan is reused when valid.
    - Progress message is printed when onboarding gaps exist.
    - "Onboarding complete" message when all gaps resolved.
    - Early exit when all gaps resolved (unless `--full` or `--force-scan`).
  - [ ] 6.4: Update `src/commands/__tests__/status.test.ts` to verify onboarding progress appears in status output.
  - [ ] 6.5: Update `src/commands/__tests__/teardown.test.ts` to verify `.harness/` is removed during teardown.

- [ ] Task 7: Build and verify (AC: #1-#6)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully with the new `scan-cache.ts` module.
  - [ ] 7.2: Run `npm run test:unit` — verify all unit tests pass including new cache and progress tests.
  - [ ] 7.3: Run `npm run test:coverage` — verify 100% test coverage is maintained.

## Dev Notes

### Architecture Context

Currently, every `codeharness onboard` invocation re-scans the entire codebase from scratch. For small projects this is fine, but as projects grow, scanning becomes slower. More importantly, developers going through a multi-session onboarding workflow have no visibility into how much progress they've made — they see the same output each time (minus the gap filtering from story 8-2).

This story adds two capabilities:
1. **Scan caching** — saves scan/coverage/audit results to `.harness/last-onboard-scan.json` and reuses them if fresh enough (< 24 hours). This avoids redundant I/O-heavy scans when running `onboard coverage` or `onboard epic` separately after a recent `onboard scan`.
2. **Progress tracking** — uses the gap-id system (from story 8-1) to count how many onboarding gaps have been resolved in beads, giving a clear "X/Y gaps resolved" progress indicator.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/scan-cache.ts` | **NEW** — cache persistence functions: save, load, validate, loadValid |
| `src/commands/onboard.ts` | Add `--force-scan` flag, integrate cache load/save around scan calls, add progress reporting |
| `src/lib/onboard-checks.ts` | Add `getOnboardingProgress()` function |
| `src/commands/status.ts` | Add onboarding progress line to status output |
| `src/commands/teardown.ts` | Add `.harness/` directory cleanup |
| `.gitignore` | Add `.harness/` entry |
| `src/lib/__tests__/scan-cache.test.ts` | **NEW** — unit tests for cache module |
| `src/lib/__tests__/onboard-checks.test.ts` | Add `getOnboardingProgress` tests |
| `src/commands/__tests__/onboard.test.ts` | Add cache and progress integration tests |
| `src/commands/__tests__/status.test.ts` | Add onboarding progress display tests |
| `src/commands/__tests__/teardown.test.ts` | Add `.harness/` cleanup test |

### Existing Code to Leverage

| Module | Function / Type | Purpose |
|--------|----------------|---------|
| `src/lib/scanner.ts` | `ScanResult`, `CoverageGapReport`, `DocAuditResult` | Types for scan results that will be cached |
| `src/lib/scanner.ts` | `scanCodebase()`, `analyzeCoverageGaps()`, `auditDocumentation()` | The scan functions whose results get cached |
| `src/commands/onboard.ts` | `runScan()`, `runCoverageAnalysis()`, `runAudit()` | Current scan execution functions — will be wrapped with cache logic |
| `src/lib/onboard-checks.ts` | `storyToGapId()` | Gap-id mapping — used indirectly by progress tracking (matching gap tags in beads issues) |
| `src/lib/beads.ts` | `listIssues()`, `BeadsIssue` | Lists beads issues for progress counting |
| `src/lib/output.ts` | `ok()`, `info()`, `warn()` | Output formatting functions |
| `src/lib/state.ts` | `getStatePath()` | Pattern reference for how codeharness stores per-project data |

### Cache File Location

The cache lives at `.harness/last-onboard-scan.json` rather than inside `.claude/` because:
- `.claude/codeharness.local.md` is the state file — it's configuration, not cache.
- `.harness/` is a cache directory — disposable, not committed, cleaned on teardown.
- This follows the pattern of separating configuration (`.claude/`) from ephemeral data (`.harness/`).

### Cache Staleness

The 24-hour TTL is a pragmatic default. The codebase doesn't change dramatically in 24 hours during an onboarding session. The `--force-scan` flag provides an escape hatch when the developer knows the code has changed significantly (e.g., after a large merge).

### Progress Tracking via Gap-IDs

Rather than maintaining a separate progress database, progress is derived from beads issues:
- Every onboarding gap creates a beads issue with a `[gap:*:*]` tag (stories 8-1 through 8-3).
- To compute progress: list all beads issues, filter to those with gap tags, count done vs open.
- This is eventually consistent — if someone closes an issue outside of codeharness, progress reflects it.
- If beads is unavailable, progress tracking gracefully returns null (no output, no error).

### Edge Cases

- **No cache file**: `loadScanCache()` returns null, fresh scan is performed. First run always scans.
- **Corrupted cache file**: `loadScanCache()` catches JSON parse errors and returns null, triggering a fresh scan.
- **Cache with partial data**: If scan was cached but coverage/audit were not (e.g., ran `onboard scan` only), the cache entry has null coverage/audit fields. Subcommands that need those will still run their respective analysis.
- **Clock skew**: `isCacheValid()` compares against `Date.now()`. If the system clock jumped forward, cache may expire early. Not worth solving.
- **Concurrent runs**: Two `onboard` processes writing to the same cache file could race. Last-write-wins is acceptable for a cache.
- **No beads issues at all**: `getOnboardingProgress()` returns null (not `{ total: 0, resolved: 0, remaining: 0 }`), meaning no progress line is printed. This is correct — if no onboarding was ever run, there's nothing to report.
- **All gaps resolved + `--full`**: Even when all gaps are resolved, `--full` forces a full scan and shows all gaps. The "Onboarding complete" early exit is skipped.
- **All gaps resolved + `--force-scan`**: Similarly, `--force-scan` skips the early exit to allow re-scanning.

### Interaction with Existing `lastScanResult` Module State

The current `onboard.ts` uses module-level variables (`lastScanResult`, `lastCoverageResult`, `lastAuditResult`) to pass results between subcommands run in the same process. The scan cache is a separate mechanism for cross-session persistence. Both can coexist:
- Within a session: module-level variables are used (faster, in-memory).
- Across sessions: the `.harness/` cache file is used (persisted to disk).
- When a cache is loaded, the module-level variables should also be updated so that subsequent subcommands within the same session use the cached data.
