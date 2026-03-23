# Story 8.8: Rust Documentation Scaffolding

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer initializing codeharness on a Rust project,
I want AGENTS.md to include Rust-specific build/test commands and `getProjectName()` to read from Cargo.toml,
so that AI agents know how to build and test my project and the project name is correct for Rust projects.

## Acceptance Criteria

1. **AC1:** Given a Rust project, when `getStackLabel()` is called, then it returns `'Rust (Cargo.toml)'` <!-- verification: cli-verifiable -->
2. **AC2:** Given a Rust project, when `getCoverageTool()` is called, then it returns `'cargo-tarpaulin'` <!-- verification: cli-verifiable -->
3. **AC3:** Given a Rust project, when `generateAgentsMdContent()` is called, then output includes `cargo build`, `cargo test`, `cargo tarpaulin --out json` <!-- verification: cli-verifiable -->
4. **AC4:** Given a Rust project with `[package]\nname = "myapp"` in Cargo.toml and no package.json, when `getProjectName()` is called, then it returns `'myapp'` (reads from Cargo.toml, not package.json) <!-- verification: cli-verifiable -->
5. **AC5:** Given a Rust project with BOTH `package.json` (name: "npm-name") and `Cargo.toml` (name = "rust-name"), when `getProjectName()` is called, then it returns `'npm-name'` (package.json takes precedence — existing behavior preserved) <!-- verification: cli-verifiable -->
6. **AC6:** Given a Rust project with a Cargo.toml that has `name` fields in `[dependencies]` but not in `[package]`, when `getProjectName()` is called, then it does NOT return a dependency name — it falls back to `basename(projectDir)` <!-- verification: cli-verifiable -->
7. **AC7:** Given all changes, when `npm test` runs, then all existing tests pass with zero regressions and new Rust docs-scaffold tests pass <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Add Cargo.toml parsing to `getProjectName()` in `src/modules/infra/docs-scaffold.ts` (AC: #4, #5, #6)
  - [x] 1.1 After the existing `package.json` check (L19-26), add a Cargo.toml check: if no package.json name found, try reading `Cargo.toml`
  - [x] 1.2 Parse the `[package]` section to extract `name = "value"` using regex `/^\[package\][\s\S]*?^name\s*=\s*"([^"]+)"/m` or equivalent line-by-line parsing
  - [x] 1.3 IMPORTANT: Only match `name` within the `[package]` section, NOT within `[dependencies]` or other sections — stop at the next `[section]` header
  - [x] 1.4 If `package.json` exists and has a name, it takes precedence (existing behavior, do not change)
  - [x] 1.5 If Cargo.toml parse fails or has no `[package]` name, fall through to `basename(projectDir)` as before
- [x] Task 2: Verify existing Rust branches in `getStackLabel()`, `getCoverageTool()`, `generateAgentsMdContent()` are correct (AC: #1, #2, #3)
  - [x] 2.1 Confirm `getStackLabel('rust')` already returns `'Rust (Cargo.toml)'` — no change needed
  - [x] 2.2 Confirm `getCoverageTool('rust')` already returns `'cargo-tarpaulin'` — no change needed
  - [x] 2.3 Confirm `generateAgentsMdContent(dir, 'rust')` already includes `cargo build`, `cargo test`, `cargo tarpaulin --out json` — no change needed
- [x] Task 3: Add test cases to `src/modules/infra/__tests__/docs-scaffold.test.ts` (AC: #4, #5, #6, #7)
  - [x] 3.1 Test: `getProjectName()` with Cargo.toml `[package]\nname = "myapp"` and no package.json returns `'myapp'`
  - [x] 3.2 Test: `getProjectName()` with BOTH package.json and Cargo.toml returns the package.json name (precedence)
  - [x] 3.3 Test: `getProjectName()` with Cargo.toml that only has `name` in `[dependencies]` section falls back to basename
  - [x] 3.4 Test: `getProjectName()` with malformed Cargo.toml falls back to basename
  - [x] 3.5 Verify existing Rust tests for `getStackLabel`, `getCoverageTool`, `generateAgentsMdContent` still pass
- [x] Task 4: Run full test suite — zero regressions (AC: #7)

## Dev Notes

### CRITICAL: Most ACs Are Already Implemented

ACs 1, 2, and 3 were implemented in earlier stories (8-1 through 8-6). The code already exists in `src/modules/infra/docs-scaffold.ts`:

- **Line 35**: `if (stack === 'rust') return 'Rust (Cargo.toml)';` — AC1 done
- **Line 41**: `if (stack === 'rust') return 'cargo-tarpaulin';` — AC2 done
- **Lines 75-82**: Rust branch in `generateAgentsMdContent()` with `cargo build`, `cargo test`, `cargo tarpaulin --out json` — AC3 done

Tests also exist in `src/modules/infra/__tests__/docs-scaffold.test.ts`:
- Lines 75-78: `getStackLabel('rust')` test
- Lines 93-95: `getCoverageTool('rust')` test
- Lines 121-131: `generateAgentsMdContent` Rust tests

**The only new work is AC4** — adding Cargo.toml parsing to `getProjectName()`. ACs 5 and 6 are edge-case guardrails for AC4. AC7 is regression testing.

### getProjectName() Current Implementation

```typescript
export function getProjectName(projectDir: string): string {
  try {
    const pkgPath = join(projectDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name && typeof pkg.name === 'string') {
        return pkg.name;
      }
    }
  } catch {
    // Fall through to basename
  }
  return basename(projectDir);
}
```

Add a Cargo.toml fallback AFTER the package.json check but BEFORE the `basename` return. The function should try Cargo.toml only if package.json didn't yield a name.

### Cargo.toml Parsing Strategy

Do NOT add a TOML parser dependency (NFR3: no new npm dependencies). Use simple string parsing:

1. Read `Cargo.toml` as UTF-8
2. Find the `[package]` section header
3. From that point, scan lines until the next `[section]` header or EOF
4. Within those lines, match `name = "value"` or `name = 'value'`
5. Return the extracted name

Example regex approach:
```typescript
const cargoPath = join(projectDir, 'Cargo.toml');
if (existsSync(cargoPath)) {
  const content = readFileSync(cargoPath, 'utf-8');
  const packageMatch = content.match(/\[package\]([^[]*)/s);
  if (packageMatch) {
    const nameMatch = packageMatch[1].match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (nameMatch) {
      return nameMatch[1];
    }
  }
}
```

The key is `/\[package\]([^[]*)/s` which captures everything after `[package]` until the next `[` (next section header). Then within that captured group, find `name = "value"`.

### Architecture Constraints

- **NFR3**: No new npm dependencies — use string matching, not a TOML parser
- **NFR4**: Cargo.toml parsing uses simple string matching (explicitly stated in architecture)
- **NFR1**: File must stay under 300 lines — `docs-scaffold.ts` is currently 207 lines, adding ~15 lines for Cargo.toml parsing is safe
- **NFR5**: Follow existing `try/catch` fallthrough pattern in `getProjectName()`

### Test Patterns

Existing tests use:
- `mkdtempSync` for temp directories
- `writeFileSync` to create test files
- Direct function calls with assertions
- `vi.mock` for `generateFile` and `readmeTemplate`

For Cargo.toml tests, create a temp directory, write a `Cargo.toml` file with the appropriate content, and call `getProjectName()`.

### Project Structure Notes

Files to modify:
- `src/modules/infra/docs-scaffold.ts` — Add Cargo.toml parsing to `getProjectName()` (~10-15 lines)
- `src/modules/infra/__tests__/docs-scaffold.test.ts` — Add Rust project name tests (~30 lines)

Files for reference only (do NOT modify):
- `src/modules/infra/init-project.ts` — Calls `scaffoldDocs()`, no changes needed
- `src/commands/init.ts` — CLI entry point, no changes needed

### Do NOT Create or Modify

- Do NOT modify `getStackLabel()` — Rust branch already exists
- Do NOT modify `getCoverageTool()` — Rust branch already exists
- Do NOT modify `generateAgentsMdContent()` — Rust branch already exists
- Do NOT create Semgrep rules (that's story 8-9)
- Do NOT modify OTLP code (that's story 8-7, done)
- Do NOT add `cargo clippy` or `cargo fmt` to AGENTS.md — the epic AC only requires `cargo build`, `cargo test`, `cargo tarpaulin --out json`

### References

- [Source: src/modules/infra/docs-scaffold.ts — complete docs-scaffold module, 207 lines]
- [Source: src/modules/infra/__tests__/docs-scaffold.test.ts — existing test suite, 195 lines]
- [Source: _bmad-output/planning-artifacts/epics-rust-stack-support.md#Story8-8 — epic definition]
- [Source: _bmad-output/implementation-artifacts/tech-spec-rust-stack-support.md — tech spec]

### Previous Story Intelligence (8-7)

- 8-7 added `installRustOtlp()`, updated `instrumentProject()` and `configureAgent()` Rust branches in `src/lib/otlp.ts` — no file overlap with this story
- 8-7 created `templates/otlp/rust.md` — no overlap
- 8-7 confirmed all tests pass with zero regressions
- This story touches `src/modules/infra/docs-scaffold.ts` only — clean isolation from 8-7

### Git Intelligence

Recent commits: 2a601a7 (8-7 verified), f33294b (8-6 verified), 79f3449 (8-5 verified), 4e805b9 (8-4 verified), ebaddac (8-3 verified).
All previous Rust stories verified successfully. Pattern: single-module changes with focused tests.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-8-rust-documentation-scaffolding.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-8-rust-documentation-scaffolding.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- Task 1: Added Cargo.toml `[package]` name parsing to `getProjectName()` as a fallback after package.json. Uses regex `/\[package\]([^[]*)/s` to isolate the `[package]` section, then `/^\s*name\s*=\s*"([^"]+)"/m` to extract the name. Wrapped in try/catch for graceful fallthrough. Added 13 lines to docs-scaffold.ts (now 220 lines, well under 300 NFR1 limit). No new dependencies (NFR3).
- Task 2: Verified existing Rust branches — `getStackLabel('rust')` returns `'Rust (Cargo.toml)'` (L35), `getCoverageTool('rust')` returns `'cargo-tarpaulin'` (L41), `generateAgentsMdContent(dir, 'rust')` includes `cargo build`, `cargo test`, `cargo tarpaulin --out json` (L75-82). All confirmed correct, no changes needed.
- Task 3: Added 4 new test cases: Cargo.toml-only project, package.json precedence over Cargo.toml, dependencies-only Cargo.toml fallback, malformed Cargo.toml fallback. All existing Rust tests (getStackLabel, getCoverageTool, generateAgentsMdContent) continue to pass.
- Task 4: Full test suite passes — 28 vitest docs-scaffold tests, 3018 total vitest tests across 113 files, 307 BATS integration tests. Zero regressions.

### File List

- `src/modules/infra/docs-scaffold.ts` — Modified: added Cargo.toml parsing fallback in `getProjectName()`
- `src/modules/infra/__tests__/docs-scaffold.test.ts` — Modified: added 4 new test cases for Cargo.toml project name extraction
