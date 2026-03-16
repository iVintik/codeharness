# Epic 12 Retrospective: Verification Pipeline Integrity & Sprint Infrastructure

**Epic:** Epic 12 — Verification Pipeline Integrity & Sprint Infrastructure
**Date:** 2026-03-16
**Stories Completed:** 3 (12-1, 12-2, 12-3)
**Status:** All stories done
**Previous Retro:** Epic 11

---

## Epic Summary

Epic 12 was a corrective epic. All five Epic 11 stories had been marked `done` with skeleton proof documents containing zero evidence — the verification pipeline was broken at every layer simultaneously. This epic fixed three independent failure points, restructured sprint ownership, and added detection for ACs that cannot be verified in an automated session.

**Story 12.1 — Fix Verification Pipeline** replaced the binary `proofHasContent()` function with `validateProofQuality()`, which regex-parses AC sections in proof files and counts PENDING vs verified vs escalated statuses. The verify CLI now exits 1 with `[FAIL] Proof quality check failed: N/M ACs verified` when any AC lacks real evidence. The `--json` output gained a `proofQuality` object. The verifier agent prompt in `commands/harness-run.md` was rewritten to mandate `showboat exec` for every AC and explicitly forbid unit test output as primary evidence. The harness-run Step 3d post-verifier check now independently validates proof quality via CLI output rather than trusting the agent's claim. A critical bug was found and fixed: `validateProofQuality()` initially only recognized HTML comment markers (`<!-- /showboat exec -->`), but showboat's native format uses bash+output blocks without those markers. The function was updated to recognize both formats. A second bug was found: `createProofDocument()` was unconditionally overwriting existing proof files with fresh skeletons, destroying any evidence the verifier had captured. The verify command now checks for an existing proof file before calling `createProofDocument()`.

**Story 12.2 — Sprint Execution Ownership** established harness-run as the single owner of git commits and sprint-status updates. Five changes: (1) `.gitignore` was narrowed from `_bmad-output/` to `_bmad-output/planning-artifacts/research/` so implementation artifacts (sprint-status.yaml, story files, retrospectives) are tracked in git. (2) A new Step 3e was added to harness-run that commits all changes after each story reaches `done` with message `feat: story {story_key} — {short title}`. (3) All five subagent prompts (create-story, dev-story, code-review, verifier, retrospective) gained explicit `Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml.` instructions. (4) AGENTS.md staleness was refactored from mtime-based comparison to content-based completeness checking: `checkAgentsMdCompleteness()` now lists source files in a module directory and checks whether each is mentioned in AGENTS.md. (5) Three new functions were added to `doc-health.ts`: `getSourceFilesInModule()`, `getMentionedFilesInAgentsMd()`, and `checkAgentsMdCompleteness()`.

**Story 12.3 — Unverifiable AC Detection & Escalation** added a new `[ESCALATE]` status distinct from PENDING. The `ParsedAC` interface gained a `verifiability` field (`cli-verifiable` | `integration-required`). A `classifyVerifiability()` heuristic function detects integration-required ACs by keywords (sprint planning, workflow, user session, etc.), with explicit `<!-- verification: integration-required -->` HTML comment tags as the authoritative override. `validateProofQuality()` now counts `[ESCALATE]` markers as a separate `escalated` count — escalated ACs are allowed (they are explicitly unverifiable, not missing evidence), so a proof with verified + escalated ACs but zero pending ACs still passes quality. The harness-run Step 3d was updated to distinguish handling: pending > 0 triggers verifier re-spawn, escalated > 0 halts with instructions to run integration verification manually. The create-story agent prompt now instructs tagging each AC with `<!-- verification: cli-verifiable -->` or `<!-- verification: integration-required -->`. A self-referential bug was discovered: when verifying Story 12.3 itself, the proof document contained `[ESCALATE]` markers as evidence of the escalation feature working, which triggered false escalation detection. This was addressed by ensuring the detection only looks at AC status lines, not embedded evidence content.

By the end of Epic 12, the project has 10,800 lines of production TypeScript across 43 source files and 20,688 lines of test code across 45 test files. All 1,437 unit tests pass. Coverage sits at 95.14% statements, 84.35% branches, 98.06% functions, 95.61% lines. Test execution time remains ~2.25s.

---

## What Went Well

### 1. Three-Layer Fix Was Thorough

The verification pipeline had three independent failure points — verifier agent prompt (no mandate for real evidence), CLI verify (binary check only), and harness-run Step 3d (no independent validation). Each was fixed independently so they cross-check each other. The verifier agent is told what to do, the CLI mechanically validates the output, and harness-run independently re-checks via CLI. No single layer trusts another. This is the correct architecture for verification.

### 2. Bugs Found During Implementation Validated the Need for the Epic

Four real bugs were discovered that could not have been found without actually using the verification pipeline:
1. `validateProofQuality()` only recognized HTML comment markers, not showboat's native bash+output format — proof files that had real evidence were being rejected.
2. `createProofDocument()` unconditionally overwrote existing proofs with skeletons — the verifier would capture evidence, then `codeharness verify` would destroy it.
3. Showboat `exec` appends to end of file rather than inserting within AC sections — a format mismatch with the template structure.
4. Self-referential proof problem: proofs about the escalation feature contain `[ESCALATE]` markers as evidence, triggering false escalation detection in the very proof that demonstrates the feature works.

Each bug was a real production defect, not a test artifact. The fact that Epic 11's skeleton proofs passed verification proves these bugs existed.

### 3. Coverage Held Steady Despite Corrective Nature

| Metric | Epic 11 (End) | Epic 12 (End) | Delta |
|--------|--------------|--------------|-------|
| Statement | 95.10% | 95.14% | +0.04 pts |
| Branch | 84.21% | 84.35% | +0.14 pts |
| Function | 98.02% | 98.06% | +0.04 pts |
| Line | 95.57% | 95.61% | +0.04 pts |

All four metrics improved slightly. No regressions despite significant refactoring in `verify.ts`, `doc-health.ts`, and `verify-parser.ts`. The 47 new tests (1,390 to 1,437) covered the new functionality adequately.

### 4. Content-Based AGENTS.md Staleness Eliminates False Positives

The mtime-based staleness check was a persistent source of false positives — any `npm run build` or file touch would mark AGENTS.md as stale even when it was complete and accurate. The new content-based check (`checkAgentsMdCompleteness()`) only reports staleness when a source file exists in the module directory but is not mentioned in AGENTS.md. This is the right check: does the documentation describe reality, not when was it last modified.

### 5. Subagent Boundary Enforcement Is Now Explicit

All five subagent prompts now contain explicit `Do NOT run git commit / git add / modify sprint-status.yaml` instructions. Previously, subagents would sometimes commit with misleading messages or update status inconsistently. Harness-run's new Step 3e owns the commit with a coherent message format (`feat: story {key} — {title}`).

---

## What Could Be Improved

### 1. Branch Coverage Still Below 85% Target

Branch coverage at 84.35% is 0.65 points below the 85% target. This has been flagged in every retrospective since Epic 8. The gap is concentrated in `scanner.ts` (72%), `verify.ts` (70.37%), `status.ts` (72.22%), and `coverage.ts` (76.19%). These files have complex multi-path logic with many error handling branches that are difficult to reach in unit tests.

### 2. Epic 11 Proofs Were Never Retroactively Fixed

This epic fixed the pipeline going forward, but the five Epic 11 stories still have skeleton proof documents. The verification debt from Epic 11 was not addressed. This is acceptable as a pragmatic decision (retroactive proofs add no value when the code is already deployed), but it means the proof trail has a gap.

### 3. Story 12.1 Status Header Shows `ready-for-dev`

Story 12.1's status header still shows `Status: ready-for-dev` while sprint-status.yaml shows `done`. Stories 12.2 and 12.3 show `Status: verified`. The `codeharness sync` command remains unwired in the workflow. This is the same issue flagged in every retro since Epic 1.

### 4. No New Source Files Created

All three stories modified existing files only — no new `.ts` modules were created. While this is fine for corrective work (fixes should land where the bugs are), it means Epic 12 did not extend the module architecture. The `verifiability` classification logic lives inside `verify-parser.ts` rather than in a dedicated module, which may make it harder to evolve independently.

### 5. Showboat Format Mismatch Is a Workaround, Not a Fix

The discovery that `showboat exec` appends to end of file rather than inserting within AC sections was addressed by making `validateProofQuality()` recognize both formats. The root cause — showboat not understanding the template's AC section structure — was not fixed. This means proof documents remain flat (all evidence at bottom) rather than structured (evidence inline with each AC).

---

## Lessons Learned

### L1: Verification Must Be Adversarial, Not Collaborative

The core lesson of Epic 12: a verification pipeline where the same agent that writes code also writes evidence is not verification — it is self-certification. The three-layer fix works because each layer independently checks: the verifier agent produces evidence, the CLI mechanically validates it, and harness-run re-checks via CLI. The architecture principle is that no layer trusts any other layer's output. This principle was present in the architecture document (Decision 8) but was not enforced until this epic.

### L2: `createProofDocument` Overwriting Was a Silent Data Destroyer

The `createProofDocument()` function was called unconditionally during `codeharness verify`, overwriting any evidence the verifier had already captured. This is a category of bug that is invisible during normal operation — you only discover it when you have real data to lose. The fix (check `existsSync` before creating) is trivial, but the bug existed across five epics worth of verification attempts. Defensive file operations (never overwrite without checking) should be the default pattern.

### L3: Self-Referential Testing Creates Paradoxes

When Story 12.3's proof document contained `[ESCALATE]` markers as evidence that the escalation feature works, the validation logic detected those markers and flagged the proof as having escalated ACs. The proof was simultaneously correct (it demonstrates escalation works) and triggering the feature it demonstrates. This is a general problem with tools that verify themselves: the verification evidence can contain the patterns being detected. The solution is scoping detection to AC status lines rather than the entire document, but the underlying tension remains.

### L4: mtime-Based Staleness Is Wrong for Documentation

The mtime-based AGENTS.md staleness check (`isDocStale()`) was wrong in principle, not just in practice. Documentation staleness is a content question: "does this document describe the current state of the code?" Comparing file modification timestamps answers a different question: "was this document touched after the code was last touched?" These are different questions. A file can be stale on day one (missing a newly added source file) or fresh after years (if the module hasn't changed). Content-based checking (`checkAgentsMdCompleteness()`) answers the right question.

### L5: Corrective Epics Generate More Insight Than Feature Epics

Epic 12 had only 3 stories but produced 4 bug discoveries, a fundamental architecture insight (L1), and a reusable pattern (content-based staleness). Feature epics (like Epic 11 with 5 stories) produce more code but fewer architectural corrections. The lesson: schedule corrective epics when systemic issues accumulate rather than trying to fix them incrementally within feature work. The bugs in Epic 12 had been latent since Epic 4 (when the verification pipeline was first built).

---

## Epic 11 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Raise branch coverage from 84.21% to 85%+ | Not done | Improved 0.14 pts to 84.35% — still 0.65 pts below target. |
| A2 | Run `codeharness retro-import --epic 11` to prove pipeline | Not done | Deferred — corrective epic took priority. |
| A3 | Add Epic 10 retrospective or document decision to skip | Not done | Deferred. |
| A4 | Wire `codeharness coverage` into CI | Not done | Permanent carry since Epic 4. |
| A5 | Complete Story 11.4 verification checkboxes | Not done | Permanent carry. |

**Summary:** 0 of 5 action items resolved. A1 made marginal progress (+0.14 pts). All others remain carries. The corrective nature of Epic 12 (fixing broken infrastructure) took priority over incremental improvements.

---

## Action Items for Next Epic

| # | Action | Owner | Target |
|---|--------|-------|--------|
| A1 | Raise branch coverage from 84.35% to 85%+ — focus on `verify.ts` (70.37% branch), `scanner.ts` (72%), `status.ts` (72.22%) | Dev | Next epic |
| A2 | Fix showboat format mismatch — showboat `exec` should insert evidence within AC sections, not append to end of file | Dev | Next epic |
| A3 | Run `codeharness retro-import --epic 12` to import this retro's action items into beads | SM | Immediate |
| A4 | Wire `codeharness sync` into harness-run after story status changes (carried since Epic 1) | Dev | Next epic |
| A5 | Wire `codeharness coverage` into CI (carried since Epic 4) | Dev | Next epic |

---

## Metrics

- **Stories planned:** 3
- **Stories completed:** 3
- **Stories failed:** 0
- **Bugs discovered during implementation:** 4
- **New production TypeScript files created:** 0
- **Production files substantially modified:** 7 (verify.ts, verify-parser.ts, doc-health.ts, verify command, harness-run.md, bmad-patches.ts, .gitignore)
- **Total new production lines:** ~271 (10,800 - 10,529)
- **Total production TypeScript files:** 43 (unchanged)
- **Total production lines of code:** 10,800
- **Test files modified:** 4 (verify.test.ts x2, doc-health.test.ts, verify-parser.test.ts)
- **Total new test lines:** ~634 (20,688 - 20,054)
- **Total test files:** 45 (unchanged)
- **Total unit tests:** 1,437 (up from 1,390, +3.4%)
- **Total test lines:** 20,688 (up from 20,054, +3.2%)
- **Statement coverage:** 95.14% (up from 95.10%)
- **Branch coverage:** 84.35% (up from 84.21%)
- **Function coverage:** 98.06% (up from 98.02%)
- **Line coverage:** 95.61% (up from 95.57%)
- **Build output:** ESM bundle via tsup
- **Test execution time:** ~2.25s (vitest)
- **Epic 11 retro actions resolved:** 0 of 5

### Growth Across Epics

| Metric | Epic 11 (End) | Epic 12 (End) | Delta |
|--------|--------------|--------------|-------|
| Production lines | 10,529 | 10,800 | +271 (+2.6%) |
| Test lines | 20,054 | 20,688 | +634 (+3.2%) |
| Unit tests | 1,390 | 1,437 | +47 (+3.4%) |
| Source files | 43 | 43 | 0 |
| Test files | 45 | 45 | 0 |
| Statement coverage | 95.10% | 95.14% | +0.04 pts |
| Branch coverage | 84.21% | 84.35% | +0.14 pts |
| Function coverage | 98.02% | 98.06% | +0.04 pts |
| Line coverage | 95.57% | 95.61% | +0.04 pts |

### Test-to-Production Ratio

- **Test lines per production line:** 1.92x (20,688 / 10,800) — up from 1.90x at Epic 11
- **Tests per source file:** 31.9 (1,437 / 45)
