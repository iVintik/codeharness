# src/lib/__tests__/fixtures — Shared Test Fixtures

Builder factories, mock helpers, and data constants reused across test files. See `src/lib/AGENTS.md` for the authoritative listing.

| File | Purpose | Key Exports |
|------|---------|-------------|
| cargo-toml-variants.ts | Named Cargo.toml string constants for 8 variants | `CARGO_TOML_MINIMAL`, `CARGO_TOML_ACTIX_WEB`, `CARGO_TOML_AXUM`, `CARGO_TOML_ASYNC_OPENAI`, `CARGO_TOML_WORKSPACE`, `CARGO_TOML_BINARY`, `CARGO_TOML_LIBRARY`, `CARGO_TOML_GENERIC` |
| state-builders.ts | Builder factories for SprintStateV2 and related test data | `buildSprintState`, `buildStoryEntry`, `buildEpicState`, `buildActionItem`, `buildSprintStateWithStory` |
| mock-factories.ts | Mock factory functions for commonly mocked modules | `createFsMock`, `createChildProcessMock`, `createDockerMock`, `createStateMock`, `createSprintStateMock` |
