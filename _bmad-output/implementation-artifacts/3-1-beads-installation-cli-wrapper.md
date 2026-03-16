# Story 3.1: Beads Installation & CLI Wrapper

Status: ready-for-dev

## Story

As a developer,
I want codeharness to install beads and provide a reliable programmatic interface to it,
So that all task management flows through a unified, git-native issue tracker.

## Acceptance Criteria

1. **Given** a developer runs `codeharness init`, **When** the beads installation step executes, **Then** beads is installed via `pip install beads` with fallback to `pipx install beads`, `bd init` is run if `.beads/` doesn't exist, and init prints `[OK] Beads: installed (v<version>)`.

2. **Given** beads is installed, **When** `src/lib/beads.ts` wraps `bd` commands, **Then** `createIssue(title, opts)` calls `bd create` with `--json` flag, `getReady()` calls `bd ready --json` and returns parsed issues, `closeIssue(id)` calls `bd close <id>`, `updateIssue(id, opts)` calls `bd update <id>` with provided options, and all `bd` calls use `--json` flag for programmatic consumption.

3. **Given** `bd ready --json` is called, **When** the response is returned, **Then** results arrive in under 1 second (NFR8).

4. **Given** a `bd` command fails, **When** the error is caught by beads.ts, **Then** the error is wrapped with context: `"Beads failed: <original error>. Command: bd <args>"`, and the wrapped error is thrown (never swallowed silently).

5. **Given** the project has existing beads git hooks in `.beads/hooks/`, **When** `codeharness init` runs, **Then** beads git hooks (prepare-commit-msg, post-checkout) are detected, Claude Code hooks (hooks.json) and git hooks are identified as separate systems with no conflict by default, and if both systems modify git hooks, CLI chains them in a harness-managed hooks directory. Init prints `[INFO] Beads hooks detected — coexistence configured` (NFR14).

6. **Given** the agent discovers a bug during development, **When** it runs `bd create "Bug description" --type bug --priority 1`, **Then** a beads issue is created with `discovered-from:<story-id>` link, and the issue appears in `bd ready` output when dependencies are met.

7. **Given** a hook detects a problem, **When** the hook script calls `bd create` with type=bug and priority=1, **Then** a beads issue is created for the detected problem, and the hook continues with its allow/block decision.

8. **Given** `codeharness init --json` is used, **When** beads initialization completes, **Then** JSON output includes beads status (`installed`, `already-installed`, `initialized`, `failed`) and version.

9. **Given** `codeharness init` is run a second time in the same project, **When** beads is already installed and `.beads/` already exists, **Then** installation is skipped, `bd init` is skipped, and `[OK] Beads: already installed (v<version>)` is printed.

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/beads.ts` — beads CLI wrapper module (AC: #2, #4)
  - [ ] 1.1: Define `BeadsCreateOpts` interface: `{ type?: string, priority?: number, description?: string, deps?: string[] }`
  - [ ] 1.2: Define `BeadsIssue` interface for parsed `bd` JSON output: `{ id: string, title: string, status: string, type: string, priority: number, description?: string }`
  - [ ] 1.3: Implement `bdCommand(args: string[]): unknown` — runs `bd <args> --json` via `execFileSync`, parses JSON output, wraps errors with context including the failed command
  - [ ] 1.4: Implement `createIssue(title: string, opts?: BeadsCreateOpts): BeadsIssue` — calls `bd create "<title>" --json` with optional `--type`, `--priority`, `--description` args
  - [ ] 1.5: Implement `getReady(): BeadsIssue[]` — calls `bd ready --json`, returns parsed array
  - [ ] 1.6: Implement `closeIssue(id: string): void` — calls `bd close <id>`
  - [ ] 1.7: Implement `updateIssue(id: string, opts: { status?: string, priority?: number }): void` — calls `bd update <id>` with provided options
  - [ ] 1.8: Implement `listIssues(): BeadsIssue[]` — calls `bd list --json`, returns parsed array
  - [ ] 1.9: Implement `isBeadsInitialized(dir?: string): boolean` — checks if `.beads/` directory exists
  - [ ] 1.10: Implement `initBeads(dir?: string): void` — runs `bd init` if `.beads/` doesn't exist
  - [ ] 1.11: Define `BeadsError` class extending `Error` — includes the failed command string and original error message in the wrapped message format: `"Beads failed: <original>. Command: bd <args>"`

- [ ] Task 2: Implement beads hook coexistence detection (AC: #5)
  - [ ] 2.1: Implement `detectBeadsHooks(dir?: string): { hasHooks: boolean, hookTypes: string[] }` — checks `.beads/hooks/` for `prepare-commit-msg`, `post-checkout`, etc.
  - [ ] 2.2: Implement `configureHookCoexistence(dir?: string): void` — if both beads git hooks and codeharness hooks exist, set up chaining in a harness-managed hooks directory
  - [ ] 2.3: Log `[INFO] Beads hooks detected — coexistence configured` when beads hooks are found during init

- [ ] Task 3: Integrate beads initialization into `codeharness init` (AC: #1, #5, #8, #9)
  - [ ] 3.1: Add beads init step to `src/commands/init.ts` AFTER dependency install step — call `initBeads()` if `.beads/` doesn't exist
  - [ ] 3.2: Call `detectBeadsHooks()` and `configureHookCoexistence()` after beads init
  - [ ] 3.3: Print `[OK] Beads: initialized (.beads/ created)` on first init, or `[INFO] Beads: .beads/ already exists` on re-run
  - [ ] 3.4: For JSON mode, include beads initialization result in `InitResult` type
  - [ ] 3.5: Handle `bd init` failure gracefully — print `[FAIL] Beads init failed: <error>` and halt (beads is critical)

- [ ] Task 4: Write unit tests for `src/lib/beads.ts` (AC: #2, #3, #4)
  - [ ] 4.1: Create `src/lib/__tests__/beads.test.ts`
  - [ ] 4.2: Mock `child_process.execFileSync` for all `bd` commands
  - [ ] 4.3: Test `createIssue()` — verify correct `bd create` args and `--json` flag
  - [ ] 4.4: Test `getReady()` — verify JSON parsing of `bd ready --json` output
  - [ ] 4.5: Test `closeIssue()` — verify correct `bd close` invocation
  - [ ] 4.6: Test `updateIssue()` — verify correct `bd update` args
  - [ ] 4.7: Test `listIssues()` — verify JSON parsing
  - [ ] 4.8: Test error wrapping — when `bd` command throws, verify `BeadsError` is thrown with context message format
  - [ ] 4.9: Test `isBeadsInitialized()` — true when `.beads/` exists, false otherwise
  - [ ] 4.10: Test `initBeads()` — runs `bd init` when `.beads/` missing, skips when exists
  - [ ] 4.11: Test `detectBeadsHooks()` — detects hooks in `.beads/hooks/`
  - [ ] 4.12: Verify 100% coverage of beads.ts (lines, branches, functions)

- [ ] Task 5: Write unit tests for beads init integration (AC: #1, #8, #9)
  - [ ] 5.1: Update `src/commands/__tests__/init.test.ts` — mock `beads.ts` module
  - [ ] 5.2: Test init runs `bd init` when `.beads/` doesn't exist
  - [ ] 5.3: Test init skips `bd init` when `.beads/` already exists
  - [ ] 5.4: Test init halts when `bd init` fails (beads is critical)
  - [ ] 5.5: Test init JSON output includes beads initialization result
  - [ ] 5.6: Test beads hook coexistence detection and messaging

- [ ] Task 6: Address Epic 2 retro action items carried to Epic 3 (Epic 2 retro A3, A4)
  - [ ] 6.1: Cover the error handler path in `index.ts` (lines 38-39) — create test that exercises the CLI entry point error path (Epic 2 retro A3, carried from Epic 1)
  - [ ] 6.2: Improve branch coverage in deps.ts, docker.ts, otlp.ts, state.ts — target 95%+ branch coverage (Epic 2 retro A4)

- [ ] Task 7: Build and verify (AC: #3, #8)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully with beads.ts
  - [ ] 7.2: Run `npm run test:unit` — all tests pass including new beads tests
  - [ ] 7.3: Run `npm run test:coverage` — verify 100% coverage for beads.ts, 95%+ branches overall
  - [ ] 7.4: Manual test: `codeharness init` in a sample project — verify beads install and `bd init` output
  - [ ] 7.5: Manual test: `codeharness init --json` — verify beads result in JSON output
  - [ ] 7.6: Manual test: re-run `codeharness init` — verify idempotent beads behavior

## Dev Notes

### This Story Creates the Beads CLI Wrapper and Extends Init

Story 2.1 already handles beads *installation* via `deps.ts` (pip install beads with pipx fallback, critical dependency). This story extends that by: (a) running `bd init` to create the `.beads/` directory, (b) creating `src/lib/beads.ts` as the programmatic interface all future stories use to interact with beads, and (c) detecting and handling beads git hook coexistence.

### What Already Exists (from Epics 1-2)

- `src/lib/deps.ts` — Beads is already in the `DEPENDENCY_REGISTRY` as a critical dependency with `pip install beads` / `pipx install beads` fallback chain and `bd --version` check. The install step runs during `codeharness init`. **Do NOT duplicate or move the beads install logic.**
- `src/commands/init.ts` — 398 lines. Orchestrates stack detection, Docker check, dependency install, state creation, docs scaffold, OTLP instrumentation, Docker stack. Beads init step goes AFTER dependency install (which installs `bd`), BEFORE state file creation.
- `src/lib/state.ts` — Full state management with `HarnessState` interface, nested value access, value parsing.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` utilities.
- `src/index.ts` — CLI entry point, all 8 commands registered.
- 270 unit tests passing, 98.22% statement coverage, 91.3% branch coverage.

### Architecture Decisions That Apply

- **Decision 1 (CLI <-> Plugin Boundary):** The beads wrapper is CLI-only. The plugin never calls `bd` directly — it calls CLI commands which use the wrapper.
- **Decision 2 (State Management):** Beads has its own state in `.beads/`. Do NOT duplicate beads state into `.claude/codeharness.local.md`. The CLI reads beads via `bd` commands when needed.
- **Decision 3 (Beads Integration):** Beads is the unified task store. CLI wraps `bd` commands. Two-layer model: beads = status/ordering, story files = content. This story builds the wrapper; Story 3.3 (bridge) and 3.4 (sync) use it.

### Beads CLI Interface

The `bd` command is the beads CLI. Key commands this wrapper needs:

| Command | Purpose | JSON Output |
|---------|---------|-------------|
| `bd init` | Initialize `.beads/` in project | N/A |
| `bd create "<title>" --json` | Create a new issue | `{ "id": "...", "title": "...", ... }` |
| `bd ready --json` | List next unblocked tasks | `[{ "id": "...", ... }, ...]` |
| `bd close <id>` | Close an issue | N/A |
| `bd update <id> --status <s>` | Update issue status | N/A |
| `bd list --json` | List all issues | `[{ "id": "...", ... }, ...]` |
| `bd --version` | Version check | String |

All programmatic calls MUST use `--json` flag (Architecture Beads Interaction Pattern). Error messages MUST include the failed command for debuggability.

### Hook Coexistence

Beads installs git hooks (`prepare-commit-msg`, `post-checkout`) in `.beads/hooks/`. Codeharness uses Claude Code hooks (`hooks.json`) which are a separate system entirely — they're not git hooks, they're Claude Code plugin hooks. So by default there is no conflict.

The only potential conflict is if both beads and the user have custom git hooks. In that case, the CLI should detect both and set up a chaining mechanism. For this story, detection and logging is the priority — the chaining mechanism itself is a stretch goal.

### Init Command Growth

Init.ts is at 398 lines (Epic 2). This story adds ~30-40 lines (beads init step + hook detection). Following Epic 2 retro lesson L1, keep init.ts as an orchestrator calling into beads.ts functions. Do NOT inline beads logic into init.ts.

### Epic 2 Retro Actions to Address

- **A3:** Cover the error handler path in index.ts (lines 38-39). Two epics overdue.
- **A4:** Improve branch coverage in deps.ts, docker.ts, otlp.ts, state.ts. Target 95%+ branches.
- **A5:** Update architecture spec to reflect actual plugin artifact locations (hooks/, knowledge/, skills/ at repo root). This is an architect action — note it but don't implement in this story.

### What NOT To Do

- **Do NOT move beads installation from deps.ts** — the install step already works there. This story adds `bd init` and the wrapper, not the install.
- **Do NOT create the bridge command** — that's Story 3.3.
- **Do NOT implement beads-to-story sync** — that's Story 3.4.
- **Do NOT install or patch BMAD** — that's Story 3.2.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT store beads state in the harness state file** — beads has its own `.beads/` state.

### Scope Boundaries

**IN SCOPE (this story):**
- `src/lib/beads.ts` — beads CLI wrapper: create, ready, close, update, list, init, error handling
- `src/lib/beads.ts` — hook coexistence detection
- Extending `init.ts` to call `initBeads()` and `detectBeadsHooks()` after dependency install
- Unit tests for all new code
- Epic 2 retro actions A3 (index.ts coverage) and A4 (branch coverage improvements)

**OUT OF SCOPE (later stories):**
- BMAD installation and workflow patching — Story 3.2
- BMAD story parsing and bridge command — Story 3.3
- Beads-to-story bidirectional sync — Story 3.4
- Verification pipeline — Epic 4
- Ralph integration — Epic 5

### Dependencies

- **Depends on:** Story 2.1 (beads installation via deps.ts) — DONE
- **Depended on by:** Story 3.2 (BMAD patching may need beads), Story 3.3 (bridge uses createIssue), Story 3.4 (sync uses the full wrapper API)

### New npm Dependencies

None. The `bd` CLI is invoked as a subprocess via `child_process.execFileSync`. No npm packages are imported.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 1 (CLI<->Plugin), Decision 2 (State Management), Decision 3 (Beads Integration), Beads Interaction Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR32, FR34, FR36, FR39, NFR8, NFR14]
- [Source: _bmad-output/implementation-artifacts/epic-2-retrospective.md — Actions A3, A4, A5]
- [Source: src/lib/deps.ts — Existing beads DependencySpec in DEPENDENCY_REGISTRY]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-1-beads-installation-cli-wrapper.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib module — beads.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/3-1-beads-installation-cli-wrapper.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
