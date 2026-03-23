# Story 8-8: Rust Documentation Scaffolding

## Status: backlog

## Story

As a developer initializing a Rust project,
I want AGENTS.md to include Rust-specific build/test commands,
So that AI agents know how to build and test my project.

## Acceptance Criteria

- [ ] AC1: Given a Rust project, when `getStackLabel()` is called, then it returns `'Rust (Cargo.toml)'` <!-- verification: cli-verifiable -->
- [ ] AC2: Given a Rust project, when `getCoverageTool()` is called, then it returns `'cargo-tarpaulin'` <!-- verification: cli-verifiable -->
- [ ] AC3: Given a Rust project, when `generateAgentsMdContent()` is called, then output includes `cargo build`, `cargo test`, `cargo tarpaulin --out json` <!-- verification: cli-verifiable -->
- [ ] AC4: Given a Rust project with `[package] name = "myapp"` in Cargo.toml, when `getProjectName()` is called, then it returns `'myapp'` (reads from Cargo.toml, not package.json) <!-- verification: cli-verifiable -->

## Technical Notes

### Stack Label

File: `src/modules/infra/docs-scaffold.ts` — `getStackLabel()` at L32-36.

Add: `if (stack === 'rust') return 'Rust (Cargo.toml)';`

### Coverage Tool Name

File: `src/modules/infra/docs-scaffold.ts` — `getCoverageTool()` at L38-41.

Add: `if (stack === 'rust') return 'cargo-tarpaulin';`

### AGENTS.md Content

File: `src/modules/infra/docs-scaffold.ts` — `generateAgentsMdContent()` at L43-98 (around L66 for stack-specific commands).

Add Rust case that includes:
- `cargo build` — build the project
- `cargo test` — run tests
- `cargo tarpaulin --out json --output-dir coverage/` — run coverage
- `cargo clippy` — lint (standard Rust practice)
- `cargo fmt -- --check` — format check

### Project Name

File: `src/modules/infra/docs-scaffold.ts` — `getProjectName()`.

Currently only reads `package.json`. Add Rust fallback: if no `package.json` and `Cargo.toml` exists, parse `[package]` section for `name = "..."` line using regex:
```typescript
/name\s*=\s*"([^"]+)"/
```

Read `Cargo.toml` content and extract the name from the `[package]` section. Be careful to only match the `name` field within `[package]`, not within `[dependencies]` or other sections.

### Tests

File: `src/modules/infra/__tests__/docs-scaffold.test.ts`

Add test cases:
- `getStackLabel('rust')` returns `'Rust (Cargo.toml)'`
- `getCoverageTool('rust')` returns `'cargo-tarpaulin'`
- `generateAgentsMdContent()` with Rust stack includes `cargo build`, `cargo test`, `cargo tarpaulin`
- `getProjectName()` with Cargo.toml returns package name from TOML

## Files to Change

- `src/modules/infra/docs-scaffold.ts` — Add Rust branch to `getStackLabel()` (L34), `getCoverageTool()` (L40), `generateAgentsMdContent()` (L66), and `getProjectName()` for Cargo.toml parsing
- `src/modules/infra/__tests__/docs-scaffold.test.ts` — Add Rust test cases for stack label, coverage tool, AGENTS.md content, and project name extraction
