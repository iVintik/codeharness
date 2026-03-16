# Proof: 12-1-fix-verification-pipeline

*2026-03-15T20:45:51Z*

## AC 1: CLI rejects skeleton proofs
Given a proof file with all ACs showing PENDING, codeharness verify exits 1 with FAIL message.

```bash
grep -n 'passed.*pending === 0\|Proof quality check failed' src/commands/verify.ts src/lib/verify.ts
```

```output
src/commands/verify.ts:182:        message: `Proof quality check failed: ${proofQuality.verified}/${proofQuality.total} ACs verified`,
src/commands/verify.ts:186:      fail(`Proof quality check failed: ${proofQuality.verified}/${proofQuality.total} ACs verified`);
src/lib/verify.ts:171: * `passed` is true only when `pending === 0 && verified > 0`.
src/lib/verify.ts:215:    passed: pending === 0 && verified > 0,
```

## AC 2: CLI accepts verified proofs
Given a proof with evidence blocks, verify passes quality check and proceeds to showboat verify and state update.

```bash
grep -n 'runShowboatVerify\|updateVerificationState\|proof quality passed' src/commands/verify.ts
```

```output
9:  runShowboatVerify,
11:  updateVerificationState,
192:  // 7. Run showboat verify — proof quality passed so we know there's real content
194:  const showboatResult = runShowboatVerify(proofPath);
226:    updateVerificationState(storyId, result, root);
```

## AC 3: Verifier prompt mandates showboat exec
Verifier agent prompt requires showboat exec for every AC; unit test output is never valid as primary evidence.

```bash
sed -n '142,155p' commands/harness-run.md
```

```output
MANDATORY — `showboat exec` rules:
- Every AC MUST use `showboat exec` with real CLI commands (e.g., `codeharness verify ...`, `cat <file> | grep <expected>`, running the actual binary)
- Unit test output (`npm run test:unit`) is NEVER valid as PRIMARY AC evidence — it may be used as supplementary evidence only
- Each AC must prove the feature works from the user/consumer perspective, not just that tests pass

Valid evidence examples:
  - `showboat exec bash \"codeharness verify --story 4-1-test --json\"` → shows CLI output proving verification works
  - `showboat exec bash \"cat verification/4-1-test-proof.md | grep 'PASS'\"` → proves proof file has correct content
  - `showboat exec bash \"codeharness status --json | jq .stories\"` → shows real CLI output

Invalid evidence examples:
  - `showboat exec bash \"npm run test:unit\"` as the ONLY evidence for an AC
  - Hand-written markdown claiming evidence without a `showboat exec` block
  - Copy-pasting test output without running it through `showboat exec`
```

## AC 4: Step 3d parses proof and re-spawns on PENDING
Harness-run Step 3d parses proof file, checks proofQuality.pending, re-spawns verifier, runs showboat verify in main session.

```bash
sed -n '164,171p' commands/harness-run.md
```

```output
1. Confirm the proof document exists: `verification/{story_key}-proof.md`
2. Parse the proof file to check AC quality — run `codeharness verify --story {story_key} --json` and check:
   - If `proofQuality.pending > 0` → re-spawn the verifier to fill in missing evidence (up to max_retries)
   - If `proofQuality.pending === 0` → proof quality passed, proceed
   - Do NOT trust the verifier agent's claim that all ACs are verified — the CLI must independently validate
3. Run `showboat verify verification/{story_key}-proof.md` in the main session to double-check reproducibility
4. If showboat verify fails, re-spawn the verifier to fix the non-reproducible step (up to max_retries)
5. Run `codeharness verify --story {story_key}` to update state (this will also re-check proof quality)
```

## AC 5: JSON output includes proofQuality
JSON output from codeharness verify --json includes proofQuality with verified, pending, total counts.

```bash
grep -n 'proofQuality.*verified.*pending.*total' src/commands/verify.ts
```

```output
183:        proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, total: proofQuality.total },
261:      proofQuality: { verified: proofQuality.verified, pending: proofQuality.pending, total: proofQuality.total },
```
