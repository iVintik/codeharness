---
description: Scan an existing project and generate an onboarding plan to bring it to full harness compliance.
---

# Harness Onboard

Scan an existing project for harness compliance gaps and generate an executable onboarding plan. Produces two outputs:
1. **New stories** for coverage, documentation, and observability gaps (appended to sprint-status.yaml)
2. **Verification resets** for completed stories that lack real showboat proofs (reset to `verified` status so harness-run re-verifies them)

## Step 1: Build the CLI

Ensure the CLI is up to date before scanning:

```bash
npm run build
```

If the build fails, fix the errors before proceeding.

## Step 2: Run Full Onboarding Scan

Run the comprehensive TypeScript scanner with `--force-scan` and `--auto-approve`:

```bash
node dist/index.js onboard epic --force-scan --auto-approve
```

This runs ALL phases:
1. **Codebase scan** — modules, source files, artifacts
2. **Coverage gap analysis** — per-module and per-file coverage against thresholds
3. **Documentation audit** — README, ARCHITECTURE.md, AGENTS.md per module, staleness
4. **Extended gap detection** — observability, per-file coverage floor
5. **Epic generation** — creates `ralph/onboarding-epic.md` with prioritized stories
6. **Beads import** — imports stories into issue tracker
7. **Sprint integration** — appends onboarding epic + stories to `sprint-status.yaml`

Review the CLI output for the scan findings and story count.

## Step 3: Detect Unverified Stories

After the scanner runs, check ALL stories across ALL epics in sprint-status.yaml for missing showboat proofs.

A story needs real verification if:
- Its status is `done` in sprint-status.yaml
- No showboat proof exists at `verification/{story-key}-proof.md`

For each such story:
1. Reset its status from `done` to `verified` in sprint-status.yaml
2. Reset its parent epic from `done` to `in-progress`
3. Reset the epic's retrospective from `done` to `optional`

This causes harness-run to pick them up at Step 3d (verification) and run real showboat verification with tests, evidence capture, and fix loops.

Print the reset count:
```
[INFO] Verification reset: {N} stories across {M} epics reset to 'verified' (missing showboat proofs)
```

If all done stories already have showboat proofs:
```
[OK] Verification: all done stories have showboat proofs
```

## Step 4: Verify Sprint Integration

Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm:
- Any new `epic-N` entry was added with status `backlog` (for new onboarding stories)
- Story entries matching the onboarding findings were added with status `backlog`
- An `epic-N-retrospective: optional` entry exists
- Previously-done stories without proofs are now at `verified` status

If the entries are missing (e.g., because the harness isn't initialized), manually append them using the Edit tool based on the stories in `ralph/onboarding-epic.md`.

## Step 5: Present Summary

Print a summary:
```
[OK] Onboarding scan complete

New stories: {N} across {categories}
  - Coverage: {N} stories
  - Documentation: {N} stories
  - Observability: {N} stories
  Epic: epic-{N} added to sprint-status.yaml

Verification resets: {N} stories across {M} epics
  Stories reset to 'verified' for real showboat verification

Ready for: /harness-run
```

## Step 6: Handle Edge Cases

- **Harness not initialized:** Run `codeharness init` first, then re-run onboard.
- **No gaps found AND no verification resets:** Report that the project is fully compliant. No changes made.
- **Previous onboarding exists:** The scanner deduplicates against existing beads issues. Only new gaps generate stories.
- **sprint-status.yaml missing:** Create the file with the standard header before appending.
- **Stories already at `verified`:** Don't double-reset. Only reset stories currently at `done` without proofs.
