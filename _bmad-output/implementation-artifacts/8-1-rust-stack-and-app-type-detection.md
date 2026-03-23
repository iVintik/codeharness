# Story 8-1: Rust Stack and App Type Detection

## Status: verifying

## Story

As a developer initializing codeharness on a Rust project,
I want the harness to detect my project as Rust and identify whether it's a CLI, server, library, or agent,
So that all downstream features (coverage, OTLP, Dockerfile) use the correct Rust configuration.

## Acceptance Criteria

- [x] AC1: Given a directory contains `Cargo.toml`, when `detectStack()` is called, then it returns `'rust'` <!-- verification: cli-verifiable -->
- [x] AC2: Given a Rust project with `[[bin]]` in Cargo.toml and no web framework deps, when `detectAppType()` is called, then it returns `'cli'` <!-- verification: cli-verifiable -->
- [x] AC3: Given a Rust project with `axum` in `[dependencies]`, when `detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC4: Given a Rust project with `[lib]` section and no `[[bin]]`, when `detectAppType()` is called, then it returns `'generic'` (library) <!-- verification: cli-verifiable -->
- [x] AC5: Given a Rust project with `async-openai` in dependencies, when `detectAppType()` is called, then it returns `'agent'` <!-- verification: cli-verifiable -->
- [x] AC6: Given a Rust project with `[workspace]` in Cargo.toml, when `detectStack()` is called, then it still returns `'rust'` (treated as single project) <!-- verification: cli-verifiable -->
- [x] AC7: Given no `Cargo.toml` exists, when `detectStack()` is called, then Rust is NOT detected (no false positive) <!-- verification: cli-verifiable -->

## Technical Notes

### Stack Detection

File: `src/lib/stack-detect.ts` — `detectStack()` at L7-14.

Add `if (existsSync(join(dir, 'Cargo.toml'))) return 'rust';` after the Python checks. Use existing `readTextSafe()` helper already present in the file for reading Cargo.toml content.

### App Type Detection

File: `src/lib/stack-detect.ts` — `detectAppType()` at L72-145.

Add `if (stack === 'rust') { ... }` block after the Python block (around L142). Implement a `getCargoContent()` helper using `readTextSafe()` to read `Cargo.toml`.

Add these constants at module level:
```typescript
const RUST_WEB_FRAMEWORKS = ['actix-web', 'axum', 'rocket', 'tide', 'warp'];
const RUST_AGENT_DEPS = ['async-openai', 'anthropic', 'llm-chain'];
```

### Detection Priority Order

1. **Agent**: any dep in `RUST_AGENT_DEPS` found in `[dependencies]` section
2. **Server**: any dep in `RUST_WEB_FRAMEWORKS` found in `[dependencies]` section
3. **CLI**: `[[bin]]` section present without web framework deps
4. **Library**: `[lib]` section present, no `[[bin]]`
5. **Generic**: fallback

### Cargo.toml Parsing

Use simple string matching — no TOML parser dependency (NFR4). Check for section headers like `[workspace]`, `[[bin]]`, `[lib]`, and search for dependency names in `[dependencies]` section text. `readTextSafe()` is already available in the file.

For `[workspace]` projects, still return the detected app type based on root deps. Workspace is detected but treated as a single project — no per-crate enumeration.

### Tests

File: `src/lib/__tests__/stack-detect.test.ts`

Mirror existing Node.js/Python test patterns. Use `vi.mock('node:fs')` to mock `existsSync` and `readFileSync`. Create Cargo.toml content fixtures for:
- Plain binary crate (`[[bin]]`)
- Library crate (`[lib]`)
- Workspace crate (`[workspace]`)
- Web framework project (axum in deps)
- Agent project (async-openai in deps)
- No Cargo.toml (negative case)

## Files to Change

- `src/lib/stack-detect.ts` — Add Rust branch to `detectStack()` (L11), add `RUST_WEB_FRAMEWORKS` and `RUST_AGENT_DEPS` constants, add Rust block to `detectAppType()` (L142), add `getCargoContent()` helper
- `src/lib/__tests__/stack-detect.test.ts` — Add Rust test cases for stack detection and all app type variants
