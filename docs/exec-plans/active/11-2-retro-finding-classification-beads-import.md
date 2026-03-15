# Exec Plan: 11-2 Retro Finding Classification & Beads Import

## Story

Retro findings automatically become beads issues so action items don't get lost between sprints. The `retro-import` command parses retrospective markdown, classifies findings, and creates/deduplicates beads issues via gap-ids.

## Acceptance Criteria Summary

1. Parse `epic-N-retrospective.md` action items table, classify each as `project` | `harness` | `tool:<name>`
2. Create beads issues with gap-id `[gap:retro:epic-N-item-M]`, type `task`, derived priority, retro context
3. Dedup: no duplicates on re-run, prints `[INFO] Skipping existing: {title}`
4. `--json` flag outputs `{"imported": N, "skipped": M, "issues": [...]}`

## Files Changed

| File | Change |
|------|--------|
| `src/lib/retro-parser.ts` | NEW — Markdown parser, action item extraction, classification heuristics, priority derivation |
| `src/commands/retro-import.ts` | NEW — Commander.js command: `--epic <n>`, validation, import loop, JSON output |
| `src/index.ts` | MODIFIED — Added retro-import command registration |
| `src/lib/__tests__/retro-parser.test.ts` | NEW — 22 unit tests for parsing, classification, priority |
| `src/commands/__tests__/retro-import.test.ts` | NEW — 21 command tests for import, dedup, JSON, errors |
| `src/__tests__/cli.test.ts` | MODIFIED — Updated command count from 13 to 14 |
| `src/lib/AGENTS.md` | MODIFIED — Added retro-parser entry |
| `src/commands/AGENTS.md` | MODIFIED — Added retro-import entry |

## Verification Plan

### How to test

1. Create a retro file `_bmad-output/implementation-artifacts/epic-9-retrospective.md` with action items table
2. Run `codeharness retro-import --epic 9` — verify issues created
3. Run again — verify dedup (skipping messages)
4. Run with `--json` — verify JSON output format
5. Run with invalid epic — verify error handling

### Evidence to capture for proof doc

- Unit test pass/fail output
- Coverage metrics for both new files
- Sample CLI output for import, dedup, and JSON modes

## Status

- [x] Implementation complete
- [x] Code review passed (fixes applied)
- [x] Verification run completed
- [x] Proof document created
