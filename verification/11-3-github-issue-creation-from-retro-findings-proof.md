# Proof: 11-3-github-issue-creation-from-retro-findings

**Story:** Story 11.3: GitHub Issue Creation from Retro Findings
**Generated:** 2026-03-15

## AC 1: PENDING

> **Given** retro findings have been imported to beads (Story 11.2 completed), **when** `codeharness retro-import --epic N` runs with `retro_issue_targets` configured in state file, **then** project-classified findings create issues on the project repo (auto-detected from `git remote get-url origin`) **and** harness-classified findings create issues on `iVintik/codeharness` repo **and** each issue body includes the retro context, epic number, and source project name. (AC:1)

<!-- No evidence captured yet -->

## AC 2: PENDING

> **Given** a GitHub issue with the same gap-id already exists on the target repo, **when** `retro-import` runs, **then** no duplicate issue is created **and** CLI prints `[INFO] GitHub issue exists: owner/repo#N`. (AC:2)

<!-- No evidence captured yet -->

## AC 3: PENDING

> **Given** `gh` CLI is not installed or not authenticated, **when** `retro-import` attempts GitHub issue creation, **then** beads import still succeeds **and** GitHub creation is skipped with `[WARN] gh CLI not available — skipping GitHub issue creation`. (AC:3)

<!-- No evidence captured yet -->

## AC 4: PENDING

> **Given** `retro_issue_targets` is not configured in state file, **when** `retro-import` runs, **then** only beads import happens (no GitHub issues) **and** CLI prints `[INFO] No retro_issue_targets configured — skipping GitHub issues`. (AC:4)

<!-- No evidence captured yet -->

## Verification Summary

| Metric | Value |
|--------|-------|
| Total ACs | 4 |
| Verified | 0 |
| Failed | 4 |
| Showboat Verify | FAIL |
