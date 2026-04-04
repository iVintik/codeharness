---
title: 'Document Task + Verification Workspace + TUI Fixes'
slug: 'document-task-verify-workspace-tui'
created: '2026-04-04'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Node.js', 'Ink (React TUI)', 'YAML workflows']
files_to_modify:
  - 'templates/workflows/default.yaml'
  - 'templates/agents/documenter.yaml'
  - 'templates/agents/evaluator.yaml'
  - 'src/lib/workflow-engine.ts'
  - 'src/lib/source-isolation.ts'
  - 'src/commands/run.ts'
  - 'src/lib/ink-renderer.tsx'
  - 'src/lib/ink-components.tsx'
  - 'src/lib/ink-workflow.tsx'
  - 'src/modules/verify/types.ts'
  - 'src/modules/verify/parser.ts'
  - 'src/modules/verify/parser-keywords.ts'
  - 'src/modules/verify/validation-runner.ts'
  - 'src/modules/verify/validation-acs.ts'
  - 'src/modules/verify/validation-ac-types.ts'
  - 'knowledge/verification-patterns.md'
  - 'templates/bmad-patches/story-template-patch.md'
  - 'templates/bmad-patches/code-review-patch.md'
  - 'templates/bmad-patches/dev-workflow-patch.md'
  - 'skills/verification-enforcement/references/verification-patterns.md'
  - 'skills/verification-enforcement/SKILL.md'
code_patterns:
  - 'Agent templates in templates/agents/*.yaml with prompt_template field'
  - 'Workflow tasks in templates/workflows/default.yaml'
  - 'Engine dispatches via dispatchTaskWithResult() in workflow-engine.ts'
  - 'Isolated workspace via createIsolatedWorkspace() in source-isolation.ts'
  - 'TUI rendering via Ink components in ink-*.tsx'
  - 'Output contracts stored at .codeharness/contracts/{task}-{story}.json'
test_patterns:
  - 'Vitest with vi.mock for engine tests'
  - 'ink-testing-library for TUI component tests'
---

# Tech-Spec: Document Task + Verification Workspace + TUI Fixes

**Created:** 2026-04-04

## Overview

### Problem Statement

The verification system is fundamentally broken:

1. **Verify workspace is empty** — evaluator gets `/tmp/codeharness-verify-{id}/` with empty `story-files/` and no context. It reports "no project files" and exits.
2. **No verification guide** — even with AC files, the evaluator doesn't know how to exercise the system.
3. **No runtime environment** — the isolated workspace has no way to execute anything. Even with guides, the evaluator can't import modules or call functions because there's nothing installed.
4. **Stale `test-provable` concept** — categorizes ACs by test method, conflating `check` (run tests) with `verify` (prove it works). Must be removed.
5. **TUI broken during epic phase** — sentinels leak, header duplicates, scrollback breaks fullscreen.

### Solution

1. **New `document` task** in story_flow — after review, reads the implementation and writes a verification guide explaining what was built and how to exercise it via Docker.
2. **Docker-based verification** — the evaluator gets Docker access to the running application. Everything testable is available as services/pages hosted by Docker or CLI commands runnable via `docker exec`. No local imports, no source access — Docker is the interface.
3. **Populate verify workspace** — engine collects document outputs and copies them into the verify workspace as story guides.
4. **Remove all `test-provable`/`VerificationTier`** code and references.
5. **Fix TUI** — translate epic sentinels, fix scrollback, fix header.

### Scope

**In Scope:**
- New documenter agent + document task in workflow
- Docker-based verification model (evaluator uses docker exec/curl/docker logs)
- Engine: collect document outputs → populate verify workspace
- Remove test-provable/VerificationTier everywhere
- Update evaluator prompt for Docker-based guide verification
- Fix TUI: sentinel display, header duplication, scrollback, epic context

**Out of Scope:**
- Docker image building (assumes project already has Dockerfile/docker-compose)
- Loop retry logic changes
- Retro implementation
- Parallel execution

## Context for Development

### Codebase Patterns

- Agent templates: `templates/agents/*.yaml` with `name`, `role`, `persona`, `prompt_template`
- Workflow: `templates/workflows/default.yaml` with `story_flow` and `epic_flow`
- Engine dispatch: `dispatchTaskWithResult()` stores output in contracts at `.codeharness/contracts/{task}-{story}.json`
- Contract format: `{ version, taskName, storyId, output, changedFiles, ... }` — latest write wins (no versioning)
- Isolated workspace: `createIsolatedWorkspace({ runId, storyFiles: string[] })` copies files into `/tmp/codeharness-verify-{runId}/story-files/`
- TUI: Ink React components, `startRenderer()` returns handle, `onEvent` callback bridges engine→TUI
- Prompt templates: raw strings, no variable interpolation by the engine — the agent receives the prompt as-is

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `templates/workflows/default.yaml` | Add document task |
| `templates/agents/evaluator.yaml` | Update prompt for Docker-based verification |
| `src/lib/source-isolation.ts` | Workspace creation (accepts file paths) |
| `src/lib/workflow-engine.ts` | Collect document outputs, pass to workspace |
| `src/commands/run.ts` | TUI event bridge, epic sentinel translation |
| `src/lib/ink-renderer.tsx` | Scrollback fix |
| `src/lib/ink-components.tsx` | Epic display fix |
| `src/modules/verify/types.ts` | VerificationTier to remove |
| `src/modules/verify/parser.ts` | Tier classification to remove |
| `src/modules/verify/parser-keywords.ts` | Tier keywords to remove |
| `src/modules/verify/validation-runner.ts` | Tier refs to remove |
| `src/modules/verify/validation-acs.ts` | test-provable refs to remove |
| `src/modules/verify/validation-ac-types.ts` | Tier mapping to remove |
| `templates/bmad-patches/*.md` | Showboat/test-provable refs to remove |

### Technical Decisions

- **Docker is the verification interface** — evaluator exercises the system exclusively through Docker. `docker exec` to run commands inside the container, `curl` to hit APIs, `docker logs` to check output. No local Python/Node imports.
- **Guides must contain copy-pasteable commands** — not vague descriptions. Each AC maps to an exact `docker exec <container> <command>` with expected output. A bad guide = useless verification.
- **Container name discovery** — the documenter runs `docker ps` or reads `docker-compose.yml` to find the running container name. It includes the container name in every command in the guide. The engine can also pass it via dispatch prompt from harness state.
- **Docker must be running before verify** — pre-condition. The engine's existing Docker pre-flight check ensures the daemon is up. The project's containers must be running (started by the project, not the engine). If containers aren't running, verify reports UNKNOWN.
- **For internal code with no API/UI** — the documenter writes `docker exec <container> python -c "from app.module import Class; c = Class(); c.method(); print('PASS')"` commands. The evaluator runs these blind inside the container.
- **For API epics** — the documenter writes `curl http://localhost:8000/api/endpoint -d '...'` commands with expected response bodies/status codes.
- **Document task uses Opus** — needs deep understanding of what was built to translate source into Docker-executable verification steps.
- **Document output format** — prose with embedded commands per AC. Structure: AC description → `docker exec` or `curl` command → expected output. Not raw JSON, not vague prose.
- **Only document outputs go in verify workspace** — not raw story files, not source code.
- **Contracts overwrite on same key** — in retry loops, the latest `document-{story}.json` wins. Engine always reads the latest.
- **No `{storyKey}` interpolation in prompts** — the engine sends story context via the dispatch prompt, not via template vars.

## Implementation Plan

### Tasks

- [ ] Task 1: Remove test-provable concept
  - File: `src/modules/verify/types.ts`
  - Action: Remove `VerificationTier` type, `VERIFICATION_TIERS` array, `highestTier()`, `LEGACY_TIER_MAP`
  - File: `src/modules/verify/parser-keywords.ts`
  - Action: Remove `TEST_PROVABLE_KEYWORDS`, `RUNTIME_PROVABLE_KEYWORDS`, `ENVIRONMENT_PROVABLE_KEYWORDS`, `ESCALATE_TIER_KEYWORDS`
  - File: `src/modules/verify/parser.ts`
  - Action: Remove `classifyTier()` function and tier-related imports
  - File: `src/modules/verify/validation-runner.ts`
  - Action: Remove tier references in comments/logic
  - File: `src/modules/verify/validation-acs.ts`
  - Action: Remove `test-provable` references
  - File: `src/modules/verify/validation-ac-types.ts`
  - Action: Remove tier mapping comments
  - File: `templates/bmad-patches/story-template-patch.md`
  - Action: Remove "Showboat proof document" and "showboat verify" lines
  - File: `templates/bmad-patches/code-review-patch.md`
  - Action: Remove Showboat proof check lines
  - File: `templates/bmad-patches/dev-workflow-patch.md`
  - Action: Remove `/harness-verify` Showboat reference
  - File: `knowledge/verification-patterns.md`
  - Action: Rewrite — remove tier categories, describe Docker-based verification
  - File: `skills/verification-enforcement/references/verification-patterns.md`
  - Action: Remove showboat exec examples, rewrite for Docker-based approach
  - File: `skills/verification-enforcement/SKILL.md`
  - Action: Update to reflect new verification model
  - Notes: Fix/remove tests in `src/modules/verify/__tests__/` that assert tier behavior. Grep for `VerificationTier`, `test-provable`, `classifyTier`, `TEST_PROVABLE_KEYWORDS` in test files.

- [ ] Task 2: Create documenter agent
  - File: `templates/agents/documenter.yaml` (NEW)
  - Action: Create agent with:
    - name: documenter
    - role: Verification Guide Writer
    - source_access: true (reads implementation to understand it)
    - disallowedTools: none (needs full read access)
    - prompt_template: Instructs the agent to:
      1. Read the story spec and the implementation source
      2. Discover the Docker container name (run `docker ps` or read `docker-compose.yml`)
      3. Write a verification guide with this exact structure per AC:
         ```
         ## AC N: [description]
         ### Command
         docker exec <container> python -c "from app.module import X; x = X(); result = x.method(); assert result == expected; print('PASS: description')"
         ### Expected Output
         PASS: description
         ### What This Proves
         [one sentence explaining why this output satisfies the AC]
         ```
      4. For API features, use `curl` instead of `docker exec python`
      5. Every command must be copy-pasteable — no pseudocode, no "replace X with Y"
      6. Include a "## Prerequisites" section listing: container name, required services, any setup steps
    - The prompt does NOT use `{storyKey}` — the engine's dispatch prompt provides story context

- [ ] Task 3: Add document task to workflow
  - File: `templates/workflows/default.yaml`
  - Action: Add `document` task (agent: documenter, session: fresh, source_access: true, model: claude-opus-4-6). Update flows:
    ```yaml
    story_flow: [create-story, implement, check, review, document]
    epic_flow: [story_flow, verify, loop: [retry, check, review, document, verify], retro]
    ```
  - Notes: Update `src/lib/__tests__/default-workflow.test.ts` and `src/lib/__tests__/embedded-agent-templates.test.ts`

- [ ] Task 4: Engine collects document outputs for verify workspace
  - File: `src/lib/workflow-engine.ts`
  - Action: In the epic_flow verify/epic-task dispatch path:
    1. Before calling `createIsolatedWorkspace`, collect guide files:
    2. For each story in `epicItems`, check if contract exists at `{projectDir}/.codeharness/contracts/document-{story.key}.json`
    3. Read the contract, extract `output` field (string — the verification guide)
    4. Write to `{projectDir}/.codeharness/verify-guides/{story.key}-guide.md` (project-local, not /tmp — cleaned up after verify)
    5. Collect all guide paths into array
    6. Pass to `createIsolatedWorkspace({ runId, storyFiles: guidePaths })`
    7. After verify completes (success or error), clean up `verify-guides/` directory
  - File: `src/lib/source-isolation.ts`
  - Action: No changes needed — already accepts file paths and copies them

- [ ] Task 5: Update evaluator prompt for Docker-based verification
  - File: `templates/agents/evaluator.yaml`
  - Action: Rewrite prompt_template:
    - Primary instruction: "Read verification guides from ./story-files/. Each guide explains what was built and how to verify it."
    - Verification method: "Use `docker exec`, `docker logs`, `curl`, and other Docker/HTTP commands as described in the guides. Every AC must be verified by running a command and observing output."
    - Keep: `disallowedTools: [Edit, Write]` — evaluator observes, doesn't modify
    - Exception: evaluator CAN write to `./verdict/verdict.json` (already excluded from disallowed since it's the output location)
    - Keep: blind principle, JSON output format, anti-leniency rules
    - Remove: "runtime observation only" (replaced by Docker-based commands)
    - Add: "If Docker is not running or the app container is not available, report all ACs as UNKNOWN with reason 'Docker not available'."
  - Notes: The evaluator CANNOT `Write` files or `Edit` source. It CAN run Bash commands (docker exec, curl). This is enforced by `disallowedTools`.

- [ ] Task 6: Fix TUI
  - File: `src/commands/run.ts`
  - Action: In dispatch-start handler, when `event.storyKey` starts with `__epic_`, translate for display:
    ```typescript
    const displayStoryKey = event.storyKey.startsWith('__epic_')
      ? `Epic ${event.storyKey.replace('__epic_', '').replace('__', '')}`
      : event.storyKey;
    ```
    Pass `displayStoryKey` to `updateSprintState({ storyKey: displayStoryKey, ... })`
  - File: `src/commands/run.ts`
  - Action: When in epic phase, update story context to show epic summary instead of individual story prev/next
  - File: `src/lib/ink-renderer.tsx`
  - Action: Before Ink mount, clear screen with `process.stdout.write('\x1B[2J\x1B[H')` (clear screen + cursor home, NOT `\x1Bc` which resets terminal state and breaks tmux)
  - File: `src/lib/ink-components.tsx`
  - Action: In `Header`, verify cost updates rerender in-place via Ink's normal diffing (no special fix needed if `patchConsole` is true and no bare `console.log` leaks)

### Acceptance Criteria

- [ ] AC 1: Given a story that passed check+review, when the engine runs `document` task, then a verification guide is produced containing: what was built, Docker commands to exercise it, expected behavior per AC.
- [ ] AC 2: Given an epic with 4 stories through story_flow+document, when verify runs, then the isolated workspace `story-files/` contains 4 `.md` guide files with Docker-based verification steps.
- [ ] AC 3: Given an epic with document contracts for stories, when the engine prepares the verify workspace, then it reads `.codeharness/contracts/document-{key}.json`, extracts output, and passes guide paths to `createIsolatedWorkspace`.
- [ ] AC 4: Given the evaluator in the verify workspace with guides, when it reads a guide, then the guide contains `docker exec` or `curl` commands (not Python imports or npm test).
- [ ] AC 5: Given `grep -r "test-provable" src/ templates/ knowledge/ skills/`, when run after cleanup, then zero matches returned.
- [ ] AC 6: Given `grep -r "VerificationTier" src/`, when run after cleanup, then zero matches returned.
- [ ] AC 7: Given the TUI during epic-level verify, when event.storyKey is `__epic_3__`, then TUI shows "Epic 3" not the raw sentinel.
- [ ] AC 8: Given `codeharness run` launched from terminal, when TUI mounts, then user cannot scroll above the TUI frame.
- [ ] AC 9: Given the default workflow, when parsed, then story_flow is `[create-story, implement, check, review, document]` and epic_flow loop contains `[retry, check, review, document, verify]`.
- [ ] AC 10: Given a retry loop where document runs again for a story, when verify reads the contract, then it gets the latest guide (contract overwrite semantics).

## Additional Context

### Dependencies

- Docker must be running for verify to work (pre-flight check already exists in run.ts)
- Project must have a Dockerfile or docker-compose that builds and runs the app
- Existing contract system (`.codeharness/contracts/*.json`)
- Existing `createIsolatedWorkspace` in source-isolation.ts

### Testing Strategy

- Unit: contract collection logic — mock fs, verify correct paths constructed from epicItems
- Unit: guide file cleanup after verify completes
- Unit: evaluator prompt no longer references test-provable
- Unit: grep for VerificationTier/test-provable returns zero matches
- Integration: engine runs document task, output appears in contract
- TUI: render tests verify no `__epic_` in output, verify `\x1B[2J\x1B[H` sent before mount
- Default workflow test: verify story_flow has 5 tasks, epic_flow loop has 5 tasks

### Notes

- **Docker is mandatory for verify** — if the project doesn't have Docker, verify reports UNKNOWN for all ACs. This is correct — you can't blind-verify without a running system.
- **The document task is the bridge** — it reads source (has access), understands what was built, and translates that into Docker-executable verification steps. The evaluator never sees source — only the Docker commands from the guide.
- **For internal code (no API/UI)**: the documenter writes `docker exec app-container python -c "from app.hooks import HookRegistry; r = HookRegistry(); ..."` commands. The evaluator runs these blind.
- **For API epics**: the documenter writes `curl http://localhost:8000/api/endpoint` commands with expected responses.
- **Cost**: document task runs Opus per story. In a 10-story epic, that's 10 Opus calls (~$2-5 per story). No budget cap specified — the guide quality is critical and Opus is worth it.
- **Retry semantics**: contracts overwrite on same task+story key. The engine reads `.codeharness/contracts/document-{key}.json` �� if retry produces a new guide, the file is overwritten. The engine always reads the latest.
