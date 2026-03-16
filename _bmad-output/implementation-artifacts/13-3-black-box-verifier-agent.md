# Story 13.3: Black-Box Verifier Agent & Session

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the verifier to run as a separate Claude Code session in a clean workspace with no source code,
So that verification proves features work from the user's perspective.

## Acceptance Criteria

1. **Given** harness-run reaches Step 3d for a story at `verifying`, **when** it spawns the verifier, **then** it launches a separate Claude Code process via `cd /tmp/codeharness-verify-{story-key} && claude --print --max-budget-usd 3 -p "Verify story {story-key}. [verification prompt]"` — NOT as an in-session subagent (which would share the host filesystem). (AC:1) <!-- verification: integration-required -->

2. **Given** the verifier process is spawned, **when** the verification prompt is constructed, **then** it includes: the story's acceptance criteria (from story.md in the clean workspace), the Docker container name (`codeharness-verify`), observability endpoints (VictoriaLogs `:9428`, VictoriaMetrics `:8428`, VictoriaTraces `:16686`), instructions to read `README.md` for usage guidance, and an explicit instruction that ALL CLI commands must run via `docker exec codeharness-verify ...`. (AC:2) <!-- verification: integration-required -->

3. **Given** the verifier session is running, **when** it attempts to access files, **then** it operates in `/tmp/codeharness-verify-{story-key}/` which has NO source code — the agent physically cannot grep `src/` because the directory does not exist. (AC:3) <!-- verification: cli-verifiable -->

4. **Given** the verifier session is executing, **when** it verifies each AC, **then** it runs commands inside the Docker container via `docker exec codeharness-verify ...` and captures the output as proof evidence. (AC:4) <!-- verification: integration-required -->

5. **Given** the verifier needs runtime evidence, **when** it queries observability, **then** it uses `curl localhost:9428/...` (VictoriaLogs), `curl localhost:8428/...` (VictoriaMetrics), or `curl localhost:16686/...` (VictoriaTraces) to obtain traces, logs, and metrics as evidence. (AC:5) <!-- verification: integration-required -->

6. **Given** the verifier session completes, **when** the proof document has been written, **then** it exists at `/tmp/codeharness-verify-{story-key}/verification/{story-key}-proof.md` inside the temp workspace. (AC:6) <!-- verification: cli-verifiable -->

7. **Given** the verifier session has completed successfully, **when** harness-run resumes after the `claude --print` call returns, **then** it copies the proof document from the temp workspace back to the main project's `verification/` directory. (AC:7) <!-- verification: integration-required -->

8. **Given** a proof document is submitted for validation, **when** `validateProofQuality()` runs, **then** it rejects proofs where >50% of evidence commands are `grep` against `src/` and requires at least one `docker exec` command per AC. (AC:8) <!-- verification: cli-verifiable -->

9. **Given** the verifier cannot make a feature work from docs + CLI alone, **when** the feature or docs are broken, **then** it reports a REAL failure with specific details about what didn't work — it does not fabricate passing evidence. (AC:9) <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Create verification prompt template (AC: 2)
  - [x] 1.1: Create `src/templates/verify-prompt.ts` as a TypeScript string literal template (per Architecture Decision 6). The template accepts: `storyKey`, `storyContent` (full story.md text), `containerName` (default `codeharness-verify`), `observabilityEndpoints` (VictoriaLogs, VictoriaMetrics, VictoriaTraces URLs).
  - [x] 1.2: The prompt template must include explicit sections: (a) story ACs extracted from story content, (b) container name and `docker exec` usage instructions, (c) observability endpoint URLs and example `curl` commands, (d) instruction to read `README.md` first for install/usage guidance, (e) rule that ALL commands run via `docker exec {containerName} ...`, (f) proof output path `verification/{storyKey}-proof.md`.
  - [x] 1.3: The prompt must instruct the verifier to report REAL failures when features don't work — never fabricate evidence.
  - [x] 1.4: The prompt must explicitly state that no source code is available and explain why (black-box verification).

- [x] Task 2: Create verifier session spawner (AC: 1, 6, 7)
  - [x] 2.1: Create `src/lib/verifier-session.ts` with a `spawnVerifierSession(options)` function. Options: `storyKey`, `projectDir`, `maxBudgetUsd` (default 3), `timeoutMs` (default 600_000 = 10 min).
  - [x] 2.2: The function must: (a) resolve the clean workspace path (`/tmp/codeharness-verify-{storyKey}/`), (b) verify the workspace exists (error if not — `prepareVerifyWorkspace` must be called first), (c) read `story.md` from the workspace, (d) build the verification prompt from the template, (e) spawn `claude` as a child process via `execFileSync` or `spawnSync` with `cwd` set to the workspace path.
  - [x] 2.3: The `claude` invocation must use: `claude --print --max-budget-usd {budget} -p "{prompt}"`. The `--print` flag ensures non-interactive mode. The `cwd` must be the clean workspace so the verifier's filesystem root is isolated.
  - [x] 2.4: After the process completes, check for the proof file at `{workspace}/verification/{storyKey}-proof.md`. Return a result object with: `success` (boolean), `proofPath` (string or null), `exitCode` (number), `output` (stdout string), `duration` (ms).
  - [x] 2.5: Add `copyProofToProject(storyKey, workspace, projectDir)` function that copies the proof document from the temp workspace to `{projectDir}/verification/{storyKey}-proof.md`. Creates the `verification/` directory if needed.

- [x] Task 3: Update `validateProofQuality()` for black-box enforcement (AC: 8)
  - [x] 3.1: In `src/lib/verify.ts`, add a new function `classifyEvidenceCommands(proofContent: string)` that extracts all command strings from evidence blocks (```bash, ```shell, `showboat exec`, `docker exec` patterns) and classifies each as: `docker-exec` (contains `docker exec`), `observability` (contains `curl localhost:9428`, `curl localhost:8428`, `curl localhost:16686`), `grep-src` (contains `grep` AND `src/`), `other`.
  - [x] 3.2: Update `validateProofQuality()` to call `classifyEvidenceCommands()` and add two new rejection criteria: (a) if `grep-src` commands constitute >50% of total evidence commands, reject with a message indicating the proof relies too heavily on source code inspection; (b) for each AC section, if zero `docker-exec` commands are found, flag that AC as having insufficient functional evidence.
  - [x] 3.3: Add new fields to `ProofQuality` interface: `grepSrcCount: number`, `dockerExecCount: number`, `observabilityCount: number`, `otherCount: number`, `blackBoxPass: boolean`.
  - [x] 3.4: The `passed` field in `ProofQuality` must now also require `blackBoxPass === true` (in addition to existing `pending === 0 && verified > 0`).

- [ ] Task 4: Update harness-run Step 3d to use verifier session (AC: 1, 7) — DEFERRED to story 13-4
  - [ ] 4.1: In `commands/harness-run.md`, rewrite Step 3d to replace the in-session Agent-based verifier with the new flow: (a) call `codeharness verify-env prepare --story {story-key}` to create clean workspace, (b) start the Docker container via `docker run -d --name codeharness-verify --network host codeharness-verify sleep infinity`, (c) spawn the verifier via `claude --print` in the clean workspace, (d) after completion, copy the proof back to the project, (e) validate proof quality via `codeharness verify --story {story-key}`, (f) clean up via `codeharness verify-env cleanup --story {story-key}`.
  - [ ] 4.2: The old Agent-based verifier prompt (current Step 3d) must be entirely replaced — no fallback to in-session verification.

- [x] Task 5: Unit tests (AC: 2, 3, 6, 8)
  - [x] 5.1: Test verification prompt template includes all required sections (ACs, container name, observability endpoints, README instruction, docker exec rule).
  - [x] 5.2: Test `classifyEvidenceCommands()` correctly classifies: `docker exec` commands, `curl localhost:9428` commands, `grep src/` commands, and other commands.
  - [x] 5.3: Test `validateProofQuality()` rejects proofs where >50% of commands are `grep src/`.
  - [x] 5.4: Test `validateProofQuality()` rejects proofs with zero `docker exec` per AC.
  - [x] 5.5: Test `validateProofQuality()` passes proofs with adequate `docker exec` and observability evidence.
  - [x] 5.6: Test `ProofQuality` interface includes new black-box fields.
  - [x] 5.7: Test `spawnVerifierSession()` constructs correct `claude` command arguments (mock `execFileSync`).
  - [x] 5.8: Test `copyProofToProject()` copies proof file correctly and creates directories.
  - [x] 5.9: Test that clean workspace at `/tmp/codeharness-verify-{key}/` does NOT contain `src/` (integration with `prepareVerifyWorkspace` from story 13-1).

- [ ] Task 6: Integration tests (AC: 1, 4, 5, 7, 9) — Requires Docker + claude CLI, not runnable in unit test context
  - [ ] 6.1: Test full verifier session lifecycle: prepare workspace → spawn `claude --print` → copy proof back (requires `claude` CLI and Docker).
  - [ ] 6.2: Test that verifier running in clean workspace cannot access source code (verify `src/` is absent).
  - [ ] 6.3: Test proof document is written to correct path in temp workspace.
  - [ ] 6.4: Test proof copy from temp workspace to project `verification/` directory.

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). The CLI spawns the verifier as a separate process — no in-session subagent delegation.
- **Two-layer isolation** (Architecture Decision 10, Black-Box Verification). Clean workspace prevents source code access. Docker container protects the host. OTEL telemetry flows from container to host stack.
- **All templates are TypeScript string literals** (Architecture Decision 6). The verification prompt template lives in `src/templates/verify-prompt.ts`.
- **Separate process, not subagent**: `claude --print` runs in a subprocess with `cwd` set to the clean workspace. This is fundamentally different from the Agent tool — the Agent tool shares the host filesystem. The subprocess has a completely different filesystem view.

### Existing Code to Modify

| File | Change |
|------|--------|
| `src/lib/verify.ts` | Add `classifyEvidenceCommands()`, update `validateProofQuality()` with black-box enforcement, extend `ProofQuality` interface |
| `commands/harness-run.md` | Rewrite Step 3d to use `claude --print` in clean workspace instead of Agent tool |

### New Files

| File | Purpose |
|------|---------|
| `src/templates/verify-prompt.ts` | Verification prompt template for `claude --print` (TypeScript string literal) |
| `src/lib/verifier-session.ts` | Verifier session spawner — builds prompt, runs `claude --print`, copies proof |
| `src/lib/__tests__/verifier-session.test.ts` | Unit tests for verifier session |
| `src/lib/__tests__/verify-blackbox.test.ts` | Unit tests for black-box proof validation |

### Existing Code to Reuse

- `prepareVerifyWorkspace()` from `src/lib/verify-env.ts` — creates the clean workspace (story 13-1)
- `cleanupVerifyEnv()` from `src/lib/verify-env.ts` — removes workspace and container
- `validateProofQuality()` from `src/lib/verify.ts` — being extended with black-box checks
- `ok()`, `fail()`, `warn()`, `info()` from `src/lib/output.ts` — standard CLI output helpers
- `isValidStoryKey()` from `src/lib/verify-env.ts` — story key validation
- `execFileSync`, `spawnSync` from `node:child_process` — process spawning

### Key Design Decisions

1. **`claude --print` subprocess, not Agent tool.** The Agent tool shares the host filesystem — the verifier could browse anywhere. A subprocess with `cwd` set to `/tmp/codeharness-verify-{key}/` gives the verifier a restricted filesystem view. The `--print` flag ensures non-interactive mode with stdout capture.
2. **`--max-budget-usd 3` default.** Verification should be bounded. 3 USD is enough for a thorough verification of one story. Configurable via the spawner options.
3. **Evidence command classification is additive.** The existing `validateProofQuality()` still checks AC section structure and evidence presence. The new `classifyEvidenceCommands()` adds a second gate that checks evidence *quality* (functional vs. grep).
4. **harness-run.md is the integration point.** The CLI library (`verifier-session.ts`) provides the mechanics. The harness-run command document orchestrates the full flow: prepare → container → verify → copy → validate → cleanup.
5. **Failure = real signal.** If the verifier can't exercise a feature via `docker exec` + docs, that's a documentation or packaging bug. The verifier must report the specific failure, not produce fake evidence.

### Anti-Patterns to Avoid

- Do NOT fall back to in-session Agent-based verification. The entire point of this story is eliminating shared filesystem access.
- Do NOT pass source code paths in the verification prompt. The prompt references only: story.md, README.md, container name, observability endpoints.
- Do NOT trust the verifier's self-assessment — `validateProofQuality()` independently classifies evidence.
- Do NOT allow `grep src/` as primary evidence. The classification must reject it structurally.
- Do NOT hardcode the `claude` binary path — use PATH resolution via `execFileSync('claude', [...])`.
- Do NOT set a timeout shorter than 10 minutes — Docker exec commands can be slow on first run.

### Evidence Model (from Architecture Decision 10)

| Tier | Type | Example |
|------|------|---------|
| PRIMARY | `docker exec` exercising CLI | `docker exec codeharness-verify codeharness init --json` |
| PRIMARY | Observability query | `curl localhost:9428/select/logsql/query?query=...` |
| SUPPLEMENTARY | showboat verify reproducibility | `showboat verify proof.md` |
| REJECTED | grep against source code | `grep -n 'pattern' src/lib/foo.ts` |
| REJECTED | Unit test output as primary evidence | `npm run test:unit` alone |

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Epic 13, Story 13.3]
- [Source: _bmad-output/planning-artifacts/architecture.md, Architecture Decision 10 (Black-Box Verification)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 6 (TypeScript string literal templates)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 8 (CLI orchestrates verification)]
- [Source: _bmad-output/planning-artifacts/prd.md, FR83, FR84]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-16.md, Story 13.3]
- [Source: src/lib/verify.ts, validateProofQuality() — function being extended]
- [Source: src/lib/verify-env.ts, prepareVerifyWorkspace(), cleanupVerifyEnv() — dependencies from story 13-1]
- [Source: commands/harness-run.md, Step 3d — being rewritten]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/13-3-black-box-verifier-agent.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/13-3-black-box-verifier-agent.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
