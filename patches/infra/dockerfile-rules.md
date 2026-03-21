# Dockerfile Rules

Required elements for verification Dockerfiles. The `validateDockerfile()` function checks all six categories below. Gaps are reported through the audit infrastructure dimension.

## Required Elements

### 1. Pinned FROM Image

Base images must use a specific version tag or digest. Using `:latest` or omitting a tag results in non-reproducible builds.

- **Pass:** `FROM node:22-slim`, `FROM python:3.12-slim`, `FROM node@sha256:abc123`
- **Fail:** `FROM node:latest`, `FROM node`

### 2. Project Binary on PATH

The container must install the project binary so it is available on PATH. This prevents "container missing binary" failures.

- **Patterns:** `npm install -g`, `pip install`, `COPY --from=builder`

### 3. Verification Tools

Containers must include tools needed for health checks and diagnostics: `curl`, `jq`.

- **Install via:** `apt-get install -y curl jq` or `apk add --no-cache curl jq`

### 4. No Source Code COPY

Containers should use build artifacts, not raw source. Copying source directories inflates image size and leaks code.

- **Fail patterns:** `COPY src/`, `COPY lib/`, `COPY test/`
- **Pass:** `COPY --from=builder /app/dist /app/dist`, `COPY dist/ /app/dist/`

### 5. Non-root USER

Containers must not run as root. Include a `USER` instruction with a non-root user.

- **Pass:** `USER node`, `USER appuser`, `USER 1001`
- **Fail:** no `USER` instruction, or only `USER root`

### 6. Cache Cleanup

Package manager caches must be cleaned to reduce image size.

- **Patterns:** `rm -rf /var/lib/apt/lists/*`, `npm cache clean --force`, `pip cache purge`

## Project-Type-Specific Notes

### Node.js

- Use `npm install -g <package>` to put the binary on PATH
- Use `npm cache clean --force` after install
- Prefer `node:22-slim` or `node:22-alpine` base images

### Python

- Use `pip install --no-cache-dir <package>` or `pip cache purge`
- Prefer `python:3.12-slim` base images

### Plugin (Claude Code)

- Plugin containers typically use Node.js base
- Ensure `codeharness` binary is installed globally via `npm install -g`
