# Proof: 0-1-sprint-execution-skill

**Story:** Story 0.1: Sprint Execution Skill — Autonomous In-Session Loop
**Generated:** 2026-03-15

## AC 1: PENDING

> **Given** a `sprint-status.yaml` exists with stories in `backlog` status, **When** the developer runs `/harness-run`, **Then** the skill reads sprint-status.yaml to find the current epic (first non-done epic) and identifies the next `backlog` story in that epic.

<!-- No evidence captured yet -->

## AC 2: PENDING

> **Given** the next story is identified, **When** the skill processes it, **Then** it invokes `/create-story` (via Agent tool) to generate the story file, updates sprint-status.yaml to `ready-for-dev`, invokes `/bmad-dev-story` (via Agent tool, fresh context) to implement, updates status through `in-progress` → `review`, invokes `/bmad-code-review` (via Agent tool, fresh context), and updates status to `done`.

<!-- No evidence captured yet -->

## AC 3: PENDING

> **Given** a story completes (status → done), **When** there are more stories in the current epic, **Then** the skill proceeds to the next story automatically.

<!-- No evidence captured yet -->

## AC 4: PENDING

> **Given** all stories in an epic are done, **When** the epic-N-retrospective entry exists, **Then** the skill runs the retrospective workflow, updates epic status to `done`, and proceeds to the next epic if stories remain.

<!-- No evidence captured yet -->

## AC 5: PENDING

> **Given** the skill encounters a failure (dev-story or code-review workflow fails), **When** the failure is detected, **Then** the skill retries the current story (max 3 attempts) and if max retries exceeded, halts with status report.

<!-- No evidence captured yet -->

## AC 6: PENDING

> **Given** the skill completes or halts, **When** execution ends, **Then** sprint-status.yaml reflects the current state of all stories and a summary is printed: stories completed, stories remaining, any failures.

<!-- No evidence captured yet -->

## Verification Summary

| Metric | Value |
|--------|-------|
| Total ACs | 6 |
| Verified | 0 |
| Failed | 6 |
| Showboat Verify | FAIL |
