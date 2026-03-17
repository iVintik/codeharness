# Verification Proof: 15-3-retry-state-management

**Verifier:** Claude Opus 4.6 (1M context) — black-box verification
**Date:** 2026-03-17
**Container:** codeharness-verify
**Verdict:** PASS — all 5 acceptance criteria verified

---

## AC1: Strict Format Parsing

**Test:** Created `ralph/.story_retries` with mixed formats — valid `key=count` lines, space-delimited lines, lines missing keys, missing counts, and garbage lines.

```bash
docker exec codeharness-verify bash -c 'cd /workspace && cat > ralph/.story_retries << "EOF"
13-3-black-box-verifier-agent 4
2-1-dependency-auto-install=4
0-1-sprint-execution-skill=3
0-1-sprint-execution-skill 1
bad line no delimiter
=no-key
no-count=
15-1-some-story=2
EOF
codeharness retry --status'
```

```output
[WARN] Ignoring malformed retry line: 13-3-black-box-verifier-agent 4
[WARN] Ignoring malformed retry line: 0-1-sprint-execution-skill 1
[WARN] Ignoring malformed retry line: bad line no delimiter
[WARN] Ignoring malformed retry line: =no-key
[WARN] Ignoring malformed retry line: no-count=
Story                                  Retries  Flagged
───────────────────────────────────────────────────────
2-1-dependency-auto-install               4  no
0-1-sprint-execution-skill                3  no
15-1-some-story                           2  no
```

**Result: PASS** — Only `key=count` format accepted. Space-delimited, missing-key, missing-count, and garbage lines all warned and ignored.

---

## AC2: Reset All

**Test:** Populated both `.story_retries` (3 entries) and `.flagged_stories` (2 entries), then ran `codeharness retry --reset`.

```bash
docker exec codeharness-verify bash -c 'cd /workspace && \
  cat > ralph/.story_retries << "EOF"
2-1-dependency-auto-install=4
0-1-sprint-execution-skill=3
15-1-some-story=2
EOF
  cat > ralph/.flagged_stories << "EOF"
2-1-dependency-auto-install
0-1-sprint-execution-skill
EOF
  codeharness retry --reset && \
  cat ralph/.story_retries && cat ralph/.flagged_stories'
```

```output
[OK] All retry counters and flagged stories cleared
```

Both files empty after reset.

**Result: PASS** — Both files cleared, correct confirmation message printed.

---

## AC3: Reset Single Story

**Test:** Populated files with multiple entries, reset only `2-1-dependency-auto-install`.

```bash
docker exec codeharness-verify bash -c 'cd /workspace && \
  codeharness retry --reset --story 2-1-dependency-auto-install && \
  cat ralph/.story_retries && cat ralph/.flagged_stories'
```

```output
[OK] Retry counter and flagged status cleared for 2-1-dependency-auto-install
0-1-sprint-execution-skill=3
15-1-some-story=2
0-1-sprint-execution-skill
```

**Result: PASS** — Only the targeted story removed from both files. Other entries preserved.

---

## AC4: Status Output (Table + JSON)

**Test:** Created files with 3 retry entries and 1 flagged story. Ran `--status` and `--status --json`.

```bash
docker exec codeharness-verify bash -c 'cd /workspace && codeharness retry --status'
```

```output
Story                                  Retries  Flagged
───────────────────────────────────────────────────────
2-1-dependency-auto-install               4  yes
0-1-sprint-execution-skill                3  no
15-1-some-story                           2  no
```

```bash
docker exec codeharness-verify bash -c 'cd /workspace && codeharness retry --status --json'
```

```output
{"status":"ok","entries":{"2-1-dependency-auto-install":{"count":4,"flagged":true},"0-1-sprint-execution-skill":{"count":3,"flagged":false},"15-1-some-story":{"count":2,"flagged":false}}}
```

**Result: PASS** — Table displays story, retry count, and flagged status. JSON output is well-formed and machine-readable.

---

## AC5: Standardized Format on Write

**Test:** After `--reset --story` removes one entry, verified remaining entries use `key=count` format.

```bash
docker exec codeharness-verify bash -c 'cd /workspace && \
  codeharness retry --reset --story 0-1-sprint-execution-skill && \
  cat ralph/.story_retries'
```

```output
[OK] Retry counter and flagged status cleared for 0-1-sprint-execution-skill
2-1-dependency-auto-install=4
15-1-some-story=2
```

**Result: PASS** — All remaining entries written in strict `key=count` format. No space delimiters, no duplicates.

---

## Edge Cases Tested

| Scenario | Result |
|----------|--------|
| `--story` without `--reset` or `--status` | Warns and shows filtered status for that story |
| Path traversal in story key (`../../../etc/passwd`) | Rejected: `[WARN] Invalid story key` + exit 1 |
| Empty `.story_retries` + `--status` | Clean output: `No retry entries.` + exit 0 |

---

## Observability

VictoriaLogs queried at `http://localhost:9428` for retry-related entries. No structured log entries emitted — expected, as CLI commands output to stdout/stderr rather than a logging backend.

---

## Summary

All 5 acceptance criteria verified via real CLI execution in the `codeharness-verify` container. Format parsing, reset (all and single), status output (table and JSON), and write format standardization all behave as specified. Input validation and edge cases are handled correctly.
