# Story 2.1: Dependency Auto-Install & OTLP Instrumentation

Status: ready-for-dev

## Story

As a developer,
I want `codeharness init` to automatically install all external dependencies with correct commands,
So that I don't have to manually install Showboat, agent-browser, beads, or OTLP packages.

## Acceptance Criteria

1. **Given** a developer runs `codeharness init` in a Node.js project with observability ON, **When** the dependency install step executes, **Then** Showboat is installed via `pip install showboat` with fallback to `pipx install showboat`, agent-browser is installed via `npm install -g @anthropic/agent-browser`, beads is installed via `pip install beads` with fallback to `pipx install beads`, and each successful install prints `[OK] <tool>: installed (v<version>)`.

2. **Given** a Node.js project with observability ON, **When** OTLP instrumentation is configured, **Then** `@opentelemetry/auto-instrumentations-node` is installed as a project dependency, the start script in `package.json` is updated with `--require @opentelemetry/auto-instrumentations-node/register`, OTLP environment variables are set pointing to local OTel Collector (`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`), and instrumentation adds <5% latency overhead (NFR6).

3. **Given** a Python project with observability ON, **When** OTLP instrumentation is configured, **Then** `opentelemetry-distro` and `opentelemetry-exporter-otlp` are installed via pip, the run command is documented as wrappable with `opentelemetry-instrument`, and OTLP environment variables are configured.

4. **Given** a dependency install fails (tool not found, network error), **When** the primary install command fails, **Then** the fallback chain is attempted, and if all fallbacks fail, `[FAIL] <tool>: install failed` is printed with actionable remedy, and init continues for non-critical dependencies (Showboat, agent-browser) but halts for critical ones (beads).

5. **Given** a developer runs `codeharness init` with `--no-observability`, **When** the dependency install step executes, **Then** OTLP packages are NOT installed, but agent-browser and Showboat are still installed (used for verification, not observability).

6. **Given** `codeharness init --json` is used, **When** dependency install completes, **Then** JSON output includes a `dependencies` object with each tool's install status (`installed`, `skipped`, `failed`) and version when available.

7. **Given** `codeharness init` is run a second time in the same project, **When** dependency install step executes, **Then** already-installed dependencies are detected (via `which` or version check), installation is skipped, and `[OK] <tool>: already installed (v<version>)` is printed.

8. **Given** any init execution with dependency install, **When** measured from start to completion, **Then** the full init completes within 5 minutes (NFR5).

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/deps.ts` — dependency auto-install module (AC: #1, #4, #5, #7)
  - [ ] 1.1: Define `DependencySpec` interface: `{ name, displayName, installCommands: { cmd, args }[], checkCommand, critical, requiresObservability }`
  - [ ] 1.2: Define dependency registry — array of `DependencySpec` for: Showboat, agent-browser, beads. Each with primary + fallback install commands
  - [ ] 1.3: Implement `checkInstalled(spec): { installed: boolean, version: string | null }` — runs `<tool> --version` via `execSync`, parses version from output
  - [ ] 1.4: Implement `installDependency(spec): { status: 'installed' | 'already-installed' | 'failed', version: string | null, error?: string }` — tries primary command, falls through fallback chain, returns result
  - [ ] 1.5: Implement `installAllDependencies(opts: { observability: boolean }): DependencyResult[]` — iterates registry, skips OTLP when observability OFF, returns array of results
  - [ ] 1.6: Handle critical vs non-critical: if a critical dep (beads) fails, throw/return error status. Non-critical failures log `[FAIL]` but continue

- [ ] Task 2: Define install commands and fallback chains (AC: #1)
  - [ ] 2.1: Showboat: primary `pip install showboat`, fallback `pipx install showboat`
  - [ ] 2.2: agent-browser: primary `npm install -g @anthropic/agent-browser`
  - [ ] 2.3: beads: primary `pip install beads`, fallback `pipx install beads` (critical)
  - [ ] 2.4: Version check commands: `showboat --version`, `agent-browser --version` (or `npx agent-browser --version`), `bd --version`

- [ ] Task 3: Create OTLP instrumentation module — `src/lib/otlp.ts` (AC: #2, #3, #5)
  - [ ] 3.1: Implement `installNodeOtlp(projectDir): OtlpResult` — runs `npm install @opentelemetry/auto-instrumentations-node @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http` in the project directory
  - [ ] 3.2: Implement `patchNodeStartScript(projectDir): boolean` — reads `package.json`, finds `scripts.start` (or `scripts.dev`), prepends `NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register'` if not already present. Returns true if patched, false if already patched or no start script
  - [ ] 3.3: Implement `installPythonOtlp(projectDir): OtlpResult` — runs `pip install opentelemetry-distro opentelemetry-exporter-otlp` or fallback `pipx install opentelemetry-distro`
  - [ ] 3.4: Implement `configureOtlpEnvVars(projectDir, stack): void` — writes OTLP env vars to state file: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, `OTEL_SERVICE_NAME=<project-name>`, `OTEL_TRACES_EXPORTER=otlp`, `OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp`
  - [ ] 3.5: Implement `instrumentProject(projectDir, stack): OtlpResult` — orchestrator that calls the correct stack-specific function and configures env vars

- [ ] Task 4: Integrate dependency install into `init` command (AC: #1, #5, #6, #7)
  - [ ] 4.1: Import `installAllDependencies` from `deps.ts` and `instrumentProject` from `otlp.ts` into `src/commands/init.ts`
  - [ ] 4.2: Add dependency install step AFTER Docker check but BEFORE state file creation — so that if a critical dep fails, init halts before writing state
  - [ ] 4.3: Add OTLP instrumentation step AFTER state file creation — only when `enforcement.observability` is true
  - [ ] 4.4: Print per-dependency status using output utilities: `[OK] Showboat: installed (v0.6.1)` or `[FAIL] Showboat: install failed. Try: pip install showboat`
  - [ ] 4.5: For JSON mode, accumulate dependency results into the `InitResult` type and include in JSON output
  - [ ] 4.6: Consider Epic 1 retro action A5: if init is getting large, split into orchestrator + step functions for testability

- [ ] Task 5: Store OTLP configuration in state file (AC: #2, #3)
  - [ ] 5.1: Extend `HarnessState` interface in `state.ts` with `otlp` section: `{ enabled: boolean, endpoint: string, service_name: string, node_require?: string, python_wrapper?: string }`
  - [ ] 5.2: Update `getDefaultState()` to include `otlp` section with defaults
  - [ ] 5.3: Update `isValidState()` to validate the new `otlp` field (backward-compatible — treat missing field as valid for pre-2.1 state files)
  - [ ] 5.4: Write OTLP config to state file during init when observability is ON

- [ ] Task 6: Write unit tests for `deps.ts` (AC: #1, #4, #7)
  - [ ] 6.1: Create `src/lib/__tests__/deps.test.ts`
  - [ ] 6.2: Mock `child_process.execSync` for all external commands
  - [ ] 6.3: Test successful install of each dependency (primary command succeeds)
  - [ ] 6.4: Test fallback chain (primary fails, fallback succeeds)
  - [ ] 6.5: Test all fallbacks fail — non-critical dep returns failed status, critical dep throws
  - [ ] 6.6: Test already-installed detection (version check succeeds → skip install)
  - [ ] 6.7: Test observability OFF → OTLP deps skipped
  - [ ] 6.8: Verify 100% coverage of deps.ts

- [ ] Task 7: Write unit tests for `otlp.ts` (AC: #2, #3)
  - [ ] 7.1: Create `src/lib/__tests__/otlp.test.ts`
  - [ ] 7.2: Test Node.js OTLP package installation (mock execSync)
  - [ ] 7.3: Test Node.js start script patching — verify `--require` is added correctly to package.json
  - [ ] 7.4: Test Node.js start script already patched → idempotent, no double-patching
  - [ ] 7.5: Test Node.js no start script → skip patching, log info
  - [ ] 7.6: Test Python OTLP installation
  - [ ] 7.7: Test OTLP env var configuration written to state file
  - [ ] 7.8: Test `instrumentProject` orchestrator routes correctly per stack
  - [ ] 7.9: Verify 100% coverage of otlp.ts

- [ ] Task 8: Update init command tests (AC: #6, #7, #8)
  - [ ] 8.1: Update `src/commands/__tests__/init.test.ts` — mock `deps.ts` and `otlp.ts` modules
  - [ ] 8.2: Test init with dependencies: verify install step runs, status printed
  - [ ] 8.3: Test init with --no-observability: verify OTLP skipped
  - [ ] 8.4: Test init JSON output includes dependency results
  - [ ] 8.5: Test init halts when critical dependency (beads) fails
  - [ ] 8.6: Test init continues when non-critical dependency (Showboat) fails
  - [ ] 8.7: Cover the uncovered branches in init.ts flagged in Epic 1 retro (action A4)

- [ ] Task 9: Build and verify (AC: #8)
  - [ ] 9.1: Run `npm run build` — verify tsup compiles successfully with new modules
  - [ ] 9.2: Run `npm run test:unit` — all tests pass including new tests
  - [ ] 9.3: Run `npm run test:coverage` — verify 100% coverage for new files
  - [ ] 9.4: Manual test: `codeharness init` in a sample Node.js project — verify dependency install output
  - [ ] 9.5: Manual test: `codeharness init --no-observability` — verify OTLP skipped
  - [ ] 9.6: Manual test: `codeharness init --json` — verify dependency results in JSON

## Dev Notes

### This Story Adds Dependency Management to Init

Story 1.3 implemented init with stack detection, enforcement config, Docker check, state file, and documentation scaffold. This story extends init to auto-install external dependencies and configure OTLP instrumentation. The init command grows from "detect and configure" to "detect, install, instrument, and configure."

### What Already Exists (from Epic 1)

- `src/commands/init.ts` — Working init command with stack detection, enforcement flags, Docker check, state file creation, documentation scaffold, idempotent re-run, JSON output (275 lines)
- `src/lib/state.ts` — Full state management: `HarnessState` interface, read/write/recovery, nested value access, value parsing (210 lines)
- `src/lib/stack-detect.ts` — `detectStack()` for Node.js and Python (12 lines)
- `src/lib/docker.ts` — `isDockerAvailable()` via `docker --version` (10 lines)
- `src/lib/templates.ts` — `generateFile()` and `renderTemplate()` (11 lines)
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` (39 lines)
- `src/index.ts` — CLI entry point, all 8 commands registered (40 lines)
- `package.json` — ESM, Commander.js + yaml deps, version 0.1.0

### Architecture Decisions That Apply

- **Decision 1 (CLI ↔ Plugin Boundary):** Dependency installation is CLI-only. The CLI runs `pip install`, `npm install`, etc. The plugin never installs anything.
- **Decision 2 (State Management):** OTLP config stored in `.claude/codeharness.local.md` YAML frontmatter. Extends the existing `HarnessState` interface.
- **Decision 6 (Template Embedding):** No external template files for OTLP config. Configuration values are TypeScript constants embedded in `otlp.ts`.

### Dependency Install Strategy

The PRD (v1 audit, gap #5) explicitly calls out that `uvx install showboat` is wrong — `uvx` has no `install` subcommand. Correct commands:

| Tool | Primary | Fallback | Check | Critical |
|------|---------|----------|-------|----------|
| Showboat | `pip install showboat` | `pipx install showboat` | `showboat --version` | No |
| agent-browser | `npm install -g @anthropic/agent-browser` | — | `agent-browser --version` | No |
| beads | `pip install beads` | `pipx install beads` | `bd --version` | Yes |

Critical means init halts if install fails. Non-critical failures log a warning and continue.

### OTLP Instrumentation Strategy

**Node.js:** Zero-code-change instrumentation via `--require` flag. Install the auto-instrumentation package as a project dependency, then modify the start script:

```json
{
  "scripts": {
    "start": "node dist/server.js",
    "start:instrumented": "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node dist/server.js"
  }
}
```

The `--require` flag loads the instrumentation before the application code, automatically instrumenting HTTP, Express, database drivers, etc.

**Python:** Use `opentelemetry-instrument` wrapper:

```bash
# Before
python app.py

# After
opentelemetry-instrument python app.py
```

### OTLP Environment Variables

These env vars tell the OTel SDK where to send telemetry:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=<project-name>
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
```

Port 4318 is the OTel Collector HTTP receiver (will be configured in Story 2.2 Docker Compose). Store these in the state file so hooks and the plugin can reference them.

### Init Command Growth — Follow Retro Action A5

Epic 1 retro flagged that init.ts (275 lines) may need splitting as it grows. This story adds ~50-80 lines to init.ts (dependency install step + OTLP step). Consider extracting init steps into separate functions or a step-runner pattern:

```typescript
// Possible pattern (guidance, not prescription):
const steps = [
  detectStackStep,
  checkDockerStep,
  installDependenciesStep,  // NEW
  createStateStep,
  instrumentOtlpStep,       // NEW
  scaffoldDocsStep,
];
```

This is guidance — the developer should judge whether the code is readable without refactoring.

### Epic 1 Retro Actions Addressed

- **A4:** Cover the uncovered branches in `init.ts` (lines 161, 254) and `index.ts` (lines 38-39). Include these in Task 8 test updates.
- **A5:** Consider splitting init into orchestrator + step functions. Addressed in dev notes above.

### Testing Approach

Mock `child_process.execSync` for all external commands. Use the same temp-directory pattern from existing tests:

```typescript
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));
```

For `otlp.ts` tests that modify `package.json`, create a real `package.json` in the temp directory and verify the file is modified correctly.

### What NOT To Do

- **Do NOT actually run `pip install` or `npm install -g` in tests** — mock all subprocess calls.
- **Do NOT install Docker Compose or start Docker** — that's Story 2.2.
- **Do NOT install or configure beads beyond the install step** — beads initialization (`bd init`) and the CLI wrapper (`src/lib/beads.ts`) are Story 3.1.
- **Do NOT create the OTel Collector config file** — that's Story 2.2 (Docker Compose template includes OTel config).
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT hardcode version strings** — use the version check command output.

### Scope Boundaries

**IN SCOPE (this story):**
- `src/lib/deps.ts` — dependency registry, install logic, fallback chains, version detection
- `src/lib/otlp.ts` — OTLP package install, start script patching, env var configuration
- Extending `init.ts` to call dependency install and OTLP instrumentation
- Extending `HarnessState` with `otlp` section
- Unit tests for all new code
- Covering Epic 1 retro uncovered branches (action A4)

**OUT OF SCOPE (later stories):**
- Docker Compose generation and stack startup — Story 2.2
- OTel Collector configuration file — Story 2.2
- Observability querying (LogQL, PromQL) — Story 2.3
- Beads initialization and CLI wrapper (`bd init`, `src/lib/beads.ts`) — Story 3.1
- BMAD installation and patching — Story 3.2

### Dependencies

- **Depends on:** Story 1.3 (init command, state management, stack detection) — DONE
- **Depended on by:** Story 2.2 (Docker Compose needs OTLP config from state), Story 3.1 (beads init extends the beads install from this story)

### New npm Dependencies

No new npm dependencies for the CLI itself. The CLI invokes `pip`, `npm`, and other tools as subprocesses — it doesn't import them.

The OTLP packages are installed into the *target project*, not into codeharness:
- `@opentelemetry/auto-instrumentations-node` (installed via `npm install` in target project)
- `@opentelemetry/sdk-node` (installed via `npm install` in target project)
- `@opentelemetry/exporter-trace-otlp-http` (installed via `npm install` in target project)
- `@opentelemetry/exporter-metrics-otlp-http` (installed via `npm install` in target project)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 1 (CLI↔Plugin), Decision 2 (State Management), Decision 6 (Template Embedding)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR8, FR14, FR15, FR16, NFR6, NFR12]
- [Source: _bmad-output/planning-artifacts/prd.md — Known Implementation Gap #5 (wrong install commands)]
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md — Actions A4, A5]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-1-dependency-auto-install-otlp-instrumentation.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib module — deps.ts, otlp.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/2-1-dependency-auto-install-otlp-instrumentation.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
