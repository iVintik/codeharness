# Story 9-4: Multi-stage Dockerfile generation

## Status: backlog

## Story

As a developer deploying a multi-stack project,
I want a single Dockerfile with build stages for each stack,
So that all components are built and packaged together.

## Acceptance Criteria

- [ ] AC1: Given a multi-stack project (nodejs + rust), when `generateDockerfileTemplate()` is called, then it produces a multi-stage Dockerfile with `node:22-slim` AND `rust:1.82-slim` build stages and a combined `debian:bookworm-slim` runtime stage <!-- verification: cli-verifiable -->
- [ ] AC2: Given a single-stack project, when `generateDockerfileTemplate()` is called, then output is identical to the current single-stack template (no regression) <!-- verification: cli-verifiable -->
- [ ] AC3: Given a multi-stack Dockerfile, when inspected, then each build stage is named `build-{stack}` and the runtime stage copies from all build stages <!-- verification: cli-verifiable -->

## Technical Notes

### Changes to `src/modules/infra/dockerfile-template.ts`

The current `generateDockerfileTemplate()` (L112) takes a single stack and produces a single-stack Dockerfile.

**New function to add:**
```ts
export function generateMultiStackDockerfile(detections: StackDetection[]): string
```

This function:
1. If `detections.length === 1`, delegate to existing single-stack template functions (`nodejsTemplate()`, `pythonTemplate()`, `rustTemplate()`) — output must be identical to current behavior.
2. If `detections.length > 1`, compose a multi-stage Dockerfile:

**Multi-stage structure:**
```dockerfile
# Build stage for nodejs
FROM node:22-slim AS build-nodejs
WORKDIR /app/{dir}
COPY {dir}/package*.json ./
RUN npm ci
COPY {dir}/ ./
RUN npm run build

# Build stage for rust
FROM rust:1.82-slim AS build-rust
WORKDIR /app/{dir}
COPY {dir}/Cargo.toml {dir}/Cargo.lock ./
RUN cargo build --release

# Runtime
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build-nodejs /app/{dir}/dist ./frontend/dist
COPY --from=build-rust /app/{dir}/target/release/{binary} ./backend/
```

Each `{dir}` comes from `StackDetection.dir`. Build stages are named `build-{stack}` (e.g., `build-nodejs`, `build-rust`).

**Update existing function:**
Modify `generateDockerfileTemplate()` to accept `StackDetection[]` and delegate:
- Single detection → existing per-stack template (no regression)
- Multiple detections → `generateMultiStackDockerfile()`

**Reuse existing templates as building blocks.** The existing `nodejsTemplate()`, `pythonTemplate()`, `rustTemplate()` functions produce complete Dockerfiles. Extract the build-stage portions from each to compose multi-stage builds. The runtime stage is new — it uses `debian:bookworm-slim` and copies artifacts from all build stages.

### Import changes

Import `StackDetection` from `../../lib/stack-detect`.

### Test file

Create/update `src/modules/infra/__tests__/dockerfile-template.test.ts`:
- Single-stack: output identical to current (snapshot or string comparison)
- Multi-stack (nodejs + rust): verify both `FROM` lines present, both `AS build-*` stages, combined runtime stage with `COPY --from` for each
- Multi-stack (nodejs + python): same pattern
- Verify `dir` values are used correctly in WORKDIR and COPY paths

## Files to Change

- `src/modules/infra/dockerfile-template.ts` — Add `generateMultiStackDockerfile(detections: StackDetection[])`, update `generateDockerfileTemplate()` to accept `StackDetection[]` and delegate, extract build-stage portions from existing per-stack templates
- `src/modules/infra/__tests__/dockerfile-template.test.ts` — Add multi-stage Dockerfile tests (multi-stack output, single-stack no-regression, stage naming, COPY --from verification)
