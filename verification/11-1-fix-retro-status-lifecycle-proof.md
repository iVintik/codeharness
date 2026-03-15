# Proof: 11-1-fix-retro-status-lifecycle

**Story:** Story 11.1: Fix Retro Status Lifecycle
**Generated:** 2026-03-15

## AC 1: PENDING

> **Given** all stories in an epic are `done`, **when** the harness-run skill executes Step 5 (epic completion), **then** the retrospective agent is invoked **and** `epic-N-retrospective` status is updated to `done` in sprint-status.yaml by the harness-run skill itself (not delegated to the retro agent). (AC:1)

<!-- No evidence captured yet -->

## AC 2: PENDING

> **Given** a user runs `codeharness verify --retro --epic N`, **when** `epic-N-retrospective.md` exists in implementation-artifacts, **then** the status is updated to `done` in sprint-status.yaml **and** the CLI prints `[OK] Epic N retrospective: marked done`. (AC:2)

<!-- No evidence captured yet -->

## AC 3: PENDING

> **Given** sprint planning is invoked for a new sprint, **when** previous epics have completed retrospectives, **then** unresolved action items from those retros are surfaced during planning. (AC:3)

<!-- No evidence captured yet -->

## Verification Summary

| Metric | Value |
|--------|-------|
| Total ACs | 3 |
| Verified | 0 |
| Failed | 3 |
| Showboat Verify | FAIL |
