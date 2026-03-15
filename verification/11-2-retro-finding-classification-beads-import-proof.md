# Proof: 11-2-retro-finding-classification-beads-import

**Story:** Story 11.2: Retro Finding Classification & Beads Import
**Generated:** 2026-03-15

## AC 1: PENDING

> **Given** `epic-N-retrospective.md` exists with an action items table, **when** the user runs `codeharness retro-import --epic N`, **then** each action item is parsed (number, description, target epic, owner) **and** each is classified as `project` | `harness` | `tool:<name>` based on content analysis. (AC:1)

<!-- No evidence captured yet -->

## AC 2: PENDING

> **Given** action items are classified, **when** beads issues are created, **then** each has gap-id `[gap:retro:epic-N-item-M]` for dedup **and** type is `task` **and** priority derived from action item urgency **and** description includes the original retro context. (AC:2)

<!-- No evidence captured yet -->

## AC 3: PENDING

> **Given** `retro-import` is run twice for the same epic, **when** issues with matching gap-ids already exist in beads, **then** no duplicate issues are created **and** CLI prints `[INFO] Skipping existing: {title}`. (AC:3)

<!-- No evidence captured yet -->

## AC 4: PENDING

> **Given** the `--json` flag is passed, **when** the command completes, **then** output is JSON: `{"imported": N, "skipped": M, "issues": [...]}`. (AC:4)

<!-- No evidence captured yet -->

## Verification Summary

| Metric | Value |
|--------|-------|
| Total ACs | 4 |
| Verified | 0 |
| Failed | 4 |
| Showboat Verify | FAIL |
