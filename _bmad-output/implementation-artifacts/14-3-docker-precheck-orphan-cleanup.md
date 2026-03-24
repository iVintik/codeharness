# Story 14-3: Docker Pre-check and Orphan Cleanup

## Status: backlog

## Story

As a developer,
I want Docker availability checked BEFORE any verification attempt,
So that sessions don't burn 30 minutes on Docker failures.

## Acceptance Criteria

- [ ] AC1: Given Docker daemon is not running, when harness-run Step 1 pre-flight runs, then it fails fast with `[FAIL] Docker not available` without attempting any verification <!-- verification: cli-verifiable -->
- [ ] AC2: Given a leftover `codeharness-verify` container from a crashed session, when Step 1 pre-flight runs, then the orphaned container is removed <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 11 (Process Enforcement).** Docker pre-check and orphan cleanup are two of five embedded gates in harness-run Step 1 pre-flight.

### Docker Pre-check

Add to Step 1 pre-flight in `src/commands/run.ts`:

```typescript
// Step 1 pre-flight
const dockerResult = execSync('docker info', { stdio: 'pipe' }).toString();
if (!dockerResult) {
  output.fail('Docker not available — install Docker or start the daemon');
  process.exit(1);
}
```

This must run BEFORE any verification, observability stack start, or container operations. Currently some code paths attempt Docker operations and fail late with confusing errors.

Use the existing `checkDocker()` function from `src/lib/docker.ts` (or `src/lib/docker/health.ts` after Epic 12 restructuring). If it doesn't exist as a simple boolean check, create one.

### Orphan Container Cleanup

After Docker pre-check passes, clean up leftover containers:

```typescript
// Remove orphaned verify containers
try {
  execSync('docker rm -f codeharness-verify 2>/dev/null', { stdio: 'pipe' });
} catch {
  // IGNORE: container may not exist — that's fine
}
```

Also check for any containers matching the `codeharness-*` pattern that are in `exited` or `dead` state:

```typescript
const orphans = execSync(
  "docker ps -a --filter 'name=codeharness-' --filter 'status=exited' --format '{{.Names}}'",
  { stdio: 'pipe' }
).toString().trim();
if (orphans) {
  execSync(`docker rm ${orphans}`, { stdio: 'pipe' });
  output.info(`Cleaned up orphaned containers: ${orphans}`);
}
```

The cleanup function already partially exists in `src/modules/infra/container-cleanup.ts`. Consolidate there and call from run.ts pre-flight.

### Error type

Use `DockerNotAvailableError` (Decision 7) for typed error handling:
```typescript
class DockerNotAvailableError extends Error { name = 'DockerNotAvailableError'; }
```

## Files to Change

- `src/commands/run.ts` — Add Docker pre-check and orphan cleanup to Step 1 pre-flight, before any verification or stack operations
- `src/modules/infra/container-cleanup.ts` — Add `cleanupOrphanedContainers()` function that removes exited/dead codeharness containers
- `src/lib/docker.ts` (or `src/lib/docker/health.ts`) — Ensure `checkDocker(): boolean` exists as a simple availability check
- `src/lib/docker.ts` (or `src/lib/docker/cleanup.ts`) — Add `DockerNotAvailableError` typed error class
