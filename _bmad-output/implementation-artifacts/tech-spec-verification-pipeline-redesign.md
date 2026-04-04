---
title: 'Verification Pipeline Redesign — Loops, Deploy, Negotiate, Subjective Eval'
slug: 'verification-pipeline-redesign'
created: '2026-04-04'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Node.js', 'Ink TUI', 'YAML workflows', 'Docker']
files_to_modify:
  - 'templates/workflows/default.yaml'
  - 'templates/agents/documenter.yaml'
  - 'templates/agents/evaluator.yaml'
  - 'templates/agents/deployer.yaml'
  - 'templates/agents/negotiator.yaml'
  - 'src/lib/workflow-engine.ts'
  - 'src/lib/verdict-parser.ts'
  - 'src/lib/source-isolation.ts'
  - 'src/commands/run.ts'
  - 'src/lib/__tests__/default-workflow.test.ts'
  - 'src/lib/__tests__/embedded-agent-templates.test.ts'
  - 'src/lib/__tests__/workflow-engine.test.ts'
code_patterns:
  - 'story_flow skips loops: typeof !== string → continue (line 1331)'
  - 'executeLoopBlock() is generic — takes workItems[], works at any level'
  - 'Loop exit: parseVerdict() validates against verdict.schema.json (requires score, findings with evidence)'
  - 'Dispatch prompt: taskName switch at line ~545 in dispatchTaskWithResult()'
  - 'Contract storage: .codeharness/contracts/{task}-{story}.json'
  - 'Previous task output injected via buildPromptWithContractContext()'
test_patterns:
  - 'Vitest, vi.mock for engine tests'
  - 'makeWorkflow helper auto-splits storyFlow/epicFlow with epicTasks param'
  - '~4944 existing tests across 188 files'
---

# Tech-Spec: Verification Pipeline Redesign

**Created:** 2026-04-04

## Overview

### Problem Statement

1. **No loops in story_flow** — check+review can fail but there's no retry within the story pipeline. The engine skips loop blocks in story_flow.
2. **No AC negotiation** — ACs written without QA review for testability.
3. **No deploy stage** — no task provides a running Docker environment for blind verification.
4. **Documenter writes Docker commands** instead of user documentation.
5. **Verification is binary** — no subjective quality assessment alongside AC pass/fail.

### Solution

**story_flow** (per-story, with generic loops):
```yaml
- create-story
- negotiate-acs
- loop: [create-story, negotiate-acs]
- implement
- check
- review
- loop: [retry, check, review]
- document
```

**epic_flow** (per-epic):
```yaml
- story_flow
- deploy
- verify
- loop: [retry, document, deploy, verify]
- retro
```

### Scope

**In Scope:** Generic loop support in story_flow, 2 new agents, 2 agent rewrites, workflow update, engine changes, verdict parser update.

**Out of Scope:** Playwright MCP, parallel execution, retro changes.

## Context for Development

### Key Technical Facts

- `executeLoopBlock()` is generic — works with any `workItems[]`.
- Loop exit: `parseVerdict()` validates against `verdict.schema.json` requiring `verdict`, `score`, `findings`. Need to either relax this or make non-evaluator loop tasks output full verdict.
- Previous task output is injected into next task's prompt via `buildPromptWithContractContext()` — this means the negotiate loop's create-story WILL see negotiator feedback automatically.
- Docker is a hard requirement for deploy+verify. Non-Docker projects: deploy reports "no Docker config found", verify reports all ACs as UNKNOWN.

### Anthropic Harness Principles

1. **Sprint contract** — negotiate ACs before implementation
2. **Separate builder from judge**
3. **Multi-dimensional rubric** with calibrated anchors:
   - 1 = broken/missing, 2 = works but poor, 3 = acceptable, 4 = good, 5 = excellent

## Implementation Plan

### Tasks

- [ ] **Task 1: Generic loop support in story_flow**
  - File: `src/lib/workflow-engine.ts`, line ~1329-1331
  - Replace `if (typeof storyStep !== 'string') continue;` with:
    ```typescript
    if (isLoopBlock(storyStep)) {
      const loopResult = await executeLoopBlock(
        storyStep, state, config, [item], lastOutputContract, storyFlowTasks
      );
      state = loopResult.state;
      errors.push(...loopResult.errors);
      tasksCompleted += loopResult.tasksCompleted;
      lastOutputContract = loopResult.lastContract;
      if (loopResult.halted || state.phase === 'max-iterations' || state.phase === 'circuit-breaker') {
        halted = true; break;
      }
      continue;
    }
    if (typeof storyStep !== 'string') continue;
    ```

- [ ] **Task 2: Relax verdict parser for lightweight verdicts**
  - File: `src/lib/verdict-parser.ts`
  - Problem: `parseVerdict()` requires full EvaluatorVerdict schema (score, findings with evidence). Non-evaluator tasks (negotiator, review) can't produce this format naturally.
  - Solution: Add `parseSimpleVerdict(output: string): { verdict: 'pass' | 'fail' } | null` that extracts just the verdict field from JSON in the output. Falls back gracefully.
  - Update `executeLoopBlock()`: try `parseVerdict()` first (full schema), fall back to `parseSimpleVerdict()`. This way evaluator loops get full verdict parsing, and negotiate/review loops get lightweight parsing.
  - The negotiator outputs: `{"verdict": "pass"}` or `{"verdict": "fail", "issues": ["AC 3 is untestable because..."]}`
  - The review loop's last task (review) outputs: `{"verdict": "pass"}` or `{"verdict": "fail", "issues": ["Missing error handling in..."]}` — reviewer prompt updated to include verdict output.

- [ ] **Task 3: Create negotiator agent**
  - File: `templates/agents/negotiator.yaml` (NEW)
  - name: negotiator
  - role: AC Testability Reviewer
  - source_access: true
  - model: claude-sonnet-4-6 (not codex — needs to understand testability deeply)
  - prompt_template: Review each AC for blind testability. For each AC: can a QA agent with only Docker access + user docs verify this? Output JSON: `{"verdict": "pass"}` if all testable, `{"verdict": "fail", "issues": ["AC N: reason, suggested rewrite"]}` if not.
  - Notes: Previous task output (create-story) is automatically injected via `buildPromptWithContractContext`, so the negotiator sees the story spec.

- [ ] **Task 4: Create deployer agent**
  - File: `templates/agents/deployer.yaml` (NEW)
  - name: deployer
  - role: Environment Provisioner
  - model: claude-sonnet-4-6
  - source_access: true
  - prompt_template:
    1. Check for Docker config (docker-compose.yml, Dockerfile). If none found, output `{"status": "no-docker", "message": "No Docker configuration found"}` and exit.
    2. If containers already running (`docker ps`), verify health and report existing state.
    3. If not running, run `docker compose up -d` (or `docker build + run`).
    4. Wait for health checks (max 60s).
    5. Output deploy report: `{"status": "running", "containers": [...], "urls": {...}, "credentials": {...}, "health": "healthy|degraded"}`
  - Notes: Deployer must be idempotent. Re-running on already-running containers just reports status. Deploy timeout is enforced by the engine's existing task timeout mechanism.

- [ ] **Task 5: Rewrite documenter → user documentation**
  - File: `templates/agents/documenter.yaml`
  - REPLACE existing prompt (currently writes Docker verification commands).
  - New prompt: "Write user documentation for this story. Describe: what the feature does, where to find it (UI page/URL, API endpoint, CLI command, import path), how to use it step by step, what inputs it expects, what outputs/behavior to observe. Write for a user, not a developer. No source code, no implementation details."
  - Keep: source_access: true, model: claude-opus-4-6

- [ ] **Task 6: Rewrite evaluator → two-part verification**
  - File: `templates/agents/evaluator.yaml`
  - Rewrite prompt_template:
    - **Part 1 — AC Verification**: Read user docs + deploy report from ./story-files/. For each AC, derive verification steps from user documentation, use deploy info to connect, run commands, observe output. Hard pass/fail per AC with evidence.
    - **Part 2 — Subjective Quality Rubric**: Score 1-5 with calibrated anchors:
      1. **Architecture** — 1=broken, 2=works but fragile, 3=adequate structure, 4=well-designed, 5=elegant
      2. **Originality** — 1=copy-paste, 2=minor tweaks, 3=reasonable approach, 4=thoughtful design, 5=innovative
      3. **Craft** — 1=no error handling, 2=basic, 3=adequate, 4=thorough, 5=production-grade
      4. **Functionality** — 1=unusable, 2=confusing, 3=works with effort, 4=intuitive, 5=delightful
    - Output: Full `EvaluatorVerdict` JSON with additional `quality_scores` field. The `quality_scores` are stored in the verdict contract and surfaced in the retro task.
  - Keep: source_access: false, disallowedTools: [Edit, Write]

- [ ] **Task 7: Update reviewer to output verdict JSON**
  - File: `templates/agents/reviewer.yaml`
  - Add to prompt: "After your review, output a JSON verdict: `{\"verdict\": \"pass\"}` if the implementation is acceptable, or `{\"verdict\": \"fail\", \"issues\": [...]}` if changes are needed."
  - This enables the story_flow `[retry, check, review]` loop to exit when review passes.

- [ ] **Task 8: Update default workflow**
  - File: `templates/workflows/default.yaml`
  - New tasks: negotiate-acs, deploy
  - story_flow: `[create-story, negotiate-acs, loop:[create-story, negotiate-acs], implement, check, review, loop:[retry, check, review], document]`
  - epic_flow: `[story_flow, deploy, verify, loop:[retry, document, deploy, verify], retro]`
  - Note: epic_flow loop is `[retry, document, deploy, verify]` — NOT `[retry, check, review, document, deploy, verify]`. Check+review already happened in story_flow. Epic retry fixes verify-specific issues, re-documents, re-deploys, re-verifies.

- [ ] **Task 9: Engine passes deploy info + docs to verify workspace**
  - File: `src/lib/workflow-engine.ts`
  - When dispatching verify (source_access: false), collect:
    1. Document contracts for epic's stories → write as guide files
    2. Deploy contract for the epic → write as `deploy-info.md`
    3. Pass all to `createIsolatedWorkspace({ storyFiles: [...guides, deployInfo] })`
  - Cleanup after dispatch.

- [ ] **Task 10: Task-aware dispatch prompts**
  - File: `src/lib/workflow-engine.ts`
  - REPLACE existing hardcoded document prompt (line ~551).
  - Add/update all task prompts:
    - `create-story`: "Create the story spec for {key}..."
    - `negotiate-acs`: "Review the ACs in story {key} for testability. Output a verdict JSON."
    - `implement`: "Implement story {key}" (unchanged)
    - `check`: "Run automated checks for story {key}..."
    - `review`: "Review the implementation of story {key}. Output a verdict JSON at the end."
    - `document`: "Write user documentation for story {key}..."
    - `deploy`: "Provision the Docker environment for this project. Output a deploy report JSON."
    - `verify`: "Verify the epic using user docs and deploy info in ./story-files/..."

- [ ] **Task 11: Surface quality scores in TUI/retro**
  - File: `src/commands/run.ts`
  - When verify dispatch-end event arrives, parse the verdict contract for `quality_scores`.
  - Display in TUI as a one-line summary: `Quality: arch=4 orig=3 craft=4 func=5`
  - Store in workflow state for retro consumption.

- [ ] **Task 12: Update tests**
  - `default-workflow.test.ts`: story_flow has 8 items (6 strings + 2 loops), epic_flow has deploy, 10 tasks total
  - `embedded-agent-templates.test.ts`: 16 agents, add negotiator + deployer
  - `workflow-engine.test.ts`: test story_flow loop with single work item
  - `verdict-parser.test.ts`: test parseSimpleVerdict fallback
  - `workflow-parser.test.ts`: story_flow accepts loop blocks

### Acceptance Criteria

- [ ] AC 1: Given story_flow with `loop: [create-story, negotiate-acs]`, when negotiate-acs outputs `{"verdict": "fail"}`, then the loop re-runs. When `{"verdict": "pass"}`, loop exits. create-story receives negotiator feedback via `buildPromptWithContractContext`.
- [ ] AC 2: Given story_flow with `loop: [retry, check, review]`, when review outputs `{"verdict": "fail"}`, then retry+check+review runs again for that single story.
- [ ] AC 3: Given the negotiate-acs task, when ACs are untestable, then output includes specific issues and rewrite suggestions.
- [ ] AC 4: Given deploy in epic_flow, when it runs, it outputs structured deploy report (containers, URLs, credentials, health).
- [ ] AC 5: Given deploy info + user docs in verify workspace, the evaluator derives verification steps and connects using deploy info.
- [ ] AC 6: Evaluator output contains `findings[]` (AC pass/fail with evidence) AND `quality_scores` (1-5 calibrated on 4 dimensions).
- [ ] AC 7: Documenter output is user documentation — how to USE the feature, not Docker commands.
- [ ] AC 8: Default workflow: story_flow has 6 string tasks + 2 loops, epic_flow has deploy before verify, 10 task definitions.
- [ ] AC 9: story_flow loop calls `executeLoopBlock()` with `workItems = [currentItem]`.
- [ ] AC 10: `parseSimpleVerdict()` extracts `{verdict}` from free-text output containing JSON. Falls back gracefully when no JSON found.
- [ ] AC 11: Deploy handles no-Docker gracefully — outputs `{"status": "no-docker"}`, verify reports UNKNOWN.
- [ ] AC 12: Quality scores displayed in TUI after verify completes.

## Additional Context

### Dependencies
- Docker for deploy+verify (hard requirement, graceful degradation to UNKNOWN)
- Existing `executeLoopBlock()` — already generic
- Existing `buildPromptWithContractContext()` — passes previous output to next task
- Existing contract system

### Adversarial Review Fixes Applied
- **F1**: Added `parseSimpleVerdict()` fallback for non-evaluator loop tasks (Task 2)
- **F2**: Quality scores surfaced in TUI + stored for retro (Task 11)
- **F3**: Deploy handles no-Docker with structured status output (Task 4)
- **F4**: `buildPromptWithContractContext()` already injects previous output — create-story WILL see negotiator feedback (documented in Task 3 notes)
- **F5**: Task 10 explicitly says REPLACE existing hardcoded document prompt
- **F6**: Reviewer updated to output verdict JSON (Task 7) — enables check+review loop exit
- **F7**: Fixed count: 6 string tasks + 2 loops = 8 items
- **F8**: Deploy timeout via engine's existing task timeout + deployer's 60s health check wait
- **F9**: Calibrated rubric with 1-5 anchors (Task 6)
- **F10**: Deploy outputs structured JSON (Task 4)
- **F11**: Epic loop simplified to `[retry, document, deploy, verify]` — no redundant check+review
- **F12**: Negotiator uses sonnet, not codex (Task 3)
- **F13**: Acknowledged — breaking change, no migration needed (only one project uses it)

### Notes
- Loops are generic — same function at any level, `workItems` determines scope.
- `buildPromptWithContractContext()` is the mechanism for feedback loops — previous task's output is injected into the next task's prompt automatically.
- Quality scores are informational, not blocking. Only AC verdicts determine pass/fail.
- Deploy is idempotent — safe to re-run on already-running containers.
