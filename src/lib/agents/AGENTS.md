# src/lib/agents — Agent Driver Abstraction

Pluggable agent driver system for wrapping external processes (Ralph, future agents) behind a uniform `AgentDriver` interface. Each driver handles spawning, output parsing, and status file resolution for its agent.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| types.ts | AgentDriver interface and related types — SpawnOpts, AgentProcess, AgentEvent discriminated union | `AgentDriver`, `SpawnOpts`, `AgentProcess`, `AgentEvent` |
| ralph.ts | RalphDriver implementation — wraps ralph.sh spawning and output parsing in AgentDriver interface | `RalphDriver`, `buildSpawnArgs`, `resolveRalphPath`, `parseRalphMessage`, `parseIterationMessage` |
| stream-parser.ts | Stateless NDJSON stream parser — converts Claude API streaming events into typed `StreamEvent` objects | `parseStreamLine`, `StreamEvent`, `StreamEventType` |
| ralph-prompt.ts | Ralph system prompt generator — builds the prompt template for ralph sessions | `generateRalphPrompt`, `RalphPromptConfig` |
| index.ts | Barrel re-exports for agents subsystem — RalphDriver, stream parser, ralph prompt | all public API |

## Tests

| File | Purpose |
|------|---------|
| __tests__/ralph.test.ts | RalphDriver tests — parseOutput (all patterns), spawn arg building, getStatusFile |
| __tests__/stream-parser.test.ts | Stream parser tests — NDJSON event parsing for all StreamEvent types |
| __tests__/ralph-prompt.test.ts | Ralph prompt generation tests |
