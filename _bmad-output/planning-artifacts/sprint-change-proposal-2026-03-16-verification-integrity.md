---
status: APPROVED
date: '2026-03-16'
scope: Moderate
trigger: Session analysis — verification pipeline broken at three layers, all Epic 11 proofs empty
priority: First — must fix verification before any further story verification
github_issues: [1, 2, 3, 4, 5, 6, 7, 8]
---

# Sprint Change Proposal: Verification Pipeline Integrity & Sprint Infrastructure

**Date:** 2026-03-16
**Status:** APPROVED
**Change Scope:** Moderate

## Issue Summary

All 5 Epic 11 stories were marked `done` with skeleton proof documents containing zero evidence. The verification pipeline is broken at three independent layers:

1. **Verifier agent** creates skeletons via `showboat init` but never runs `showboat exec`
2. **CLI verify** accepts proof files with all-PENDING ACs
3. **harness-run** trusts agent text reports over artifact contents

Additionally: implementation artifacts untracked by git, subagent commits fragmented, AGENTS.md staleness causes false positives.

**Critical rule established:** Unit test output is NEVER valid AC evidence. All ACs must be verified by simulating how a user or consuming system sees it.

## Artifacts Modified

- [x] prd.md — FR75-FR79 added
- [x] epics.md — Epic 12 + 3 full story definitions + FR coverage map
- [x] architecture.md — Decision 8 amendment (three-layer validation + evidence rules), Decision 11 (commit ownership)
- [x] sprint-status.yaml — Epic 12 entries added (3 stories)

## Epic 12 Stories

| Story | Fixes Issues | Scope |
|-------|-------------|-------|
| 12-1: Fix Verification Pipeline | #1, #2, #8 | CLI verify quality gate, verifier agent showboat usage, harness-run proof parsing |
| 12-2: Sprint Execution Ownership | #3, #4, #5, #6, #7 | Git tracking, structured commits, status ownership, staleness fix |
| 12-3: Unverifiable AC Detection | (new) | AC classification, verifier escalation, harness-run halt on integration-required ACs |

## Success Criteria

- Re-run Epic 11 verification → proof files have real `showboat exec` evidence
- `codeharness verify` rejects empty proofs with exit code 1
- harness-run catches PENDING ACs before marking `done`
- `git log` shows clean per-story commits
- Story 11-5 type ACs are detected as integration-required and escalated
