# Story 13.4: Verification Workflow Integration

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want harness-run to orchestrate the full verification lifecycle (build → prepare → verify → validate → cleanup),
So that verification is automated and never falls back to white-box approaches.

## Acceptance Criteria

1. **Given** harness-run reaches Step 3d for a story at `verifying`, **when** it executes verification, **then** it follows this exact sequence: (a) `npm run build` to ensure dist/ is current, (b) `codeharness verify-env build` to build/rebuild the Docker image if needed, (c) `docker run -d --name codeharness-verify --network host codeharness-verify sleep infinity` to start the container, (d) `codeharness verify-env prepare --story {story-key}` to create the clean workspace, (e) run verifier session via `claude --print` in the clean workspace, (f) copy the proof document back to the main project, (g) `codeharness verify --story {story-key}` to validate proof quality, (h) `codeharness verify-env cleanup --story {story-key}` to remove the temp workspace and container. (AC:1) <!-- verification: integration-required -->

2. **Given** `codeharness verify-env build` fails during Step 3d, **when** the error is caught, **then** the story remains at `verifying` status with a clear error message logged (e.g., `[FAIL] verify-env build failed: {error}`) and no fallback to white-box verification occurs — the old Agent-based verifier prompt is completely removed. (AC:2) <!-- verification: integration-required -->

3. **Given** the verifier session fails (non-zero exit code from `claude --print` or timeout), **when** harness-run processes the failure, **then** it retries the verification up to `max_retries` (3) times, updating Ralph's `.story_retries` file after each attempt. (AC:3) <!-- verification: integration-required -->

4. **Given** harness-run is about to start verification, **when** it checks infrastructure prerequisites, **then** it runs `codeharness status --check-docker` to verify the observability stack is running, and if it reports the stack is down, it calls `codeharness stack start` before proceeding with verification. (AC:4) <!-- verification: integration-required -->

5. **Given** the Docker container is started for verification, **when** `docker run` is invoked, **then** it uses `--network host` so the container can reach the OTEL Collector at `localhost:4318` and the verifier can query VictoriaLogs (`:9428`), VictoriaMetrics (`:8428`), and VictoriaTraces (`:16686`) at localhost. (AC:5) <!-- verification: integration-required -->

6. **Given** verification is running for a story, **when** the total elapsed time (including Docker setup, verifier session, and validation) exceeds 10 minutes, **then** the verification is terminated and treated as a failure (triggering retry logic per AC:3). (AC:6) <!-- verification: integration-required -->

7. **Given** a verification attempt occurs (success or failure), **when** the attempt completes, **then** Ralph's `.story_retries` file is updated to reflect the attempt count, and this count persists across sessions so that retry budgets are not reset by session boundaries. (AC:7) <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Rewrite harness-run Step 3d with the new verification flow (AC: 1, 2, 5, 6)
  - [x] 1.1: In `commands/harness-run.md`, replace the entire Step 3d section. Remove the Agent-based verifier prompt (the `Use the Agent tool with: subagent_type: "codeharness:verifier"` block and all associated instructions). Replace with the new orchestration flow defined in AC:1.
  - [x] 1.2: Add a pre-verification infrastructure check: run `codeharness status --check-docker` and if the observability stack is down, run `codeharness stack start` (AC:4).
  - [x] 1.3: Add `npm run build` as the first step to ensure `dist/` is current before building the Docker image.
  - [x] 1.4: Add `codeharness verify-env build` step. If this fails, log `[FAIL] verify-env build failed: {error}`, leave story at `verifying`, and go to Step 6 (failure handling). No fallback.
  - [x] 1.5: Add `docker run -d --name codeharness-verify --network host codeharness-verify sleep infinity` to start the container with host networking.
  - [x] 1.6: Add `codeharness verify-env prepare --story {story-key}` to create the clean workspace.
  - [x] 1.7: Add the verifier session invocation: `cd /tmp/codeharness-verify-{story-key} && claude --print --max-budget-usd 3 -p "{verification prompt}"`. The prompt comes from the verify-prompt template (story 13-3). Reference `spawnVerifierSession()` from `src/lib/verifier-session.ts` for the exact command construction.
  - [x] 1.8: After verifier completes, copy proof from temp workspace to `verification/{story-key}-proof.md` in the main project.
  - [x] 1.9: Run `codeharness verify --story {story-key}` to validate proof quality. Handle the same `pending`/`escalated` logic as the current Step 3d post-verification checks.
  - [x] 1.10: Run `codeharness verify-env cleanup --story {story-key}` to remove temp workspace and container. This must run even if verification fails (cleanup in a finally-equivalent block).
  - [x] 1.11: Add a 10-minute total timeout for the entire verification flow (AC:6). If exceeded, treat as failure.

- [x] Task 2: Add retry and .story_retries integration (AC: 3, 7)
  - [x] 2.1: In the rewritten Step 3d, if the verifier session fails (non-zero exit, timeout, proof not produced), increment `retry_count` and update `ralph/.story_retries` with the current attempt count for this story.
  - [x] 2.2: The `.story_retries` format should be read at the start of verification for the story (to restore retry count from previous sessions) and written after each attempt.
  - [x] 2.3: If `retry_count >= max_retries`, go to Step 6 (failure handling). Otherwise, retry the verification flow from the `codeharness verify-env prepare` step (the Docker image and container may be reused).

- [x] Task 3: Remove old Agent-based verifier (AC: 2)
  - [x] 3.1: Remove the entire old "Spawn the verifier subagent" block from Step 3d that uses `subagent_type: "codeharness:verifier"` and the Agent tool.
  - [x] 3.2: Remove the old "After the verifier completes" post-processing block that references `showboat verify`, `proofQuality.pending`, and in-session proof validation — these are replaced by the `codeharness verify --story {story-key}` CLI call.
  - [x] 3.3: Remove the old pre-verification `npm run test:unit` and `codeharness coverage` commands that ran in the main session. The new flow replaces this with `npm run build` (the verifier itself exercises the CLI via Docker, which is the real test).

- [x] Task 4: Update post-verification logic (AC: 1)
  - [x] 4.1: After `codeharness verify --story {story-key}` runs, parse its output/exit code. If proof quality passes (`pending === 0`, `escalated === 0`), update sprint-status.yaml to `done`.
  - [x] 4.2: If `escalated > 0`, log a warning and leave the story at `verifying` (blocked). The Step 2 skip logic already handles this.
  - [x] 4.3: If `pending > 0`, retry the verification (up to max_retries).
  - [x] 4.4: If the verifier made code fixes (detected by checking git diff after verification), run `npm run build && npm run test:unit` to confirm fixes haven't broken anything.

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). The harness-run skill file is the orchestration point — it calls CLI commands in sequence.
- **Two-layer isolation** (Architecture Decision 10). Clean workspace + Docker container. No source code in the verifier's filesystem.
- **No fallback to white-box.** The old Agent-based verifier that shared the host filesystem is completely removed. If the new flow fails, the story stays at `verifying` — it does not degrade to the old approach.
- **harness-run.md is a skill file (markdown).** It's instructions for Claude Code, not TypeScript. Changes are to the markdown document, not compiled code.

### Existing Code to Modify

| File | Change |
|------|--------|
| `commands/harness-run.md` | Rewrite Step 3d entirely — replace Agent-based verifier with CLI-orchestrated flow |

### Existing Code to Reuse (DO NOT MODIFY)

These were built in stories 13-1 and 13-3. This story only consumes them via CLI commands.

| File | Purpose |
|------|---------|
| `src/lib/verify-env.ts` | `buildVerifyImage()`, `prepareVerifyWorkspace()`, `cleanupVerifyEnv()`, `checkVerifyEnv()` |
| `src/lib/verifier-session.ts` | `spawnVerifierSession()`, `copyProofToProject()` |
| `src/templates/verify-prompt.ts` | Verification prompt template for `claude --print` |
| `src/lib/verify.ts` | `validateProofQuality()` with black-box enforcement |

### Key Design Decisions

1. **This is a skill-file-only change.** The TypeScript libraries were built in stories 13-1, 13-2, and 13-3. This story rewrites the harness-run markdown to orchestrate them. No new TypeScript code is needed.
2. **Cleanup must be unconditional.** `codeharness verify-env cleanup --story {story-key}` must run regardless of success or failure to prevent container/workspace accumulation.
3. **Retry budget persists via `.story_retries`.** Ralph's retry tracking file ensures that a story that fails verification 2 times in one session only gets 1 more attempt in the next session (given max_retries=3).
4. **`npm run build` replaces `npm run test:unit` as the pre-verification step.** The old flow ran unit tests before verification. The new flow builds first (because the Docker image needs current dist/), and the verifier itself exercises the CLI as the real test.
5. **10-minute timeout covers the entire flow.** Docker image build (cached: ~0s, uncached: ~30s), container start (~1s), workspace prep (~1s), verifier session (~5-8 min), validation (~5s), cleanup (~2s).

### Anti-Patterns to Avoid

- Do NOT keep any part of the old Agent-based verifier prompt as a fallback. The entire `Use the Agent tool with: subagent_type: "codeharness:verifier"` block must be removed.
- Do NOT run verification steps in parallel — they are sequential by design (build → prepare → verify → validate → cleanup).
- Do NOT skip cleanup on failure — leaked containers and temp directories accumulate.
- Do NOT reset `.story_retries` at the start of a session — the whole point is cross-session persistence.

### Dependencies

- Story 13-1 (`verify-env.ts`) — provides `buildVerifyImage`, `prepareVerifyWorkspace`, `cleanupVerifyEnv` — DONE
- Story 13-2 (documentation gate) — ensures docs exist before verification can run — DONE
- Story 13-3 (`verifier-session.ts`, `verify-prompt.ts`) — provides `spawnVerifierSession`, `copyProofToProject` — VERIFYING

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Epic 13, Story 13.4]
- [Source: _bmad-output/planning-artifacts/architecture.md, Architecture Decision 10 (Black-Box Verification)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 8 (CLI orchestrates verification)]
- [Source: commands/harness-run.md, Step 3d — being rewritten]
- [Source: src/lib/verify-env.ts — verify environment lifecycle]
- [Source: src/lib/verifier-session.ts — verifier session spawner]
- [Source: ralph/.story_retries — retry persistence file]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/13-4-verification-environment-sprint-workflow-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/13-4-verification-environment-sprint-workflow.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
