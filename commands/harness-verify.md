---
description: Verify a story's acceptance criteria with real-world evidence and produce a Showboat proof document.
---

# Harness Verify

Verify a story by producing a showboat proof document with executable, reproducible evidence. Verification includes running tests, checking outputs, and fixing any issues found.

## Step 1: Identify Story

If a story ID is provided as argument, use it. Otherwise:

1. Check the current exec-plan in `docs/exec-plans/active/` for the story in progress
2. Check `_bmad-output/implementation-artifacts/sprint-status.yaml` for the first story at `verified` status
3. Ask the user: "Which story should I verify?"

## Step 2: Pre-verification — Run Tests

Before spawning the verifier, confirm tests pass in the current session:

```bash
npm run test:unit 2>&1
```

If tests fail, **fix the failures first** — do not proceed to verification with broken tests. This ensures the verifier starts from a known-good state.

After tests pass:
```bash
codeharness coverage 2>&1
```

This updates `session_flags.tests_passed` and `session_flags.coverage_met` in state, which are preconditions for `codeharness verify`.

## Step 3: Spawn Verifier Subagent

Launch the `codeharness:verifier` subagent with full context:

```
Use the Agent tool with:
  subagent_type: "codeharness:verifier"
  prompt: "Verify story {story_id}.

Story file: _bmad-output/implementation-artifacts/{story_id}.md
Proof output: verification/{story_id}-proof.md

Read the story file, extract all acceptance criteria, and produce a showboat proof document.

You MUST:
1. Run `showboat init` to create the proof document
2. Run tests via `showboat exec` and capture output as evidence
3. For each AC, run real commands via `showboat exec` to prove the AC is met
4. If ANY verification step fails — fix the issue (code, tests, config), then re-capture
5. Run a final `showboat verify` to confirm reproducibility
6. If showboat verify fails, investigate and fix the non-reproducible step

Do NOT write markdown by hand — use showboat CLI exclusively.
Do NOT skip tests — they are mandatory evidence.
Do NOT proceed autonomously without fixing failures."
```

## Step 4: Verify Showboat Output

After the verifier completes, confirm the proof document exists and is valid:

```bash
showboat verify verification/{story_id}-proof.md
```

If showboat verify fails:
1. Read the diff output to identify which step is non-reproducible
2. Fix the underlying issue (flaky test, timing-dependent output, etc.)
3. Re-run `showboat verify`
4. If it still fails after 3 attempts, report FAIL

## Step 5: Run CLI Verify

Once showboat verification passes, run the CLI command to update state:

```bash
codeharness verify --story {story_id}
```

This:
- Checks preconditions (tests_passed, coverage_met)
- Updates `session_flags.verification_run: true`
- Appends to `verification_log`
- Closes beads issue if applicable
- Moves exec-plan to completed

## Step 6: Report

If all ACs pass and showboat verify passes:
```
[OK] Verification passed: {story_id} ({pass_count}/{total_ac} ACs)
[OK] Showboat verify: reproducible
[OK] Tests: passing

→ Story ready for completion
```

If any AC fails after fix attempts:
```
[FAIL] Verification failed: {story_id} ({pass_count}/{total_ac} ACs)

Failed ACs:
- AC{N}: {description} — {failure reason}
- Fixes attempted: {list of changes made}

→ Fix the failing criteria and re-run /harness-verify
```

## Step 7: Handle Verification-Driven Fixes

If the verifier made code changes to fix issues found during verification:

1. Re-run the full test suite to confirm fixes don't break anything
2. Rebuild if needed: `npm run build`
3. The fixes are legitimate — they were discovered through real verification
4. Do NOT revert them. They represent real bugs caught by the verification process.

## Expected Proof Document Format

The proof document at `verification/{story_id}-proof.md` must follow this structure:

```markdown
# Proof: {story_id}

Story: {story title}
Date: {ISO date}
Verifier: codeharness:verifier

## Test Suite

<!-- showboat exec: {test command} -->
```
{test output showing all tests pass}
```
<!-- /showboat exec -->

## AC {N}: {AC description}

**Result:** PASS | FAIL

<!-- showboat exec: {verification command} -->
```
{command output proving the AC is met}
```
<!-- /showboat exec -->

{Optional narrative explaining what the evidence shows}

## Summary

- **Total ACs:** {count}
- **Passed:** {pass_count}
- **Failed:** {fail_count}
- **Tests:** {test_count} passing
- **Coverage:** {coverage_percent}%
```

Key rules:
- Every AC must have at least one `showboat exec` block with real command output
- The test suite section is mandatory and must show all tests passing
- Use `showboat exec` for all evidence capture — do not write output by hand
- The document must be reproducible via `showboat verify`
