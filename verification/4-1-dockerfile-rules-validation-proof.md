# Story 4.1: Dockerfile Rules & Validation — Verification Proof

**Date:** 2026-03-21
**Verifier:** Black-box CLI verification
**CLI Version:** codeharness 0.23.1
**Container:** codeharness-verify

## Setup

Initialized a test Node.js project inside the Docker container with `codeharness init --no-observability`. All verification uses `codeharness audit --json` to exercise Dockerfile validation through the audit coordinator.

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > package.json << EOF
{ "name": "test-project", "version": "1.0.0", "bin": { "test-project": "index.js" } }
EOF
codeharness init --no-observability'
```

```output
[INFO] Stack detected: Node.js (package.json)
[INFO] App type: cli
[OK] Showboat: already installed (v0.4.0)
[OK] State file: .claude/codeharness.local.md created
[OK] Documentation: AGENTS.md + docs/ scaffold created
[OK] Documentation: README.md created
[OK] Enforcement: frontend:ON database:ON api:ON observability:ON
[INFO] Harness initialized. Run: codeharness bridge --epics <path>
```

---

## AC 1: dockerfile-rules.md lists required elements

**Given** `patches/infra/dockerfile-rules.md` exists, **When** read, **Then** it lists required elements: pinned FROM, project binary on PATH, verification tools, no source code, non-root user, cache cleanup.

```bash
docker exec codeharness-verify cat /usr/local/lib/node_modules/codeharness/patches/infra/dockerfile-rules.md
```

```output
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
```

**Result: [PASS]** — All 6 required element categories are documented: pinned FROM, project binary on PATH, verification tools (curl, jq), no source code COPY, non-root USER, cache cleanup.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 2: Dockerfile without project binary reports gap

**Given** a Dockerfile without the project binary installed, **When** `infra.validateDockerfile()` runs, **Then** it reports: "project binary not installed."

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:22-slim
RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*
USER node
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (1 issues)","gaps":[{"dimension":"infrastructure","description":"project binary not installed.","suggestedFix":"Add npm install -g, pip install, or COPY --from to install the project binary"}]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Gap reported: "project binary not installed." with appropriate suggested fix.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 3: Dockerfile with FROM node:latest reports unpinned image

**Given** a Dockerfile with `FROM node:latest`, **When** validated, **Then** it reports: "unpinned base image -- use specific version."

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:latest
RUN npm install -g test-project
RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*
USER node
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (1 issues)","gaps":[{"dimension":"infrastructure","description":"unpinned base image -- use specific version.","suggestedFix":"Pin node:latest to a specific version tag"}]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Gap reported: "unpinned base image -- use specific version."

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 4: Dockerfile passing all rules reports infrastructure pass

**Given** a Dockerfile that passes all rules, **When** validated, **Then** audit reports infrastructure status: pass.

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:22-slim
RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*
RUN npm install -g test-project
USER node
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"pass","metric":"Dockerfile valid","gaps":[]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Infrastructure status is "pass" with zero gaps and metric "Dockerfile valid".

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 5: Missing verification tool reports gap naming the tool

**Given** `patches/infra/dockerfile-rules.md` defines required verification tools (curl, jq), **When** a Dockerfile is missing one of these tools, **Then** `validateDockerfile()` reports a gap naming the missing tool.

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:22-slim
RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*
RUN npm install -g test-project
USER node
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (1 issues)","gaps":[{"dimension":"infrastructure","description":"verification tool missing: curl","suggestedFix":"Install curl via apt-get install or apk add"}]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Gap reported: "verification tool missing: curl" — names the specific missing tool.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 6: COPY src/ reports source code in container

**Given** a Dockerfile with `COPY src/ /app/src/`, **When** validated, **Then** it reports: "source code copied into container -- use build artifact instead."

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:22-slim
COPY src/ /app/src/
RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*
RUN npm install -g test-project
USER node
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (1 issues)","gaps":[{"dimension":"infrastructure","description":"source code copied into container -- use build artifact instead.","suggestedFix":"Use COPY --from=builder or COPY dist/ instead of copying source"}]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Gap reported: "source code copied into container -- use build artifact instead."

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 7: No USER instruction reports gap

**Given** a Dockerfile with no `USER` instruction (running as root), **When** validated, **Then** it reports: "no non-root USER instruction found."

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:22-slim
RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*
RUN npm install -g test-project
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (1 issues)","gaps":[{"dimension":"infrastructure","description":"no non-root USER instruction found.","suggestedFix":"Add USER <non-root-user> instruction (e.g., USER node)"}]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Gap reported: "no non-root USER instruction found."

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 8: No cache cleanup reports gap

**Given** a Dockerfile with no cache cleanup, **When** validated, **Then** it reports: "no cache cleanup detected."

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:22-slim
RUN apt-get update && apt-get install -y curl jq
RUN npm install -g test-project
USER node
CMD ["test-project"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (1 issues)","gaps":[{"dimension":"infrastructure","description":"no cache cleanup detected.","suggestedFix":"Add cache cleanup: rm -rf /var/lib/apt/lists/*, npm cache clean --force, or pip cache purge"}]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — Gap reported: "no cache cleanup detected."

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 9: All 6 rule categories checked through audit coordinator

**Given** `checkInfrastructure()` in audit dimensions, **When** the new `validateDockerfile()` is integrated, **Then** all 6 rule categories are checked and gaps reported through the existing audit coordinator.

```bash
docker exec codeharness-verify sh -c 'cd /workspace && cat > Dockerfile << EOF
FROM node:latest
COPY src/ /app/src/
CMD ["node", "index.js"]
EOF
codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (7 issues)","gaps":[
  {"dimension":"infrastructure","description":"unpinned base image -- use specific version.","suggestedFix":"Pin node:latest to a specific version tag"},
  {"dimension":"infrastructure","description":"project binary not installed.","suggestedFix":"Add npm install -g, pip install, or COPY --from to install the project binary"},
  {"dimension":"infrastructure","description":"verification tool missing: curl","suggestedFix":"Install curl via apt-get install or apk add"},
  {"dimension":"infrastructure","description":"verification tool missing: jq","suggestedFix":"Install jq via apt-get install or apk add"},
  {"dimension":"infrastructure","description":"source code copied into container -- use build artifact instead.","suggestedFix":"Use COPY --from=builder or COPY dist/ instead of copying source"},
  {"dimension":"infrastructure","description":"no non-root USER instruction found.","suggestedFix":"Add USER <non-root-user> instruction (e.g., USER node)"},
  {"dimension":"infrastructure","description":"no cache cleanup detected.","suggestedFix":"Add cache cleanup: rm -rf /var/lib/apt/lists/*, npm cache clean --force, or pip cache purge"}
]}}}
```

(JSON truncated to infrastructure dimension; other dimensions omitted for brevity)

All 6 categories present:
1. **Pinned FROM** — "unpinned base image -- use specific version."
2. **Binary on PATH** — "project binary not installed."
3. **Verification tools** — "verification tool missing: curl" + "verification tool missing: jq" (2 gaps for 2 tools)
4. **No source copy** — "source code copied into container -- use build artifact instead."
5. **Non-root USER** — "no non-root USER instruction found."
6. **Cache cleanup** — "no cache cleanup detected."

**Result: [PASS]** — All 6 rule categories are checked and reported through the audit coordinator's infrastructure dimension.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## AC 10: Missing dockerfile-rules.md uses defaults with warning

**Given** no `patches/infra/dockerfile-rules.md` exists, **When** `validateDockerfile()` runs, **Then** it uses hardcoded defaults and reports a warning: "dockerfile-rules.md not found -- using defaults."

```bash
docker exec codeharness-verify sh -c 'rm -f /workspace/patches/infra/dockerfile-rules.md && cd /workspace && codeharness audit --json 2>&1'
```

```output
{"dimensions":{"infrastructure":{"name":"infrastructure","status":"warn","metric":"Dockerfile exists (8 issues)","gaps":[
  {"dimension":"infrastructure","description":"unpinned base image -- use specific version.","suggestedFix":"Pin node:latest to a specific version tag"},
  {"dimension":"infrastructure","description":"project binary not installed.","suggestedFix":"Add npm install -g, pip install, or COPY --from to install the project binary"},
  {"dimension":"infrastructure","description":"verification tool missing: curl","suggestedFix":"Install curl via apt-get install or apk add"},
  {"dimension":"infrastructure","description":"verification tool missing: jq","suggestedFix":"Install jq via apt-get install or apk add"},
  {"dimension":"infrastructure","description":"source code copied into container -- use build artifact instead.","suggestedFix":"Use COPY --from=builder or COPY dist/ instead of copying source"},
  {"dimension":"infrastructure","description":"no non-root USER instruction found.","suggestedFix":"Add USER <non-root-user> instruction (e.g., USER node)"},
  {"dimension":"infrastructure","description":"no cache cleanup detected.","suggestedFix":"Add cache cleanup: rm -rf /var/lib/apt/lists/*, npm cache clean --force, or pip cache purge"},
  {"dimension":"infrastructure","description":"dockerfile-rules.md not found -- using defaults.","suggestedFix":"Provide the missing configuration file"}
]}}}
```

(JSON truncated to infrastructure dimension for brevity)

**Result: [PASS]** — With Docker image rebuilt from current code, all 6 rule categories enforced with hardcoded defaults AND the warning "dockerfile-rules.md not found -- using defaults." is surfaced as a gap in the infrastructure dimension (8 issues total). Previous PARTIAL PASS was due to stale Docker image that lacked the warnings-to-gaps mapping.

[OBSERVABILITY GAP] No log events detected for this user interaction

---

## Summary

| AC | Description | Result |
|----|-------------|--------|
| 1 | dockerfile-rules.md lists required elements | **PASS** |
| 2 | Missing binary reports gap | **PASS** |
| 3 | FROM node:latest reports unpinned | **PASS** |
| 4 | Passing Dockerfile → infrastructure pass | **PASS** |
| 5 | Missing verification tool named | **PASS** |
| 6 | COPY src/ reports source code | **PASS** |
| 7 | No USER reports gap | **PASS** |
| 8 | No cache cleanup reports gap | **PASS** |
| 9 | All 6 categories via audit coordinator | **PASS** |
| 10 | Missing rules file uses defaults with warning | **PASS** |

**Overall: 10/10 PASS**

**Observability:** No log events were detected for any audit interaction. The audit command does not emit telemetry to VictoriaLogs. This is a systemic observability gap across all ACs.
