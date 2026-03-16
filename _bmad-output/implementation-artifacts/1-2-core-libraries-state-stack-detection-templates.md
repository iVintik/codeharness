# Story 1.2: Core Libraries — State, Stack Detection, Templates

Status: ready-for-dev

## Story

As a developer,
I want the CLI to have reliable state management and stack detection,
So that init and all future commands can build on solid foundations.

## Acceptance Criteria

1. **Given** a project directory with no `.claude/codeharness.local.md`, **When** `state.ts` `writeState()` is called with a config object, **Then** it creates the file with YAML frontmatter using `snake_case` field names, boolean values are YAML native `true`/`false` (not strings), and null values are YAML `null` (not empty string).

2. **Given** an existing `.claude/codeharness.local.md` with valid YAML, **When** `state.ts` `readState()` is called, **Then** it parses the YAML frontmatter and returns a typed config object. The markdown body below the frontmatter is preserved on subsequent writes.

3. **Given** a corrupted `.claude/codeharness.local.md` (invalid YAML), **When** `state.ts` `readState()` is called, **Then** it logs `[WARN] State file corrupted — recreating from detected config` and recreates the state file from detected project state (NFR19).

4. **Given** a project directory with `package.json`, **When** `stack-detect.ts` `detectStack()` is called, **Then** it returns `"nodejs"`.

5. **Given** a project directory with `requirements.txt` or `pyproject.toml`, **When** `stack-detect.ts` `detectStack()` is called, **Then** it returns `"python"`.

6. **Given** a project directory with no recognized indicator files, **When** `stack-detect.ts` `detectStack()` is called, **Then** it returns `null` and logs `[WARN] No recognized stack detected`.

7. **Given** an embedded template definition, **When** `templates.ts` `generateFile()` is called with a config object, **Then** it writes the file to the target path with template variables interpolated. Templates are TypeScript string literals — no external file reads.

8. **Given** all three library modules, **When** unit tests are run via `vitest`, **Then** all tests pass with 100% coverage of state.ts, stack-detect.ts, and templates.ts.

## Tasks / Subtasks

- [ ] Task 1: Implement `src/lib/state.ts` — State file read/write (AC: #1, #2, #3)
  - [ ] 1.1: Define TypeScript interface `HarnessState` matching the canonical state structure from Architecture Decision 2:
    ```typescript
    interface HarnessState {
      harness_version: string;
      initialized: boolean;
      stack: string | null;
      enforcement: {
        frontend: boolean;
        database: boolean;
        api: boolean;
        observability: boolean;
      };
      coverage: {
        target: number;
        baseline: number | null;
        current: number | null;
        tool: string;
      };
      session_flags: {
        logs_queried: boolean;
        tests_passed: boolean;
        coverage_met: boolean;
        verification_run: boolean;
      };
      verification_log: string[];
    }
  ```
  - [ ] 1.2: Implement `writeState(state: HarnessState, dir?: string): void` — writes `.claude/codeharness.local.md` with YAML frontmatter (`---` delimiters) and preserves any existing markdown body below the frontmatter
  - [ ] 1.3: Implement `readState(dir?: string): HarnessState` — reads `.claude/codeharness.local.md`, parses YAML frontmatter between `---` delimiters, returns typed `HarnessState` object
  - [ ] 1.4: Implement corruption recovery — if YAML parsing fails, log `[WARN] State file corrupted — recreating from detected config`, call `detectStack()` to rebuild minimal state, write the new state file
  - [ ] 1.5: Implement `getDefaultState(stack?: string | null): HarnessState` — returns the canonical default state object with all session_flags false, coverage target 100, enforcement all true
  - [ ] 1.6: Create `.claude/` directory if it doesn't exist (use `fs.mkdirSync` with `recursive: true`)
  - [ ] 1.7: Use a YAML library — add `yaml` npm package as a production dependency for reliable YAML serialization/deserialization (not hand-rolled regex parsing)

- [ ] Task 2: Implement `src/lib/stack-detect.ts` — Stack detection (AC: #4, #5, #6)
  - [ ] 2.1: Implement `detectStack(dir?: string): string | null` — checks for indicator files in the given directory (defaults to `process.cwd()`)
  - [ ] 2.2: Node.js detection — check for `package.json` existence → return `"nodejs"`
  - [ ] 2.3: Python detection — check for `requirements.txt` OR `pyproject.toml` OR `setup.py` → return `"python"`
  - [ ] 2.4: Priority ordering — if both Node.js and Python indicators exist, Node.js wins (it's the primary supported stack)
  - [ ] 2.5: Unknown stack — if no indicators found, log `[WARN] No recognized stack detected` using the output utility, return `null`

- [ ] Task 3: Implement `src/lib/templates.ts` — Template generation (AC: #7)
  - [ ] 3.1: Define `TemplateConfig` interface — generic config object passed to template functions
  - [ ] 3.2: Implement `generateFile(targetPath: string, content: string): void` — writes content to targetPath, creating parent directories as needed
  - [ ] 3.3: Implement `renderTemplate(template: string, vars: Record<string, string>): string` — simple variable interpolation for `{{variable}}` placeholders in template strings
  - [ ] 3.4: All templates are TypeScript string literals — this module provides the generation mechanism, not the template content (template content modules like `docker-compose.ts`, `otel-config.ts` come in later stories)

- [ ] Task 4: Update `src/commands/state.ts` — Wire up state subcommands (AC: #1, #2)
  - [ ] 4.1: Replace the stub with real subcommands: `codeharness state get <key>`, `codeharness state set <key> <value>`
  - [ ] 4.2: `state get` — reads state file via `readState()`, outputs the value of the requested key using dot notation (e.g., `session_flags.tests_passed`)
  - [ ] 4.3: `state set` — reads state, sets the value at the requested key path, writes back via `writeState()`
  - [ ] 4.4: `state show` — dumps the full state as YAML (or JSON if `--json` flag is set)
  - [ ] 4.5: Error handling — if state file doesn't exist, print `[FAIL] No state file found. Run 'codeharness init' first.` and exit 1

- [ ] Task 5: Write unit tests (AC: #8)
  - [ ] 5.1: Create `src/lib/__tests__/state.test.ts`:
    - Test `writeState()` creates file with valid YAML frontmatter
    - Test `readState()` parses YAML and returns typed object
    - Test `readState()` preserves markdown body on round-trip
    - Test corruption recovery logs warning and recreates file
    - Test `getDefaultState()` returns correct defaults
    - Test `.claude/` directory auto-creation
    - Test `snake_case` field names (no camelCase in output)
    - Test boolean values are YAML native (not string "true"/"false")
    - Test null values are YAML null (not empty string)
  - [ ] 5.2: Create `src/lib/__tests__/stack-detect.test.ts`:
    - Test returns `"nodejs"` when `package.json` exists
    - Test returns `"python"` when `requirements.txt` exists
    - Test returns `"python"` when `pyproject.toml` exists
    - Test returns `null` when no indicators found
    - Test logs warning when no stack detected
    - Test Node.js takes priority over Python when both exist
  - [ ] 5.3: Create `src/lib/__tests__/templates.test.ts`:
    - Test `generateFile()` writes content to target path
    - Test `generateFile()` creates parent directories
    - Test `renderTemplate()` interpolates variables
    - Test `renderTemplate()` handles missing variables gracefully
  - [ ] 5.4: Create `src/commands/__tests__/state.test.ts`:
    - Test `state get` retrieves values
    - Test `state set` updates values
    - Test `state show` dumps full state
    - Test error when no state file exists
  - [ ] 5.5: Verify 100% coverage of all new code in state.ts, stack-detect.ts, templates.ts

- [ ] Task 6: Install dependencies and verify (AC: #8)
  - [ ] 6.1: `npm install yaml` — add YAML library as production dependency
  - [ ] 6.2: Run `npm run build` — verify tsup compiles all new modules
  - [ ] 6.3: Run `npm run test:unit` — all tests pass
  - [ ] 6.4: Run `npm run test:coverage` — verify 100% coverage of new code

## Dev Notes

### This Story Builds the Foundation Libraries

Story 1.1 created the project scaffold (Commander.js CLI, output utilities, stub commands). This story creates the three core library modules that every subsequent command depends on:

- **`state.ts`** — Every command reads or writes state. The init command creates it, hooks read it, `state set` updates it. Get this right and everything else has a solid data layer.
- **`stack-detect.ts`** — Init needs this to know which dependencies to install and how to configure OTLP. Simple module, but critical.
- **`templates.ts`** — Init, bridge, and onboard all generate files from templates. This module provides the generation mechanism.

### Architecture Decisions That Apply

- **Architecture Decision 2 (State Management):** State file at `.claude/codeharness.local.md`, written exclusively by CLI, read by hooks. YAML frontmatter with `snake_case` fields. Session flag lifecycle defined.
- **Architecture Decision 6 (Template Embedding):** Templates are TypeScript string literals compiled into the npm package. Never external file reads.
- **Implementation Patterns — State File Patterns:** `snake_case` always, booleans as YAML native, null as YAML null.

### State File Format (Canonical)

The state file uses YAML frontmatter (like markdown with metadata):

```markdown
---
harness_version: "0.1.0"
initialized: true
stack: "nodejs"
enforcement:
  frontend: true
  database: true
  api: true
  observability: true
coverage:
  target: 100
  baseline: null
  current: null
  tool: "c8"
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---

# Codeharness State

This file is managed by the codeharness CLI. Do not edit manually.
```

### YAML Library

Use the `yaml` npm package (https://eemeli.org/yaml/) for YAML serialization/deserialization. Do NOT hand-roll YAML parsing with regex — that's fragile and will break on edge cases (multiline strings, special characters, nested objects).

```typescript
import { parse, stringify } from 'yaml';

// Parse YAML frontmatter
const yamlContent = fileContent.split('---')[1];
const state = parse(yamlContent) as HarnessState;

// Write YAML frontmatter
const yaml = stringify(state);
const fileContent = `---\n${yaml}---\n\n${markdownBody}`;
```

### Stack Detection Logic

Simple file-existence checks. No complex heuristics:

```typescript
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function detectStack(dir: string = process.cwd()): string | null {
  if (existsSync(join(dir, 'package.json'))) return 'nodejs';
  if (existsSync(join(dir, 'requirements.txt'))) return 'python';
  if (existsSync(join(dir, 'pyproject.toml'))) return 'python';
  if (existsSync(join(dir, 'setup.py'))) return 'python';
  warn('No recognized stack detected');
  return null;
}
```

### Template Generation Pattern

Templates are NOT implemented in this story — only the generation mechanism. Template content modules (`docker-compose.ts`, `otel-config.ts`, etc.) come in Epic 2 stories. This story provides:

```typescript
// Generate a file from content string
export function generateFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf-8');
}

// Simple variable interpolation
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
```

### State Command (No Longer a Stub)

The `state` command transitions from a stub (Story 1.1) to a real command with subcommands. This is the first stub-to-real transition:

```
codeharness state get session_flags.tests_passed   → "false"
codeharness state set session_flags.tests_passed true
codeharness state show                              → full YAML dump
codeharness state show --json                       → full JSON dump
```

Dot notation for nested keys. Hooks will use this to read/write flags:
```bash
codeharness state set tests_passed true
```

### Testing Approach

All three modules are pure functions operating on the filesystem. Use temp directories for isolation:

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir: string;
beforeEach(() => { testDir = mkdtempSync(join(tmpdir(), 'ch-test-')); });
afterEach(() => { rmSync(testDir, { recursive: true, force: true }); });
```

Target: 100% coverage of all new code (state.ts, stack-detect.ts, templates.ts).

### What Already Exists (from Story 1.1)

- `src/index.ts` — CLI entry point with Commander.js, all commands registered
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` utilities
- `src/commands/state.ts` — Currently a stub that prints "not implemented"
- All other commands — stubs (init, bridge, run, verify, status, onboard, teardown)
- `package.json` — ESM, Commander.js dependency, tsup/vitest/typescript dev deps
- `tsconfig.json` — strict mode, ES2022 target, ESM modules
- `tsup.config.ts` — single entry point, ESM format, node18 target
- `vitest.config.ts` — test configuration

### What NOT To Do

- **Do NOT implement init command logic** — that's Story 1.3
- **Do NOT create template content** (docker-compose, otel-config, etc.) — those come in Epic 2
- **Do NOT create plugin files** — CLI-only
- **Do NOT use `console.log` directly** — use the output utility functions from `src/lib/output.ts`
- **Do NOT use CommonJS** — ESM only (import/export, `.js` extensions in imports)
- **Do NOT parse YAML with regex** — use the `yaml` npm package
- **Do NOT add `any` types** — strict TypeScript

### Dependencies

- **Depends on:** Story 1.1 (project scaffold, CLI entry point, output utilities) — DONE
- **Depended on by:** Story 1.3 (init command uses all three library modules)

### New Production Dependency

This story adds one new production dependency:
- `yaml` — YAML parsing and serialization (for state file management)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 2 (State Management), Decision 6 (Template Embedding), State File Patterns, Template Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR3, FR7, FR30, NFR19]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/1-2-core-libraries-state-stack-detection-templates.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib module)
- [ ] Exec-plan created in `docs/exec-plans/active/1-2-core-libraries-state-stack-detection-templates.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
