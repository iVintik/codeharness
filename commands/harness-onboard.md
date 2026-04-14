---
description: Scan an existing project and generate an onboarding plan to bring it to full harness compliance.
---

# Harness Onboard

Scan an existing project for harness compliance gaps and generate an executable onboarding plan. Produces new stories for coverage, documentation, and observability gaps (appended to sprint-status.yaml).

## Step 1: Verify the CLI is reachable

The plugin's SessionStart hook version-locks the `codeharness` binary. Just
confirm it runs:

```bash
codeharness --version
```

If this fails, node ≥22 is missing or the session-start version-lock hook
didn't fire. Check `CODEHARNESS_NO_AUTO_INSTALL` isn't set and retry.

## Step 2: Run Full Onboarding Scan

Run the comprehensive TypeScript scanner with `--force-scan` and `--auto-approve`.
Always invoke via `npx --yes codeharness@latest` so the plugin and CLI stay
in lockstep — never call a bare `codeharness`.

```bash
codeharness onboard epic --force-scan --auto-approve
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

## Step 3: Verify Sprint Integration

Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and confirm:
- Any new `epic-N` entry was added with status `backlog`
- Story entries matching the onboarding findings were added with status `backlog`
- An `epic-N-retrospective: optional` entry exists

If the entries are missing (e.g., because the harness isn't initialized), manually append them using the Edit tool based on the stories in `ralph/onboarding-epic.md`.

## Step 4: Present Summary

Print a summary:
```
[OK] Onboarding scan complete

New stories: {N} across {categories}
  - Coverage: {N} stories
  - Documentation: {N} stories
  - Observability: {N} stories
  Epic: epic-{N} added to sprint-status.yaml

Ready for: /harness-run
```

## Step 5: Handle Edge Cases

- **Harness not initialized:** Run `codeharness init` first, then re-run onboard.
- **No gaps found:** Report that the project is fully compliant. No changes made.
- **Previous onboarding exists:** The scanner deduplicates against existing beads issues. Only new gaps generate stories.
- **sprint-status.yaml missing:** Create the file with the standard header before appending.
