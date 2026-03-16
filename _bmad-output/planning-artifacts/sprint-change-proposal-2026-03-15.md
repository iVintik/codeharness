---
status: APPROVED
date: '2026-03-15'
scope: Moderate
trigger: Strategic reprioritization — extract sprint execution as standalone skill before CLI
---

# Sprint Change Proposal

**Date:** 2026-03-15
**Status:** Draft
**Change Scope:** Moderate

## Issue Summary

The current epic ordering (1→7) assumes the CLI scaffold exists before any sprint execution is possible. Sprint execution doesn't arrive until Epic 5 (Ralph integration) — 15+ stories away. Meanwhile, we need to autonomously execute sprints *now* to build codeharness itself.

Additionally, loop execution requirements (quality gates, verification, coverage, doc health) are scattered across Epics 4-5 as standalone CLI commands and hooks. Without a central execution skill, these would be implemented as separate competing systems.

**Solution:** Create a sprint execution skill (`/harness-run`) as Epic 0 — a minimal in-session loop that reads sprint-status.yaml, iterates stories using BMAD workflows, and updates status. All future loop-related requirements (Epics 4-5) are implemented as enhancements to this skill, not standalone. Ralph (Epic 5) becomes a session-management wrapper that invokes the skill.

## Impact Analysis

### Epic Impact

| Epic | Impact | Detail |
|------|--------|--------|
| **New Epic 0** | **Added** | Sprint execution skill — 1 story, first priority |
| Epic 1 | Unchanged | CLI scaffold — built using the sprint skill |
| Epic 2 | Unchanged | Observability stack |
| Epic 3 | Unchanged | BMAD integration & bridge |
| Epic 4 | **Stories retagged** | Quality gates, verification, coverage, doc health → implemented as enhancements to sprint skill |
| Epic 5 | **Reduced scope** | Ralph becomes session wrapper that invokes `/harness-run`, loses task-picking and gate logic |
| Epic 6-7 | Unchanged | Onboarding, status, teardown |

### Artifact Impact

| Artifact | Change |
|----------|--------|
| **epics.md** | Add Epic 0, add integration notes to Epic 4 & 5 stories |
| **sprint-status.yaml** | Add Epic 0 entries before Epic 1 |
| **architecture.md** | Amend Decision 4 (Ralph) — skill is execution engine, Ralph is wrapper |
| **prd.md** | Add FR70 (in-session sprint execution) |
| **ux-design-specification.md** | No change needed |

## Recommended Approach: Direct Adjustment

**Path:** Add Epic 0, retag affected stories, amend architecture.

**Rationale:**
- Low effort — skill uses existing BMAD workflows, no new infrastructure
- Immediate dogfooding — use it to build codeharness itself
- Single source of truth — one execution engine, progressively enhanced
- Ralph simplified — outer wrapper only, no competing logic

**Effort:** Low (1 story for Epic 0, annotation changes to existing stories)
**Risk:** Low — additive change, nothing removed
**Timeline impact:** Accelerates overall delivery — subsequent epics developed faster

## Detailed Change Proposals

### Change 1: Add Epic 0 to epics.md

**Location:** Epic List section, before Epic 1

```markdown
### Epic 0: In-Session Sprint Execution Skill
User can run `/harness-run` to autonomously execute one complete sprint in the current
Claude Code session. The skill reads sprint-status.yaml, iterates through stories in
the current epic using BMAD workflows (create-story → dev-story → code-review),
updates status after each story, and handles basic retry logic. Runs entirely in-session
using the Agent tool for fresh context per story — no external processes, no CLI, no beads.
This skill is the SINGLE source of sprint execution logic. All loop-related requirements
from Epics 4-5 are implemented as progressive enhancements to this skill.
**FRs covered:** FR70

**Integration contract:** Future enhancements add gates to this skill's story-completion
flow rather than implementing standalone loop logic:
- Epic 4 stories add quality gates (coverage, verification, doc health) to the skill
- Epic 5 makes Ralph a session-management wrapper that invokes this skill
```

### Change 2: Add Story 0.1 to epics.md

**Location:** After Epic 0 description

```markdown
## Epic 0: In-Session Sprint Execution Skill

### Story 0.1: Sprint Execution Skill — Autonomous In-Session Loop

As a developer,
I want to run `/harness-run` to autonomously execute stories in the current sprint,
So that I can develop features without manual story-by-story invocation.

**Acceptance Criteria:**

**Given** a sprint-status.yaml exists with stories in `backlog` status
**When** the developer runs `/harness-run`
**Then** the skill reads sprint-status.yaml to find the current epic (first non-done epic)
**And** identifies the next `backlog` story in that epic

**Given** the next story is identified
**When** the skill processes it
**Then** it invokes the create-story workflow (via Agent tool) to generate the story file
**And** updates sprint-status.yaml story status to `ready-for-dev`
**Then** it invokes the dev-story workflow (via Agent tool, fresh context) to implement
**And** updates sprint-status.yaml story status to `in-progress`
**Then** it invokes the code-review workflow (via Agent tool, fresh context)
**And** updates sprint-status.yaml story status to `done`

**Given** a story completes (status → done)
**When** there are more stories in the current epic
**Then** the skill proceeds to the next story automatically

**Given** all stories in an epic are done
**When** the epic-N-retrospective entry exists
**Then** the skill runs the retrospective workflow
**And** updates epic status to `done`
**And** proceeds to the next epic if stories remain

**Given** the skill encounters a failure
**When** the dev-story or code-review workflow fails
**Then** the skill retries the current story (max 3 attempts)
**And** if max retries exceeded, halts with status report

**Given** the skill completes or halts
**When** execution ends
**Then** sprint-status.yaml reflects the current state of all stories
**And** a summary is printed: stories completed, stories remaining, any failures

**Technical notes:**
- Each workflow invocation uses the Agent tool for context isolation
- sprint-status.yaml is the ONLY task source — no beads, no progress.json
- Status updates happen immediately after each workflow completes
- The skill is a Claude Code plugin skill/command, not a CLI command
- This is the minimal loop skeleton — quality gates added by Epic 4 stories
```

### Change 3: Add integration notes to Epic 4 stories

**Location:** Each affected story in Epic 4

```
Story 4.1: Verification Pipeline & Showboat Integration
ADD note: "**Integration:** Implement verification as a step in the sprint execution
skill's story-completion flow. When verification is available, the skill calls it
between dev-story completion and marking status `done`."

Story 4.2: Hook Architecture & Enforcement
ADD note: "**Integration:** Hooks are orthogonal — they fire automatically during
agent execution inside the sprint skill. No changes to the skill needed. Hooks
enhance the skill's behavior without the skill knowing about them."

Story 4.3: Testing & Coverage Quality Gates
ADD note: "**Integration:** Implement coverage gate as an enhancement to the sprint
execution skill. The skill checks tests pass and coverage is met before marking
a story `done`. Gate is added to the skill's story-completion flow."

Story 4.4: Documentation Health & Freshness Enforcement
ADD note: "**Integration:** Implement doc freshness check as an enhancement to the
sprint execution skill. The skill verifies AGENTS.md and exec-plans are current
before marking a story `done`. Gate is added to the skill's story-completion flow."
```

### Change 4: Reframe Epic 5 stories

**Location:** Epic 5 description and stories

```
Epic 5 description:
OLD: "User can start the full autonomous development loop. Vendored Ralph reads
tasks from beads, spawns fresh Claude Code instances per iteration, enforces
verification gates per story, handles termination and crash recovery."

NEW: "Ralph provides multi-session, unattended sprint execution by spawning fresh
Claude Code instances that invoke the `/harness-run` skill. Ralph handles concerns
the in-session skill cannot: rate limiting, circuit breaker, crash recovery across
sessions, and timeout management. Ralph does NOT implement its own task-picking
or verification logic — the sprint skill owns that."

Story 5.1: Ralph Loop Integration
ADD note: "**Integration:** Ralph's prompt file tells Claude to run `/harness-run`.
Ralph's task-picking logic (get_current_task, progress.json) is removed — the skill
reads sprint-status.yaml directly. Ralph keeps: session spawning, rate limiting,
circuit breaker, crash recovery, timeout management."

Story 5.2: Verification Gates & Termination
ADD note: "**Integration:** Verification gates move into the sprint skill (Epic 4
enhancements). Ralph's verify_gates.sh is removed. Ralph detects completion by
checking sprint-status.yaml after each session — if all stories done, loop ends."
```

### Change 5: Amend Architecture Decision 4

**Location:** architecture.md, Decision 4: Ralph Integration

```
ADD after existing content:

**Amendment (2026-03-15): Sprint Execution Skill as Single Execution Engine**

The sprint execution skill (`/harness-run`) is the single source of sprint execution
logic. Two execution modes exist, both using the same skill:

1. **In-session** (skill directly): User runs `/harness-run` in current Claude Code
   session. Skill uses Agent tool for fresh context per story. Reads sprint-status.yaml.
   No external processes.

2. **Multi-session** (Ralph wrapper): Ralph spawns Claude Code instances. Each instance
   runs `/harness-run`. Ralph handles rate limiting, circuit breaker, crash recovery,
   timeout management. Ralph does NOT implement task-picking or verification gates.

Architecture change:
- OLD: Ralph → progress.json → custom prompt → agent improvises
- NEW: Ralph → spawns Claude → `/harness-run` skill → BMAD workflows

Ralph's removed responsibilities (moved to skill):
- Task picking (get_current_task) → skill reads sprint-status.yaml
- Verification gates (verify_gates.sh) → skill's story-completion flow
- Progress tracking → sprint-status.yaml (single source of truth)

Ralph's retained responsibilities:
- Session spawning (fresh Claude Code instances)
- Rate limiting (API call tracking)
- Circuit breaker (stagnation detection)
- Crash recovery (resume from last sprint-status.yaml state)
- Timeout management (per-session and total loop)
```

### Change 6: Add FR70 to PRD

**Location:** prd.md, Functional Requirements → Autonomous Execution Loop (after FR51)

```
NEW:
- FR70: User can run `/harness-run` to execute one sprint autonomously in the current
  Claude Code session, iterating through stories using BMAD workflows (create-story →
  dev-story → code-review) and updating sprint-status.yaml. This is the single source
  of sprint execution logic — Ralph and all quality gates are implemented as consumers
  or enhancements of this skill, not as competing implementations.
```

### Change 7: Update sprint-status.yaml

**Location:** development_status section, prepend before epic-1

```
ADD:
  epic-0: backlog
  0-1-sprint-execution-skill: backlog
  epic-0-retrospective: optional
```

## Implementation Handoff

**Change scope:** Moderate — new epic + retagging existing stories + architecture amendment.

**Handoff plan:**
1. **Immediate (after approval):** Update epics.md, sprint-status.yaml, architecture.md, prd.md with all changes above
2. **Next action:** Run `/create-story` for Story 0.1, then `/bmad-dev-story` to implement it
3. **Ongoing:** When implementing Epic 4-5 stories, follow integration notes — enhance the skill, don't build standalone

**Success criteria:**
- `/harness-run` can execute Story 1.1 (CLI scaffold) autonomously
- sprint-status.yaml accurately reflects progress after each story
- Same skill is invocable by Ralph (Epic 5) without modification
