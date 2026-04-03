# src/lib/agents/drivers — Concrete Agent Drivers

Concrete AgentDriver implementations and the driver factory/registry. Each driver wraps an external coding agent CLI (or SDK) behind the uniform AgentDriver interface defined in `../types.ts`.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| factory.ts | Driver factory and module-singleton registry — register, retrieve, list, and reset drivers | `getDriver`, `registerDriver`, `listDrivers`, `resetDrivers` |
| claude-code.ts | Claude Code driver — in-process driver using the Agent SDK (no CLI spawning) | `ClaudeCodeDriver` |
| codex.ts | Codex driver — CLI-wrapped driver for OpenAI Codex, spawns `codex` binary and parses NDJSON stdout | `CodexDriver` |
| opencode.ts | OpenCode driver — CLI-wrapped driver for OpenCode, spawns `opencode` binary and parses NDJSON stdout | `OpenCodeDriver` |
| index.ts | Barrel re-exports — factory functions and all driver classes | all public API |
