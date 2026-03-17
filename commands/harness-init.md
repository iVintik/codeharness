---
description: Initialize the codeharness harness in the current project — detect stack, configure enforcement, install dependencies, set up hooks.
---

# Harness Init

Initialize codeharness in the current project.

## Step 1: Stack Detection

Detect the project's technology stack by checking for indicator files:

1. Check if `package.json` exists in the project root → **Node.js**
2. Check if `requirements.txt` or `pyproject.toml` exists → **Python**
3. Check if `go.mod` exists → **Go**
4. Check if `Cargo.toml` exists → **Rust**
5. If none found → Ask the user to specify the stack

Output the detection result:
```
[INFO] Stack detected: {stack_name} ({indicator_file})
```

If no stack detected:
```
[INFO] No recognized stack files found.
```
Then ask: "What is your project's technology stack? (e.g., Node.js, Python, Go, Rust)"

## Step 2: Enforcement Configuration

Ask the user what to enforce. Present each option and wait for answers:

1. "Frontend? (y/n)" — enables UI verification via agent-browser
2. "Database? (y/n)" — enables DB state verification via DB MCP
3. "APIs? (y/n)" — enables API verification via real HTTP calls

Note: Observability is always enabled (mandatory). There is no opt-out.

## Step 3: Dependency Check

Check that all required external tools are available. **If Docker is missing, halt immediately.** Other tools can be auto-installed.

### Required Dependencies

1. **Docker** (recommended, graceful degradation if missing):
   - Run: `docker info` (suppress output, check exit code)
   - If missing:
     ```
     [WARN] Docker not available — observability will use remote mode
     [INFO] → Install Docker: https://docs.docker.com/engine/install/
     [INFO] → Or use remote endpoints: codeharness init --otel-endpoint <url>
     ```
   - Init continues — observability is deferred until Docker or remote endpoint is configured.

2. **Showboat** (auto-installable):
   - Run: `which showboat` or `showboat --version`
   - If missing: auto-install via `uvx install showboat`
   - If install fails:
     ```
     [FAIL] Showboat installation failed.

     Showboat captures reproducible verification evidence.
     Without it, the harness cannot produce proof documents.

     → Install manually: pip install showboat
     → Or: uvx install showboat
     ```
   - If present: `[OK] Showboat: installed`

3. **agent-browser** (auto-installable, only if frontend enforcement enabled):
   - Run: `which agent-browser` or `agent-browser --version`
   - If missing: auto-install via `npm install -g agent-browser`
   - If install fails:
     ```
     [WARN] agent-browser not installed. UI verification will be skipped.

     → Install manually: npm install -g agent-browser
     ```
   - If present: `[OK] agent-browser: installed`

4. **OTLP packages** (auto-installable, always installed — observability is mandatory):
   - For Node.js: check if `@opentelemetry/auto-instrumentations-node` is in devDependencies
     - If missing: `npm install --save-dev @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-metrics-otlp-http @opentelemetry/exporter-logs-otlp-http @opentelemetry/exporter-trace-otlp-http`
   - For Python: check if `opentelemetry-distro` is installed
     - If missing: `pip install opentelemetry-distro opentelemetry-exporter-otlp`
   - If present: `[OK] OTLP instrumentation: installed`

### Dependency Report

After all checks, output a summary:
```
[OK] Docker: running
[OK] Showboat: installed
[OK] agent-browser: installed
[OK] OTLP instrumentation: installed
```

If any required dependency failed, do not proceed to the next step.

## Step 3.5: Observability Stack

The observability stack is **shared across all projects** at `~/.codeharness/stack/`. Do NOT generate per-project compose files.

### Check if shared stack is already running

```bash
docker compose -p codeharness-shared -f ~/.codeharness/stack/docker-compose.harness.yml ps --format json
```

If running:
```
[OK] Observability stack: already running (shared at ~/.codeharness/stack/)
```
Skip to Step 4. Do NOT start new containers.

### If not running, start via CLI

```bash
codeharness init
```

The CLI handles shared stack setup, compose file generation, and port management. Do NOT generate compose files manually or run `docker compose up` directly — the CLI manages the shared stack lifecycle.

### Remote/OpenSearch mode

If the user wants remote observability (e.g., OpenSearch), use:
```bash
codeharness init --otel-endpoint <url>
```
Or for separate endpoints:
```bash
codeharness init --logs-url <url> --metrics-url <url> --traces-url <url>
```

## Step 4: BMAD Installation & Harness Patches

### Check for existing BMAD

1. If `_bmad/` directory exists:
   - This is an existing BMAD installation. Preserve user content.
   - Output: `[OK] BMAD: existing installation detected, harness patches applied`

2. If NO `_bmad/` directory:
   - Install BMAD: run `npx bmad-method install --yes --tools claude-code`
   - Must complete within 60 seconds (NFR18)
   - Output: `[OK] BMAD: installed (v6.x), harness patches applied`

3. If the user is running in standalone mode (no BMAD desired):
   - Skip BMAD installation entirely
   - Output: `[INFO] BMAD: not installed (standalone mode)`
   - Continue to next step

### Apply Harness Patches

After BMAD is available, apply harness patches. Patches are **idempotent** — applying them twice produces the same result (NFR19).

Read each patch template from the plugin's `templates/bmad-patches/` directory and apply to the corresponding BMAD file. Check if the patch marker already exists before applying.

**Patch targets:**

1. **Story template** (`_bmad/` story template):
   - Add verification requirements section
   - Add documentation requirements (which AGENTS.md to update, exec-plan to create)
   - Add testing requirements (coverage target)

2. **Dev story workflow**:
   - Add observability enforcement during implementation
   - Add documentation update enforcement
   - Add testing enforcement (write tests, 100% coverage)

3. **Code review workflow**:
   - Add check for Showboat proof document
   - Add check for AGENTS.md freshness
   - Add check for test coverage

4. **Retrospective workflow**:
   - Add verification effectiveness analysis
   - Add doc health analysis
   - Add test quality analysis

Each patch is wrapped with markers for idempotency:
```
<!-- CODEHARNESS-PATCH-START:{patch_name} -->
{patch content}
<!-- CODEHARNESS-PATCH-END:{patch_name} -->
```

If markers already exist, skip that patch.

## Step 5: Documentation Scaffold

Generate the project documentation structure for harness-enforced documentation.

### Root AGENTS.md

If no `AGENTS.md` exists at project root, generate one (~100 lines max, NFR24). The file should contain:

1. **Build & test commands** — detected from stack (e.g., `npm test`, `pytest`)
2. **Architecture overview** — brief description of project structure
3. **Conventions** — code style, naming, patterns detected
4. **Security notes** — any sensitive files, env vars
5. **Pointers** — reference `_bmad-output/planning-artifacts/` for detailed planning docs

If `AGENTS.md` already exists, preserve it. Output: `[OK] AGENTS.md: preserved (existing)`

### docs/ Structure

Create the following directories and files if they don't exist:

```
docs/
├── index.md                          # Map to BMAD artifacts (NFR25: relative paths only)
├── exec-plans/
│   ├── active/                       # Stories in progress
│   └── completed/                    # Verified stories
└── generated/
    └── .gitkeep                      # Auto-generated docs (DB schema, etc.)
```

`docs/index.md` must reference BMAD planning artifacts by **relative path** to `_bmad-output/planning-artifacts/` — never copy content (NFR25).

All files in `docs/quality/` and `docs/generated/` must have this header (NFR27):
```
<!-- DO NOT EDIT MANUALLY — this file is auto-generated by codeharness -->
```

Output:
```
[OK] Documentation scaffold: created (AGENTS.md, docs/)
```

If docs/ already exists, only create missing subdirectories. Output: `[OK] Documentation scaffold: updated (missing dirs created)`

## Step 6: State File & Hook Installation

### State File

Create `.claude/codeharness.local.md` with the canonical YAML structure. This is the single source of truth for harness state:

```markdown
---
harness_version: "0.1.0"
initialized: true
stack: "{detected_stack}"
enforcement:
  frontend: {true|false}
  database: {true|false}
  api: {true|false}
coverage:
  target: 100
  baseline: null
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---

# codeharness State

This file is managed by codeharness. Do not edit manually.
```

If the file already exists (re-init), preserve the existing enforcement config and verification_log. Only update harness_version and reset session_flags.

If the file is corrupted (NFR17), recreate it from detected config and warn the user.

### Hook Installation

The plugin's `hooks/hooks.json` registers 4 hooks automatically via Claude Code's plugin auto-discovery:

1. **session-start** (SessionStart) — verifies harness health, resets session flags
2. **pre-commit-gate** (PreToolUse: Bash) — blocks commits without quality gates
3. **post-write-check** (PostToolUse: Write) — prompts OTLP instrumentation verification
4. **post-test-verify** (PostToolUse: Bash) — prompts VictoriaLogs query after tests

Verify hook scripts are executable:
```bash
chmod +x hooks/session-start.sh hooks/pre-commit-gate.sh hooks/post-write-check.sh hooks/post-test-verify.sh
```

Output: `[OK] Hooks: 4 registered (session-start, pre-commit, post-write, post-test)`

## Step 7: Report

Output the init report:

```
Harness Init — codeharness v0.1.0

[OK] Stack detected: {stack_name} ({indicator_file})
[OK] Docker: running
[OK] Showboat: installed
[OK] agent-browser: {installed|skipped}
[OK] OTLP instrumentation: {installed|skipped}
[OK] BMAD: {installed|existing|standalone}
[OK] Documentation scaffold: {created|updated|preserved}
[OK] Hooks: 4 registered (session-start, pre-commit, post-write, post-test)
[OK] Enforcement configured: frontend:{ON|OFF} database:{ON|OFF} api:{ON|OFF} observability:ON
[OK] Config persisted: .claude/codeharness.local.md

→ Run /harness-run to start autonomous execution.
```

## Idempotency

This command is safe to re-run. On re-init:

- **Stack detection:** Re-detects (may have changed)
- **Enforcement config:** Preserves existing choices, asks to confirm
- **Dependencies:** Re-checks all, skips already installed
- **BMAD:** Preserves existing, re-applies patches (idempotent markers prevent duplication)
- **Documentation:** Creates only missing directories/files
- **State file:** Preserves verification_log, resets session_flags
- **Hooks:** Already registered via plugin auto-discovery (no action needed)

Components that are already configured show: `[OK] Already configured: {component}`
