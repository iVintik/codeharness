# Story 13-2: Implement RalphDriver

## Status: backlog

## Story

As a developer,
I want Ralph wrapped in an `AgentDriver` implementation,
So that ralph-specific behavior is isolated in one file.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/agents/ralph.ts` exists, when inspected, then it implements `AgentDriver` with: `spawn()` (builds ralph.sh args), `parseOutput()` (parses ralph stderr + stream-json) <!-- verification: cli-verifiable -->
- [ ] AC2: Given `run-helpers.ts` ralph-specific functions (`parseRalphMessage`, `parseIterationMessage`, `buildSpawnArgs`), when migration completes, then they're moved into `ralph.ts` and `run-helpers.ts` is deleted <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 3 (Agent Abstraction).** Ralph becomes one implementation of `AgentDriver`.

`RalphDriver` wraps `ralph.sh` invocation:

```typescript
class RalphDriver implements AgentDriver {
  readonly name = 'ralph';

  spawn(opts: SpawnOpts): AgentProcess {
    // Build ralph.sh args from SpawnOpts
    // Resolve ralph.sh path (from resolveRalphPath())
    // Spawn child process with correct env
    return childProcess;
  }

  parseOutput(line: string): AgentEvent | null {
    // Parse ralph stderr messages (iteration counts, story status)
    // Parse stream-json output from Claude CLI
    // Convert to AgentEvent discriminated union
  }

  getStatusFile(): string {
    return 'ralph/status.json';
  }
}
```

Functions to migrate from `src/lib/run-helpers.ts` into `ralph.ts`:
- `parseRalphMessage()` — Parses ralph.sh stderr output for iteration counts, story completion
- `parseIterationMessage()` — Extracts iteration number from ralph output
- `buildSpawnArgs()` — Constructs the args array for spawning ralph.sh
- `resolveRalphPath()` — Finds ralph.sh in npm global or plugin directory

Also migrate from `src/lib/stream-parser.ts`:
- Stream JSON parsing logic used to interpret Claude CLI output. Move to `src/lib/agents/stream-parser.ts` (same file, new location under agents/).

Migrate from `src/templates/ralph-prompt.ts`:
- Ralph prompt generation. Move into `ralph.ts` or keep as a separate `src/lib/agents/ralph-prompt.ts` if >100 lines.

After migration, `src/lib/run-helpers.ts` should be deleted. All its exports are now in `src/lib/agents/ralph.ts`.

## Files to Change

- `src/lib/agents/ralph.ts` — Create. Implement `RalphDriver` with `spawn()`, `parseOutput()`, `getStatusFile()`. Absorb functions from run-helpers.ts
- `src/lib/agents/stream-parser.ts` — Move from `src/lib/stream-parser.ts`. Parse Claude CLI stream-json output
- `src/lib/agents/index.ts` — Update. Re-export `RalphDriver` and stream parser
- `src/lib/run-helpers.ts` — Delete after migrating all functions to ralph.ts
- `src/lib/stream-parser.ts` — Delete after moving to agents/stream-parser.ts
- `src/templates/ralph-prompt.ts` — Move ralph prompt generation into agents/ directory
- All files importing from `run-helpers.ts` or `stream-parser.ts` — Update import paths
