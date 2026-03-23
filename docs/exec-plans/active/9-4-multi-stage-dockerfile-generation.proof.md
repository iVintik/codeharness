# Showboat Proof: 9-4 Multi-stage Dockerfile Generation

## Test Environment

- **Type:** Local development (macOS)
- **Date:** 2026-03-23
- **Tool:** Vitest unit tests + codeharness coverage
- **Story:** 9-4-multi-stage-dockerfile-generation

## AC #1: Multi-stage Dockerfile with per-stack build stages and combined runtime

**Tests:** `produces FROM node:22-slim AS build-nodejs and FROM rust:1.82-slim AS build-rust`, `produces combined FROM debian:bookworm-slim runtime stage`
**Evidence:** `generateDockerfileTemplate('/project', [{stack:'nodejs',dir:'.'},{stack:'rust',dir:'services/backend'}])` produces Dockerfile content containing `FROM node:22-slim AS build-nodejs`, `FROM rust:1.82-slim AS build-rust`, and `FROM debian:bookworm-slim` runtime stage.

**Verdict:** PASS

## AC #2: Single-stack StackDetection[] produces byte-identical output to string arg

**Tests:** `single nodejs detection produces identical output to string arg`, `single rust detection produces identical output to string arg`, `single python detection produces identical output to string arg`
**Evidence:** Output from `generateDockerfileTemplate('/project', [{stack:'nodejs',dir:'.'}])` is byte-identical to `generateDockerfileTemplate('/project', 'nodejs')`. Same for rust and python.

**Verdict:** PASS

## AC #3: Build stages named build-{stack} with COPY --from=build-{stack}

**Tests:** `each build stage is named build-{stack}`, `contains COPY --from=build-nodejs and COPY --from=build-rust`
**Evidence:** Multi-stage output contains `AS build-nodejs`, `AS build-rust`, `COPY --from=build-nodejs`, `COPY --from=build-rust`.

**Verdict:** PASS

## AC #4: Multi-stage Dockerfile passes validateDockerfile() all 6 categories

**Tests:** `nodejs+rust multi-stage passes all 6 rule categories`, `nodejs+python+rust multi-stage passes all 6 rule categories`
**Evidence:** `validateDockerfile()` returns `{ passed: true, gaps: [] }` for both 2-stack and 3-stack multi-stage Dockerfiles.

**Verdict:** PASS

## AC #5: init-project.ts passes full StackDetection[] to generateDockerfileTemplate

**Evidence:** `init-project.ts` line 87: `generateDockerfileTemplate(projectDir, allStacks)` passes the full `StackDetection[]` from `detectStacks()`. Result handling at line 89 captures `stacks` field.

**Verdict:** PASS

## AC #6: All existing single-stack tests pass with zero regressions

**Evidence:** Full test suite: 3129 tests pass, 0 failures. All 34 pre-existing dockerfile-template tests pass unchanged.

**Verdict:** PASS
