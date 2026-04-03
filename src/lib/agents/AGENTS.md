# src/lib/agents — Agent Driver Abstraction

Pluggable agent driver system for wrapping external coding agents (Claude Code, Codex, OpenCode) behind a uniform `AgentDriver` interface. Each driver handles spawning, output parsing, health checks, and capability reporting.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| types.ts | AgentDriver interface and related types — DriverHealth, DriverCapabilities, DispatchOpts, OutputContract, plus deprecated SpawnOpts/AgentProcess/AgentEvent | `AgentDriver`, `DriverHealth`, `DriverCapabilities`, `DispatchOpts`, `OutputContract`, `TestResults`, `ACStatus` |
| stream-parser.ts | Stateless NDJSON stream parser — converts Claude API streaming events into typed `StreamEvent` objects | `parseStreamLine`, `StreamEvent`, `ToolStartEvent`, `ToolInputEvent`, `ToolCompleteEvent`, `TextEvent`, `RetryEvent`, `ResultEvent` |
| model-resolver.ts | Model resolution with 3-level cascade: task → agent → driver default | `resolveModel` |
| output-contract.ts | Atomic write/read for OutputContract JSON files — writes to .tmp then renames, path-traversal safe | `writeOutputContract`, `readOutputContract` |
| index.ts | Barrel re-exports for agents subsystem — types, stream parser, driver factory, model resolver, output contract | all public API |
| capability-check.ts | Pre-flight capability conflict detection and cost routing hints — checks workflow tasks against driver capabilities, suggests cheaper alternatives | `checkCapabilityConflicts`, `CapabilityWarning` |

## Subdirectories — drivers/

| File | Purpose | Key Exports |
|------|---------|-------------|
| drivers/factory.ts | Driver factory and module-singleton registry — register, retrieve, list, and reset drivers | `getDriver`, `registerDriver`, `listDrivers`, `resetDrivers` |
| drivers/claude-code.ts | Claude Code driver — in-process driver using the Agent SDK (no CLI spawning) | `ClaudeCodeDriver` |
| drivers/codex.ts | Codex driver — CLI-wrapped driver for OpenAI Codex, spawns `codex` binary and parses NDJSON stdout | `CodexDriver` |
| drivers/opencode.ts | OpenCode driver — CLI-wrapped driver for OpenCode, spawns `opencode` binary and parses NDJSON stdout | `OpenCodeDriver` |
| drivers/index.ts | Barrel re-exports — factory functions and all driver classes | all public API |

## Tests

| File | Purpose |
|------|---------|
| __tests__/types.test.ts | Type contract tests for AgentDriver interface |
| __tests__/stream-parser.test.ts | Stream parser tests — NDJSON event parsing for all StreamEvent types |
| __tests__/model-resolver.test.ts | Model resolver cascade tests |
| __tests__/index.test.ts | Barrel export verification tests |
| __tests__/claude-code-driver.test.ts | Claude Code driver tests |
| __tests__/codex-driver.test.ts | Codex driver tests |
| __tests__/opencode-driver.test.ts | OpenCode driver tests |
| __tests__/factory.test.ts | Driver factory/registry tests |
