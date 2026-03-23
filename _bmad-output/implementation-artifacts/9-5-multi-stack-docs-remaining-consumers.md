# Story 9-5: Multi-stack docs and remaining consumers

## Status: backlog

## Story

As a developer initializing a multi-stack project,
I want AGENTS.md and README to reflect all detected stacks,
So that AI agents and humans know how to build/test all components.

## Acceptance Criteria

- [ ] AC1: Given a multi-stack project, when `generateAgentsMdContent()` is called, then it lists build/test commands for all detected stacks <!-- verification: cli-verifiable -->
- [ ] AC2: Given `['nodejs', 'rust']`, when `getStackLabel()` is called, then it returns `'Node.js (package.json) + Rust (Cargo.toml)'` <!-- verification: cli-verifiable -->
- [ ] AC3: Given a multi-stack project, when `getProjectName()` is called, then it tries each stack's project file (package.json name, Cargo.toml [package] name) and returns the first found <!-- verification: cli-verifiable -->
- [ ] AC4: Given state has `stacks: ['nodejs', 'rust']`, when `verify/env.ts` checks for nodejs, then it uses `stacks.includes('nodejs')` instead of `stack === 'nodejs'` <!-- verification: cli-verifiable -->
- [ ] AC5: Given all changes complete, when `npm test` runs, then all existing single-stack tests pass with 0 regressions <!-- verification: cli-verifiable -->

## Technical Notes

### Changes to `src/modules/infra/docs-scaffold.ts`

**`getStackLabel()` (L50):**
Currently accepts `string | null`. Add overload for `string[]`:
- If `string[]`, map each to its label (`nodejs` → `Node.js (package.json)`, `rust` → `Rust (Cargo.toml)`, `python` → `Python (requirements.txt)`) and join with ` + `.
- If `string`, keep existing behavior (backward compat).

**`generateAgentsMdContent()` (L63):**
Currently accepts a single stack. Add overload for `StackDetection[]`:
- If `StackDetection[]`, generate a section for each stack with its build/test commands:
  ```markdown
  ## Build & Test

  ### Node.js (frontend/)
  - `cd frontend && npm ci`
  - `cd frontend && npm test`

  ### Rust (backend/)
  - `cd backend && cargo build`
  - `cd backend && cargo test`
  ```
- If single stack, keep existing output unchanged.

**`getCoverageTool()` (if present):**
Accept `string | string[]`. If array, return primary stack's (`[0]`) coverage tool.

**`getProjectName()`:**
Try each stack's project file in order:
1. `package.json` → `name` field
2. `Cargo.toml` → `[package]` → `name` field
3. `pyproject.toml` → `[project]` → `name` field
Return the first found, fall back to directory name.

### Changes to `src/modules/verify/env.ts`

Find all occurrences of `state.stack === 'nodejs'` (and similar for other stacks) and replace with `state.stacks?.includes('nodejs')`. The `?.` handles old state objects that might not have `stacks` yet.

This file has 1-2 stack reference points — minor change.

### Changes to `src/commands/teardown.ts`

Reads `stack` from state for stack-specific cleanup. Update to read `stacks` from state, use `stacks[0]` (primary) for any stack-specific teardown logic. Minor change — 1-2 references.

### Changes to `src/templates/readme.ts`

**`getInstallCommand()` (L72):**
Accept `string | string[]`. If array, render per-stack install commands:
```markdown
### Node.js
npm ci

### Rust
cargo build
```
If single string, keep existing output.

### Import changes

Add `StackDetection` import from `../../lib/stack-detect` in docs-scaffold.ts and dockerfile-template.ts.

### Test files

Update `src/modules/infra/__tests__/docs-scaffold.test.ts`:
- `getStackLabel(['nodejs', 'rust'])` → `'Node.js (package.json) + Rust (Cargo.toml)'`
- `getStackLabel('nodejs')` → existing output (backward compat)
- `generateAgentsMdContent()` with multi-stack → sections for each stack
- `getProjectName()` with multi-stack → finds first available name

Update tests for `verify/env.ts` and `teardown.ts` if they have stack-related test cases — update assertions to use `stacks` array.

## Files to Change

- `src/modules/infra/docs-scaffold.ts` — Update `getStackLabel()` (L50) to accept `string[]`, update `generateAgentsMdContent()` (L63) to accept `StackDetection[]` with per-stack sections, update `getProjectName()` to try multiple stack project files
- `src/modules/verify/env.ts` — Replace `state.stack === 'nodejs'` with `state.stacks?.includes('nodejs')` (and similar for other stacks)
- `src/commands/teardown.ts` — Update stack references to use `stacks[0]` from state
- `src/templates/readme.ts` — Update `getInstallCommand()` (L72) to accept `string[]` and render per-stack commands
- `src/modules/infra/__tests__/docs-scaffold.test.ts` — Add multi-stack label, multi-stack AGENTS.md, and getProjectName tests
