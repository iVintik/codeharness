# Story 1.1: Project Scaffold & CLI Entry Point

Status: ready-for-dev

## Story

As a developer,
I want to install codeharness as a global npm package,
So that I can run `codeharness` commands in any project directory.

## Acceptance Criteria

1. **Given** a developer runs `npm install -g codeharness`, **When** the installation completes, **Then** the `codeharness` binary is available in PATH, `codeharness --version` prints the current version, and `codeharness --help` lists all available commands.

2. **Given** the CLI is installed, **When** a developer runs `codeharness --help`, **Then** all 7 commands are listed: init, bridge, run, verify, status, onboard, teardown. The hidden `state` utility command is not shown in help but is callable.

3. **Given** any command is invoked, **When** it produces output, **Then** each line uses `[OK]`, `[FAIL]`, `[WARN]`, or `[INFO]` status prefixes. The `--json` flag is accepted and produces machine-readable JSON output.

4. **Given** a developer runs any stub command (bridge, run, verify, status, onboard, teardown), **When** the command executes, **Then** it exits with code 1 and prints `[FAIL] Not yet implemented. Coming in Epic N.`

5. **Given** the project structure, **When** built with `npm run build`, **Then** tsup compiles TypeScript from `src/index.ts` to `dist/index.js`, `vitest` runs unit tests successfully, and exit codes follow convention: 0 success, 1 error, 2 invalid usage.

## Tasks / Subtasks

- [ ] Task 1: Initialize the Node.js project scaffold (AC: #5)
  - [ ] 1.1: Update `package.json` — add `type: "module"`, `bin` field pointing to `./dist/index.js`, `engines` field for Node.js >= 18, version `0.1.0`
  - [ ] 1.2: Install production dependencies: `commander`
  - [ ] 1.3: Install dev dependencies: `typescript`, `tsup`, `vitest`, `@types/node`
  - [ ] 1.4: Create `tsconfig.json` with strict mode, ESM target, `src/` as root, `dist/` as output
  - [ ] 1.5: Create `tsup.config.ts` — single entry `src/index.ts`, format ESM, add shebang `#!/usr/bin/env node`
  - [ ] 1.6: Create `vitest.config.ts` — test root `src/`, coverage via c8
  - [ ] 1.7: Add npm scripts: `build` (tsup), `test` (vitest), `test:coverage` (vitest --coverage)

- [ ] Task 2: Create CLI entry point with Commander.js (AC: #1, #2)
  - [ ] 2.1: Create `src/index.ts` — Commander.js program with name `codeharness`, description, version from package.json
  - [ ] 2.2: Register all 7 visible commands: `init`, `bridge`, `run`, `verify`, `status`, `onboard`, `teardown`
  - [ ] 2.3: Register hidden `state` command (using `.hideHelp()` in Commander.js)
  - [ ] 2.4: Add global `--json` option for machine-readable output
  - [ ] 2.5: Parse and execute — `program.parse(process.argv)`

- [ ] Task 3: Create stub command modules (AC: #4)
  - [ ] 3.1: Create `src/commands/init.ts` — stub that prints `[FAIL] Not yet implemented. Coming in Epic 1.` and exits 1
  - [ ] 3.2: Create `src/commands/bridge.ts` — stub, Epic 3
  - [ ] 3.3: Create `src/commands/run.ts` — stub, Epic 5
  - [ ] 3.4: Create `src/commands/verify.ts` — stub, Epic 4
  - [ ] 3.5: Create `src/commands/status.ts` — stub, Epic 7
  - [ ] 3.6: Create `src/commands/onboard.ts` — stub, Epic 6
  - [ ] 3.7: Create `src/commands/teardown.ts` — stub, Epic 7
  - [ ] 3.8: Create `src/commands/state.ts` — hidden stub, Epic 1 (Story 1.2)

- [ ] Task 4: Implement CLI output utilities (AC: #3)
  - [ ] 4.1: Create `src/lib/output.ts` — functions for `ok()`, `fail()`, `warn()`, `info()` that prefix with `[OK]`, `[FAIL]`, `[WARN]`, `[INFO]`
  - [ ] 4.2: Add `jsonOutput()` function that outputs JSON when `--json` flag is set
  - [ ] 4.3: Stubs use these output functions for consistent formatting

- [ ] Task 5: Write unit tests (AC: #5)
  - [ ] 5.1: Create `src/commands/__tests__/stubs.test.ts` — test each stub command exits with code 1 and correct message
  - [ ] 5.2: Create `src/lib/__tests__/output.test.ts` — test output utility functions produce correct prefixes
  - [ ] 5.3: Create `src/__tests__/cli.test.ts` — test CLI entry point: --version, --help, command registration
  - [ ] 5.4: Verify 100% coverage of all new code

- [ ] Task 6: Build and verify (AC: #1, #5)
  - [ ] 6.1: Run `npm run build` — verify tsup produces `dist/index.js` with shebang
  - [ ] 6.2: Run `npm test` — all tests pass
  - [ ] 6.3: Run `npm link` — verify `codeharness` is available globally
  - [ ] 6.4: Run `codeharness --version` — prints version
  - [ ] 6.5: Run `codeharness --help` — lists all 7 commands, `state` not shown
  - [ ] 6.6: Run `codeharness init` — prints stub message, exits 1
  - [ ] 6.7: Run `codeharness state` — callable despite being hidden

## Dev Notes

### This Is the Foundation — Get It Right

This story creates the entire TypeScript project scaffold that every subsequent story builds on. The choices made here (ESM modules, tsup bundling, Commander.js patterns, output utilities) propagate through the entire codebase. Errors here compound.

### Architecture Decisions That Apply

- **Architecture Decision 1 (CLI ↔ Plugin Boundary):** This story is CLI-only. No plugin files. The CLI owns all mechanical work.
- **Starter Template Selection:** Manual scaffold with tsup + Commander.js (not oclif — too heavy for 7 commands).
- **ESM modules:** `"type": "module"` in package.json. All imports use ESM syntax.
- **TypeScript strict mode:** `strict: true` in tsconfig.json. No `any` types.

### CLI Output Contract

All CLI output MUST use these prefixes (from Architecture — Implementation Patterns):
```
[OK]   Success message
[WARN] Warning message
[FAIL] Error message
[INFO] Informational message
```

The `--json` flag produces machine-readable JSON. Both modes must work from the start.

### Exit Code Convention

- `0` — success
- `1` — error (something failed)
- `2` — invalid usage (bad arguments)

Stubs exit with `1` because "not implemented" is an error condition.

### Commander.js Patterns

```typescript
import { Command } from 'commander';

const program = new Command();
program
  .name('codeharness')
  .description('Makes autonomous coding agents produce software that actually works')
  .version('0.1.0');

// Visible command
program.command('init')
  .description('Initialize the harness in a project')
  .action(initCommand);

// Hidden command
program.command('state')
  .description('Manage harness state')
  .hideHelp()
  .action(stateCommand);
```

### tsup Configuration

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

### Project Structure After This Story

```
codeharness/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── commands/
│   │   ├── init.ts                 # Stub → Epic 1
│   │   ├── bridge.ts              # Stub → Epic 3
│   │   ├── run.ts                 # Stub → Epic 5
│   │   ├── verify.ts             # Stub → Epic 4
│   │   ├── status.ts             # Stub → Epic 7
│   │   ├── onboard.ts            # Stub → Epic 6
│   │   ├── teardown.ts           # Stub → Epic 7
│   │   └── state.ts              # Stub (hidden) → Epic 1
│   │   └── __tests__/
│   │       └── stubs.test.ts
│   └── lib/
│       ├── output.ts              # [OK]/[FAIL]/[WARN]/[INFO] + JSON
│       └── __tests__/
│           └── output.test.ts
├── dist/                           # tsup output (gitignored)
│   └── index.js
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── ... (existing plugin files untouched)
```

### Relationship to Existing Project Structure

The current project is a Claude Code plugin (markdown commands, bash hooks, BATS tests). This story adds the Node.js CLI scaffold alongside the existing plugin structure. The existing `package.json` will be updated (not replaced) — preserve existing scripts like `test:ralph` alongside new ones.

### What NOT To Do

- **Do NOT implement any real command logic** — all commands are stubs that print "not implemented"
- **Do NOT create plugin files** — this is CLI-only
- **Do NOT use CommonJS** — ESM only (`"type": "module"`)
- **Do NOT use `console.log` directly** — use the output utility functions
- **Do NOT add `any` types** — strict TypeScript from day one
- **Do NOT delete existing files** — add the `src/` directory alongside existing project files
- **Do NOT remove existing npm scripts** — add new ones alongside `test` and `test:ralph`

### Testing Approach

Unit tests via Vitest. Each stub command is testable by importing and calling its action function, checking exit code and output. The output utilities are pure functions, easily testable. CLI integration test uses Commander.js's `parseAsync` with test args.

Target: 100% coverage of all new code (src/).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Starter Template Selection, Code Organization, Implementation Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1, FR2, Developer Tool Specific Requirements]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/1-1-project-scaffold-cli-entry-point.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src module)
- [ ] Exec-plan created in `docs/exec-plans/active/1-1-project-scaffold-cli-entry-point.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
