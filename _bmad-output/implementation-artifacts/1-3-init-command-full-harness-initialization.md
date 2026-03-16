# Story 1.3: Init Command — Full Harness Initialization

Status: ready-for-dev

## Story

As a developer,
I want to run `codeharness init` in my project directory,
So that the harness is configured with stack detection, enforcement levels, state file, and documentation scaffold — ready for development.

## Acceptance Criteria

1. **Given** a developer runs `codeharness init` in a Node.js project, **When** init completes, **Then** stack is detected as `"nodejs"` and printed as `[INFO] Stack detected: Node.js (package.json)`, enforcement levels default to max-enforcement (all ON), and the state file `.claude/codeharness.local.md` is created with the canonical structure from Architecture Decision 2.

2. **Given** a developer runs `codeharness init --no-observability`, **When** init processes enforcement flags, **Then** Docker availability is NOT checked (FR9), and the state file records `observability: false`. Other enforcement flags (`--no-frontend`, `--no-database`, `--no-api`) similarly disable their respective enforcement levels.

3. **Given** a developer runs `codeharness init` with observability ON (default), **When** Docker availability is checked, **Then** if Docker is not installed, init prints `[FAIL] Docker not installed.` with actionable remedy (`Install: https://docs.docker.com/engine/install/` and `Or disable: codeharness init --no-observability`) and exits 1.

4. **Given** init creates the state file, **When** the file is written, **Then** it contains: `harness_version` matching package.json version, `initialized: true`, detected `stack`, `enforcement` block reflecting the flags, `coverage` block with `target: 100` and `tool: "c8"` for Node.js / `"coverage.py"` for Python, `session_flags` block (all false), and empty `verification_log` array.

5. **Given** init runs in a project with no `AGENTS.md`, **When** the documentation scaffold step executes, **Then** root `AGENTS.md` is generated with project structure, build/test commands, and conventions (not exceeding 100 lines, NFR24). `docs/` directory is created with `index.md`, `exec-plans/active/`, `exec-plans/completed/`, `quality/`, and `generated/` subdirectories. `docs/index.md` references artifacts by relative path, never copies content (NFR25). Files in `docs/generated/` and `docs/quality/` include a `<!-- DO NOT EDIT MANUALLY -->` header (NFR26).

6. **Given** a developer runs `codeharness init` a second time in the same project, **When** init detects existing state file and documentation, **Then** existing configuration is preserved (not overwritten), existing `AGENTS.md` and `docs/` are not regenerated, init prints `[INFO] Harness already initialized — verifying configuration`, and init completes successfully (NFR22, FR10).

7. **Given** a developer runs `codeharness init --json`, **When** init completes, **Then** output is valid JSON with `status`, `stack`, `enforcement`, and `documentation` fields.

8. **Given** any init execution, **When** measured from start to completion, **Then** init completes within 5 minutes (NFR5).

## Tasks / Subtasks

- [ ] Task 1: Replace init stub with real command structure (AC: #1, #2, #7)
  - [ ] 1.1: Update `src/commands/init.ts` — replace stub action with real init logic
  - [ ] 1.2: Add CLI options: `--no-observability`, `--no-frontend`, `--no-database`, `--no-api` using Commander.js `.option()` with default `true` (negation flags)
  - [ ] 1.3: Import and use `detectStack()` from `src/lib/stack-detect.ts`
  - [ ] 1.4: Import and use `writeState()`, `readState()`, `getDefaultState()` from `src/lib/state.ts`
  - [ ] 1.5: Import and use `generateFile()` from `src/lib/templates.ts`

- [ ] Task 2: Implement init flow — stack detection and enforcement (AC: #1, #2, #4)
  - [ ] 2.1: Call `detectStack()` — print `[INFO] Stack detected: Node.js (package.json)` or `[INFO] Stack detected: Python (<indicator>)` or `[WARN] No recognized stack detected`
  - [ ] 2.2: Read enforcement flags from Commander.js options — default all `true`, `--no-observability` sets `false`, etc.
  - [ ] 2.3: Build enforcement config object: `{ frontend, database, api, observability }` from flags
  - [ ] 2.4: Set coverage tool based on stack: `"c8"` for nodejs, `"coverage.py"` for python, `"c8"` as fallback for unknown

- [ ] Task 3: Implement Docker check (AC: #3)
  - [ ] 3.1: If `enforcement.observability` is `true`, check Docker availability by running `docker --version` via `child_process.execSync` (wrapped in try/catch)
  - [ ] 3.2: If Docker is not installed, print `[FAIL] Docker not installed.` followed by `Docker is required for the observability stack.`, `→ Install: https://docs.docker.com/engine/install/`, `→ Or disable: codeharness init --no-observability` and exit with code 1
  - [ ] 3.3: If Docker IS installed, print `[OK] Docker: available`
  - [ ] 3.4: If `enforcement.observability` is `false`, skip Docker check entirely — no output about Docker

- [ ] Task 4: Implement state file creation (AC: #4)
  - [ ] 4.1: Build `HarnessState` from detected stack, enforcement config, and version from package.json
  - [ ] 4.2: Set `initialized: true`
  - [ ] 4.3: Call `writeState()` to create `.claude/codeharness.local.md`
  - [ ] 4.4: Print `[OK] State file: .claude/codeharness.local.md created`

- [ ] Task 5: Implement documentation scaffold (AC: #5)
  - [ ] 5.1: Check if `AGENTS.md` exists — if not, generate it using a template function
  - [ ] 5.2: Create `generateAgentsMd()` function (in init.ts or a separate template module) — generates AGENTS.md with: project name, stack info, build/test commands, directory structure overview, conventions. Must be under 100 lines (NFR24)
  - [ ] 5.3: Check if `docs/` exists — if not, create the scaffold:
    - `docs/index.md` — references BMAD artifacts by relative path (NFR25)
    - `docs/exec-plans/active/` — empty directory (with `.gitkeep`)
    - `docs/exec-plans/completed/` — empty directory (with `.gitkeep`)
    - `docs/quality/` — empty directory with placeholder `<!-- DO NOT EDIT MANUALLY -->` header file
    - `docs/generated/` — empty directory with placeholder `<!-- DO NOT EDIT MANUALLY -->` header file
  - [ ] 5.4: Print `[OK] Documentation: AGENTS.md + docs/ scaffold created`
  - [ ] 5.5: Use `generateFile()` from `src/lib/templates.ts` for all file writes

- [ ] Task 6: Implement idempotent re-run (AC: #6)
  - [ ] 6.1: At the start of init, check if `.claude/codeharness.local.md` exists AND has `initialized: true`
  - [ ] 6.2: If already initialized: print `[INFO] Harness already initialized — verifying configuration`, read existing state, verify key fields are present, print `[OK] Configuration verified`, exit 0
  - [ ] 6.3: If already initialized but state is corrupted: the existing `readState()` corruption recovery handles this — state is rebuilt, init can proceed
  - [ ] 6.4: Do NOT overwrite `AGENTS.md` or `docs/` if they already exist

- [ ] Task 7: Implement JSON output mode (AC: #7)
  - [ ] 7.1: Check `opts.json` flag from Commander.js global options
  - [ ] 7.2: If `--json`, suppress all `[INFO]`/`[OK]`/`[FAIL]` output and produce a single JSON object at the end:
    ```json
    {
      "status": "ok",
      "stack": "nodejs",
      "enforcement": { "frontend": true, "database": true, "api": true, "observability": true },
      "documentation": { "agents_md": "created", "docs_scaffold": "created" }
    }
    ```
  - [ ] 7.3: On failure, JSON output includes `"status": "fail"` and `"error"` field

- [ ] Task 8: Implement enforcement summary line (AC: #1)
  - [ ] 8.1: After all setup steps, print enforcement summary: `[OK] Enforcement: frontend:ON database:ON api:ON observability:ON`
  - [ ] 8.2: Print final message: `Harness initialized. Run: codeharness bridge --epics <path>`

- [ ] Task 9: Write unit tests (AC: #1-#8)
  - [ ] 9.1: Create `src/commands/__tests__/init.test.ts`
  - [ ] 9.2: Test stack detection output for Node.js project
  - [ ] 9.3: Test stack detection output for Python project
  - [ ] 9.4: Test enforcement flags: default all ON, `--no-observability` sets observability OFF
  - [ ] 9.5: Test Docker check skipped when observability OFF
  - [ ] 9.6: Test Docker check fails gracefully when Docker not installed (observability ON)
  - [ ] 9.7: Test state file creation with correct structure
  - [ ] 9.8: Test AGENTS.md generation (content under 100 lines)
  - [ ] 9.9: Test docs/ scaffold creation with correct directory structure
  - [ ] 9.10: Test idempotent re-run preserves existing state and docs
  - [ ] 9.11: Test JSON output mode produces valid JSON with required fields
  - [ ] 9.12: Test coverage tool selection: c8 for nodejs, coverage.py for python
  - [ ] 9.13: Verify 100% coverage of init.ts

- [ ] Task 10: Build and verify (AC: #8)
  - [ ] 10.1: Run `npm run build` — verify tsup compiles successfully
  - [ ] 10.2: Run `npm run test:unit` — all tests pass
  - [ ] 10.3: Manual test: `codeharness init` in a sample Node.js project
  - [ ] 10.4: Manual test: `codeharness init --no-observability` skips Docker check
  - [ ] 10.5: Manual test: `codeharness init` re-run shows idempotent behavior
  - [ ] 10.6: Manual test: `codeharness init --json` produces valid JSON

## Dev Notes

### This Story Brings the Init Command to Life

Stories 1.1 and 1.2 built the foundation: CLI scaffold with Commander.js, output utilities (`[OK]`/`[FAIL]`/`[WARN]`/`[INFO]`), and core libraries (state.ts, stack-detect.ts, templates.ts). This story replaces the init stub with the real command that orchestrates all these pieces.

### What Already Exists (from Stories 1.1 and 1.2)

- `src/index.ts` — CLI entry point with Commander.js, all commands registered
- `src/commands/init.ts` — **Currently a stub** that prints `[FAIL] Not yet implemented. Coming in Epic 1.` and exits 1. Replace this entirely.
- `src/commands/state.ts` — Real `state get/set/show` subcommands (implemented in 1.2)
- `src/lib/state.ts` — Full implementation: `HarnessState` interface, `readState()`, `writeState()`, `readStateWithBody()`, `getDefaultState()`, `getStatePath()`, `getNestedValue()`, `setNestedValue()`, `parseValue()`, `StateFileNotFoundError`, corruption recovery
- `src/lib/stack-detect.ts` — `detectStack()` checking for package.json / requirements.txt / pyproject.toml / setup.py
- `src/lib/templates.ts` — `generateFile()` and `renderTemplate()`
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` with `OutputOptions` interface
- `package.json` — ESM, Commander.js + yaml deps, tsup/vitest dev deps, version `0.1.0`

### Architecture Decisions That Apply

- **Decision 1 (CLI ↔ Plugin Boundary):** Init is CLI-only. Does NOT create plugin files (that comes later). Does NOT install dependencies (that's Story 2.1 in Epic 2).
- **Decision 2 (State Management):** State file created by init at `.claude/codeharness.local.md`. Canonical YAML structure. `initialized: true` after successful init.
- **Decision 5 (Docker Lifecycle):** Docker check conditional on `enforcement.observability`. Docker not installed + observability OFF → silently skip. Docker not installed + observability ON → fail with actionable error.
- **Decision 6 (Template Embedding):** Templates are TypeScript string literals. AGENTS.md and docs/index.md content generated from functions, not copied from files.

### Scope Boundaries — What Init Does and Does NOT Do in This Story

**IN SCOPE (this story):**
- Stack detection and reporting
- Enforcement flag parsing from CLI options
- Docker availability check (when observability ON)
- State file creation with correct structure
- AGENTS.md generation
- docs/ scaffold creation
- Idempotent re-run behavior
- JSON output mode

**OUT OF SCOPE (later stories/epics):**
- Dependency auto-install (Showboat, agent-browser, beads, OTLP) — Epic 2, Story 2.1
- Docker Compose generation and stack startup — Epic 2, Story 2.2
- BMAD installation and patching — Epic 3, Story 3.2
- Plugin scaffold installation — later Epic
- Beads installation — Epic 3, Story 3.1
- OTLP instrumentation — Epic 2, Story 2.1

The init command in this story does the minimum viable initialization: detect stack, set enforcement, check Docker availability (not start it), create state, create docs scaffold. Future stories will extend init or add post-init steps.

### Enforcement Flags Pattern

Commander.js negation flags:

```typescript
program.command('init')
  .description('Initialize the harness in a project')
  .option('--no-observability', 'Disable observability enforcement')
  .option('--no-frontend', 'Disable frontend enforcement')
  .option('--no-database', 'Disable database enforcement')
  .option('--no-api', 'Disable API enforcement')
  .action(async (options, cmd) => {
    // options.observability defaults to true
    // --no-observability sets it to false
    const globalOpts = cmd.optsWithGlobals();
    // globalOpts.json is the --json flag
  });
```

Note: Commander.js automatically handles `--no-X` flags — when you define `--no-observability`, the option `observability` defaults to `true` and is set to `false` when the flag is provided.

### Docker Check Pattern

```typescript
import { execSync } from 'node:child_process';

function isDockerAvailable(): boolean {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
```

### AGENTS.md Template

Generate from a function, not a static file. Content must be under 100 lines (NFR24). Include:
- Project name and description
- Stack information
- Build and test commands (from package.json scripts or equivalent)
- Directory structure overview (top-level only)
- Key conventions

Use `generateFile()` from templates.ts to write.

### docs/index.md Template

Must reference artifacts by relative path (NFR25), never copy content:

```markdown
# Project Documentation

## Planning Artifacts
- [Product Requirements](../_bmad-output/planning-artifacts/prd.md)
- [Architecture](../_bmad-output/planning-artifacts/architecture.md)
- [Epics & Stories](../_bmad-output/planning-artifacts/epics.md)

## Execution
- [Active Exec Plans](exec-plans/active/)
- [Completed Exec Plans](exec-plans/completed/)

## Quality
- [Quality Reports](quality/)
- [Generated Reports](generated/)
```

### Testing Approach

Use temp directories for filesystem isolation (same pattern as Story 1.2 tests):

```typescript
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir: string;
beforeEach(() => { testDir = mkdtempSync(join(tmpdir(), 'ch-init-test-')); });
afterEach(() => { rmSync(testDir, { recursive: true, force: true }); });
```

Mock `child_process.execSync` for Docker checks. Mock `process.cwd()` to point to temp directory. Test both happy path and error paths.

### What NOT To Do

- **Do NOT implement dependency installation** — no `pip install showboat`, no `npm install agent-browser`. That's Epic 2.
- **Do NOT generate Docker Compose files** — that's Epic 2, Story 2.2.
- **Do NOT install or patch BMAD** — that's Epic 3.
- **Do NOT create plugin scaffold files** — later story.
- **Do NOT use interactive prompts** (no `inquirer`, no `readline`) — enforcement is controlled via CLI flags, not interactive prompts. The UX spec shows flags, not prompts.
- **Do NOT use `console.log` directly** — use output utility functions from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT read version from hardcoded string** — read from package.json (pattern already established in `src/index.ts` via `createRequire`).

### Dependencies

- **Depends on:** Story 1.1 (project scaffold, CLI entry point, output utilities) — DONE
- **Depends on:** Story 1.2 (state.ts, stack-detect.ts, templates.ts) — DONE
- **Depended on by:** Story 2.1 (dependency auto-install extends init), Story 2.2 (Docker Compose extends init), Story 3.2 (BMAD patching extends init)

### New Dependencies

No new npm dependencies required. All needed libraries are already installed:
- `commander` — CLI framework (Story 1.1)
- `yaml` — YAML parsing (Story 1.2)
- `node:child_process` — Docker check (Node.js built-in)
- `node:fs` — File operations (Node.js built-in)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 1 (CLI↔Plugin), Decision 2 (State Management), Decision 5 (Docker Lifecycle), Decision 6 (Template Embedding)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR2, FR3, FR6, FR7, FR9, FR10, FR56, FR57]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Init Output Example, Error Output Example]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/1-3-init-command-full-harness-initialization.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/commands module)
- [ ] Exec-plan created in `docs/exec-plans/active/1-3-init-command-full-harness-initialization.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
