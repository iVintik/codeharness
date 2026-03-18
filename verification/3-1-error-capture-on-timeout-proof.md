# Verification Proof: Story 3-1 — Error Capture on Timeout

**Story:** 3-1-error-capture-on-timeout
**Verified by:** Claude Opus 4.6 (black-box verifier)
**Date:** 2026-03-18
**CLI Version:** 0.19.3
**Container:** codeharness-verify (node:20-slim + codeharness@latest)

## Test Setup

A test project was created inside the Docker container with:
- Git repo with staged and unstaged changes
- `sprint-state.json` with story statuses
- `ralph/.state-snapshot.json` (pre-iteration snapshot with different statuses)
- `ralph/logs/claude_output_2026-03-18_test.log` (150 lines of simulated output)

---

## AC 1: Timeout captures git diff, state delta, and partial stderr

```bash
docker exec -w /tmp/test-project codeharness-verify codeharness timeout-report \
  --story 3-1 --iteration 5 --duration 30 \
  --output-file ralph/logs/claude_output_2026-03-18_test.log \
  --state-snapshot ralph/.state-snapshot.json
```

```output
[OK] Timeout report written: /tmp/test-project/ralph/logs/timeout-report-5-3-1.md
```

Report contents confirm all three captures:

```bash
docker exec -w /tmp/test-project codeharness-verify cat ralph/logs/timeout-report-5-3-1.md
```

```output
# Timeout Report: Iteration 5

- **Story:** 3-1
- **Duration:** 30 minutes (timeout)
- **Timestamp:** 2026-03-18T19:26:44.322Z

## Git Changes

Unstaged:
file1.txt | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

Staged:
file3.txt | 1 +
 1 file changed, 1 insertion(+)

## State Delta

3-1: pending → in-progress

## Partial Output (last 100 lines)

[100 lines of log output from line 51 to 150]
```

- Git diff: captures both unstaged (`file1.txt`) and staged (`file3.txt`) changes via `--stat`
- State delta: shows `3-1: pending -> in-progress` by comparing snapshot vs current
- Partial stderr: captures last 100 lines from the 150-line output log

**Verdict:** PASS

---

## AC 2: Report written to correct path with all required fields

```bash
docker exec -w /tmp/test-project codeharness-verify ls -la ralph/logs/timeout-report-5-3-1.md
```

```output
-rw-r--r-- 1 root root 5117 Mar 18 19:26 ralph/logs/timeout-report-5-3-1.md
```

File path matches pattern `ralph/logs/timeout-report-<iteration>-<story-key>.md` = `timeout-report-5-3-1.md`.

Report contains all required fields:
- Story key: `3-1`
- Iteration number: `5`
- Duration: `30 minutes (timeout)`
- Git diff summary: unstaged and staged `--stat` output
- State delta: `3-1: pending -> in-progress`
- Partial stderr: last 100 lines of output log

**Verdict:** PASS

---

## AC 3: Report file exists with non-zero content

```bash
docker exec -w /tmp/test-project codeharness-verify sh -c 'for f in ralph/logs/timeout-report-*.md; do SIZE=$(wc -c < "$f"); echo "$f: ${SIZE} bytes"; done'
```

```output
ralph/logs/timeout-report-5-3-1.md: 5117 bytes
ralph/logs/timeout-report-6-3-1.md: 477 bytes
ralph/logs/timeout-report-7-3-1-timing.md: 5124 bytes
```

All three generated reports exist and have non-zero content (477 to 5124 bytes).

**Verdict:** PASS

---

## AC 4: Error handling returns graceful failure, never throws

Test 1: Missing output file and state snapshot (non-existent paths):

```bash
docker exec -w /tmp/test-project codeharness-verify sh -c 'codeharness timeout-report --story 3-1 --iteration 6 --duration 30 --output-file /nonexistent/path/output.log --state-snapshot /nonexistent/path/snapshot.json 2>&1; echo "EXIT:$?"'
```

```output
[OK] Timeout report written: /tmp/test-project/ralph/logs/timeout-report-6-3-1.md
EXIT:0
```

Report degrades gracefully with placeholders:

```bash
docker exec -w /tmp/test-project codeharness-verify cat ralph/logs/timeout-report-6-3-1.md
```

```output
## State Delta

(unavailable: State snapshot not found: /nonexistent/path/snapshot.json)

## Partial Output (last 100 lines)

(unavailable: Output file not found: /nonexistent/path/output.log)
```

Test 2: No git repo available:

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/no-git-project/ralph/logs && cd /tmp/no-git-project && codeharness timeout-report --story 3-1 --iteration 8 --duration 30 --output-file /nonexistent/output.log --state-snapshot /nonexistent/snapshot.json 2>&1; echo "EXIT:$?"'
```

```output
[OK] Timeout report written: /tmp/no-git-project/ralph/logs/timeout-report-8-3-1.md
EXIT:0
```

Report shows `(unavailable: Failed to capture git diff: ...)` — no crash, no uncaught exception.

Test 3: Missing required args:

```bash
docker exec -w /tmp/test-project codeharness-verify sh -c 'codeharness timeout-report --story 3-1 2>&1; echo "EXIT:$?"'
```

```output
error: required option '--iteration <n>' not specified
EXIT:1
```

Exits with code 1 and structured error message — no stack trace or uncaught exception.

**Verdict:** PASS

---

## AC 5: Capture completes in under 10 seconds

```bash
docker exec -w /tmp/test-project codeharness-verify sh -c 'START=$(date +%s%N); codeharness timeout-report --story 3-1-timing --iteration 7 --duration 45 --output-file ralph/logs/claude_output_2026-03-18_test.log --state-snapshot ralph/.state-snapshot.json 2>&1; END=$(date +%s%N); ELAPSED=$(( (END - START) / 1000000 )); echo "ELAPSED_MS:${ELAPSED}"'
```

```output
[OK] Timeout report written: /tmp/test-project/ralph/logs/timeout-report-7-3-1-timing.md
ELAPSED_MS:40
```

Command completed in 40 milliseconds — well under the 10-second threshold.

**Verdict:** PASS

---

## AC 6: Status --story shows timeout report info

```bash
docker exec -w /tmp/test-project codeharness-verify sh -c 'codeharness status --story 3-1 2>&1; echo "EXIT:$?"'
```

```output
Story: 3-1
Status: in-progress (attempt undefined/10)
Epic: 3
Last attempt: none

-- AC Results -------------------------------------------------------
No AC results recorded

-- History ----------------------------------------------------------
Attempt undefined: in-progress
EXIT:0
```

The `status --story` drill-down does NOT show any timeout report path or summary line. No mention of "Last timeout" or report file path. The dev agent's completion notes confirm: "AC #6 (status --story drill-down showing timeout info) is not implemented."

**Verdict:** FAIL

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| 1 | Timeout captures git diff, state delta, partial stderr | PASS |
| 2 | Report written to correct path with all fields | PASS |
| 3 | Report file exists with non-zero content | PASS |
| 4 | Error handling returns graceful failure, never throws | PASS |
| 5 | Capture completes under 10 seconds | PASS |
| 6 | Status --story shows timeout report info | FAIL |

**Overall: 5/6 ACs PASS, 1 FAIL**

AC 6 is tagged `integration-required` in the story, and the dev agent explicitly noted it was not implemented as it was considered beyond the story's task scope. However, it is listed as an acceptance criterion, so it fails verification.

## Session Issues

- **Container missing codeharness CLI**: The Docker container was built from a generic verification image that did not include `codeharness`. Had to run `npm install -g codeharness` inside the container before testing. This is a verification environment setup gap — the `verify-env build` step should install the built artifact into the container.
- **AC 6 not implemented**: The dev agent acknowledged in completion notes that AC 6 was not implemented, calling it "beyond the scope of this story's tasks." This is a scope disagreement — the AC is part of the story, so it should have been implemented or the AC should have been renegotiated before marking the story as ready for verification.
