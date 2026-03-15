# Proof: 11-4-github-issue-import-to-beads

**Story:** Story 11.4: GitHub Issue Import to Beads
**Generated:** 2026-03-15

## AC 1: PENDING

> **Given** GitHub issues exist with label `sprint-candidate` on the project repo, **when** the user runs `codeharness github-import`, **then** each issue is imported as a beads issue **and** each has gap-id `[source:github:owner/repo#N]` for dedup **and** GitHub labels are mapped to beads type: `bug` label -> type=bug, `enhancement` -> type=story, default -> type=task. (AC:1)

<!-- No evidence captured yet -->

## AC 2: PENDING

> **Given** a beads issue with matching gap-id already exists, **when** `github-import` runs, **then** no duplicate is created **and** CLI prints `[INFO] Skipping existing: owner/repo#N — {title}`. (AC:2)

<!-- No evidence captured yet -->

## AC 3: PENDING

> **Given** `--repo` is not specified, **when** the command runs, **then** the repo is auto-detected from `git remote get-url origin`. (AC:3)

<!-- No evidence captured yet -->

## AC 4: PENDING

> **Given** `gh` CLI is not installed, **when** the command runs, **then** it fails with `[FAIL] gh CLI not found. Install: https://cli.github.com/`. (AC:4)

<!-- No evidence captured yet -->

## AC 5: PENDING

> **Given** the `--json` flag is passed, **when** the command completes, **then** output is JSON: `{"imported": N, "skipped": M, "issues": [...]}`. (AC:5)

<!-- No evidence captured yet -->

## Verification Summary

| Metric | Value |
|--------|-------|
| Total ACs | 5 |
| Verified | 0 |
| Failed | 5 |
| Showboat Verify | FAIL |
