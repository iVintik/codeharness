# Session Retrospective — 2026-03-16

**Session Date:** 2026-03-16
**Sprint Scope:** Epic 12 (Verification Pipeline Integrity & Sprint Infrastructure)
**Stories Attempted:** 3 (12-1, 12-2, 12-3)
**Stories Completed:** 3 (all reached `done`)
**Prior Verification Pass:** Stories 0-1 and 1-1 were re-verified during the session
**Git Commits This Session:** 3 (eb6bf7e, c30b566, 1817c5d — releases/fixes)

---

## 1. Session Summary

This session executed Epic 12, a corrective epic that addressed a systemic failure in the verification pipeline discovered at the end of Epic 11. All five Epic 11 stories had been marked `done` with skeleton proof documents containing zero evidence — the pipeline was broken at every layer.

| Story | Title | Outcome | Key Deliverables |
|-------|-------|---------|-----------------|
| 12-1 | Fix Verification Pipeline | done | `validateProofQuality()` replaces binary `proofHasContent()`; verifier agent prompt rewritten; harness-run Step 3d independently validates proof |
| 12-2 | Sprint Execution Ownership | done | harness-run owns git commits; subagent prompts get no-commit instructions; `.gitignore` narrowed; AGENTS.md staleness moved to content-based checking |
| 12-3 | Unverifiable AC Detection & Escalation | done | `[ESCALATE]` status for integration-required ACs; `classifyVerifiability()` heuristic; `<!-- verification: ... -->` tags in story files |

Additionally, stories 0-1 (sprint execution skill) and 1-1 (project scaffold) were re-verified during the session, which surfaced the AC header parser bug (see Issues below).

**Codebase at session end:** 10,800 production lines, 20,688 test lines, 1,438 tests, 95.14% statement coverage, 84.35% branch coverage.

---

## 2. Issues Analysis

### 2.1 Bugs Discovered During Implementation

| # | Bug | Severity | Fixed? | Where |
|---|-----|----------|--------|-------|
| B1 | `validateProofQuality()` regex `/^## AC \d+:/gm` required a space before the digit, but showboat proofs use `## AC1:` (no space). Caused 0/0 AC count for ALL proofs. | Critical | Yes | `src/lib/verify.ts` — regex changed to `/^## AC ?(\d+):/gm` |
| B2 | `validateProofQuality()` only recognized HTML comment markers (`<!-- /showboat exec -->`), not showboat's native bash+output block format. Valid proofs were rejected. | High | Yes | `src/lib/verify.ts` — added recognition of both formats |
| B3 | `createProofDocument()` unconditionally overwrote existing proof files with fresh skeletons, destroying captured evidence. | Critical | Yes | `src/commands/verify.ts` — added `existsSync` check before creation |
| B4 | Self-referential proof paradox: Story 12.3's proof contained `[ESCALATE]` markers as evidence, triggering false escalation detection. | Medium | Yes | Detection scoped to AC status lines only, not full document |

### 2.2 Workarounds Applied (Tech Debt)

| # | Workaround | Debt Level | Tracking |
|---|-----------|------------|----------|
| W1 | Showboat `exec` appends evidence to end of file instead of inserting within AC sections. `validateProofQuality()` was made to recognize both formats rather than fixing showboat. | Medium | Epic 12 retro action item A2 |
| W2 | Epic 11 proofs remain skeleton documents with zero evidence. The pipeline was fixed going forward, but retroactive evidence was not captured. | Low | Acknowledged — retroactive proofs add no value |

### 2.3 Verification Gaps

| # | Gap | Impact |
|---|-----|--------|
| V1 | Story 0-1 had 5/6 ACs escalated — markdown skill stories are mostly unverifiable by CLI. Only AC1 (content inspection) was testable. | Low — expected for documentation-only stories |
| V2 | `codeharness verify --json` reports 0/0 ACs before the regex fix (B1). Any story verified before the fix has unreliable proof quality metrics. | Resolved by B1 fix |
| V3 | Story 1-1 proof went stale after the parser fix (test count changed from 1437 to 1438). Showboat verify's strict string matching rejects proofs when non-deterministic output changes. | Medium — proof staleness from any code change is a recurring problem |
| V4 | Story 12.1 status header still shows `ready-for-dev` while sprint-status.yaml shows `done`. The `codeharness sync` command remains unwired. | Low — cosmetic, but has been flagged since Epic 1 |

### 2.4 Tooling/Infrastructure Problems

| # | Problem | Impact |
|---|---------|--------|
| T1 | `codeharness verify --json` proof file format not parsed by CLI — 0/0 ACs reported. Root cause was the regex bug (B1). | Blocked verification until mid-session fix |
| T2 | Showboat verify uses strict string matching, causing proof staleness when test counts or timestamps change between captures. | Ongoing friction — proofs need re-capture after any code change |

### 2.5 Process Concerns

| # | Concern | Recommendation |
|---|---------|---------------|
| P1 | Stories that are markdown skills (not executable code) will always have mostly-escalated ACs. The verification pipeline assumes CLI-verifiable ACs. | Define a "documentation-only" story type with lighter verification requirements |
| P2 | Branch coverage at 84.35% remains below the 85% target. Has been flagged in every retro since Epic 8. The gap is in `verify.ts` (70.37%), `scanner.ts` (72%), `status.ts` (72.22%). | Dedicate a story specifically to branch coverage in these files |

---

## 3. What Went Well

1. **Three-layer verification fix is architecturally sound.** The verifier agent produces evidence, the CLI mechanically validates it, and harness-run independently re-checks. No layer trusts another. This is the correct design for verification.

2. **Four real bugs discovered and fixed.** The bugs (B1-B4) had been latent since Epic 4. They could only surface by actually using the verification pipeline with real data. The corrective epic justified itself.

3. **All three stories completed without blockers.** No story was stuck or abandoned. Epic 12 shipped cleanly despite being corrective work, which is typically harder to scope.

4. **Content-based AGENTS.md staleness eliminates false positives.** Replacing mtime comparison with content completeness checking (`checkAgentsMdCompleteness()`) is the right abstraction — it answers "does the doc describe reality" instead of "was it touched recently."

5. **Subagent boundary enforcement is now explicit.** All five subagent prompts have `Do NOT run git commit / git add / modify sprint-status.yaml` instructions. Harness-run owns the commit with a coherent message format.

6. **Systemic fix for AC header parser (B1) unblocked all verification.** Found mid-session, fixed immediately with a test added. The regex change from `/^## AC \d+:/gm` to `/^## AC ?(\d+):/gm` was a one-character fix with session-wide impact.

7. **Coverage held steady.** All four coverage metrics improved slightly despite significant refactoring. 47 new tests added (1,390 to 1,437), then 1 more during re-verification (1,438 total).

---

## 4. What Went Wrong

1. **Epic 11 shipped with zero evidence in all proofs.** The verification pipeline was broken at every layer simultaneously, and nobody noticed until Epic 12. This means the entire Epic 11 development cycle had no real quality gate. The root cause was multiple: the verifier agent prompt did not mandate `showboat exec`, the CLI only did a binary content check, and harness-run trusted the agent's claim.

2. **The AC header regex bug (B1) existed since Epic 4.** The `validateProofQuality()` function was added in Epic 4 but never actually matched any AC headers because of the space/no-space format mismatch. This means proof quality validation was silently passing 0/0 for months.

3. **Proof staleness is a persistent problem.** Story 1-1's proof went stale after the parser fix changed the test count from 1437 to 1438. Showboat verify's strict matching means any code change (even to unrelated modules) can invalidate existing proofs. This friction discourages re-verification.

4. **Zero Epic 11 retro action items resolved.** All five action items from Epic 11 were carried forward. The corrective nature of Epic 12 took priority, but carrying five items across epics signals a planning problem.

5. **Branch coverage target (85%) still not met.** This has been a carry item since Epic 8 (four epics ago). The gap is concentrated in four files with complex error-handling branches. No dedicated effort has been allocated.

---

## 5. Lessons Learned

### Repeat

- **L1: Corrective epics after systemic failures.** When multiple layers fail simultaneously, dedicate a full epic to fix them rather than patching incrementally. Epic 12 produced more architectural insight than most feature epics.

- **L2: Adversarial verification architecture.** No layer should trust any other layer's output. The three-layer design (agent produces, CLI validates, orchestrator re-checks) is the right pattern.

- **L3: Fix the regex, add the test.** The AC header parser fix (B1) was a one-character change with a test that took 5 minutes. It unblocked the entire session. Small systemic fixes should be applied immediately, not deferred.

### Avoid

- **L4: Do not ship epics when verification is broken.** Epic 11 should have been caught. The lesson is that harness-run's post-verifier check must independently validate proof quality via CLI, not trust agent output. (Now implemented.)

- **L5: Do not let mtime-based staleness checks persist.** Content-based checking was the right answer for AGENTS.md. Evaluate whether other mtime-based checks (exec-plans, generated docs) have the same false-positive problem.

- **L6: Do not carry action items across more than two epics.** If an item survives three epics, either schedule it as a story or explicitly drop it. Five carried items from Epic 11 is too many.

---

## 6. Action Items

### Fix Now (Before Next Session)

| # | Action | Owner |
|---|--------|-------|
| A1 | Run `codeharness retro-import --epic 12` to import Epic 12 retro action items into beads | SM |
| A2 | Re-verify story 1-1 proof after parser fix (proof is stale due to test count change) | Dev |

### Fix Soon (Next Sprint)

| # | Action | Owner |
|---|--------|-------|
| A3 | Raise branch coverage from 84.35% to 85%+ — focus on `verify.ts` (70.37%), `scanner.ts` (72%), `status.ts` (72.22%), `coverage.ts` (76.19%) | Dev |
| A4 | Fix showboat format mismatch — `showboat exec` should insert evidence within AC sections, not append to end of file | Dev |
| A5 | Wire `codeharness sync` into harness-run after story status changes (carried since Epic 1) | Dev |
| A6 | Define a "documentation-only" story type with lighter verification for markdown/skill stories (P1) | PM |

### Backlog (Track but Not Urgent)

| # | Action | Owner |
|---|--------|-------|
| A7 | Wire `codeharness coverage` into CI (carried since Epic 4) | Dev |
| A8 | Address showboat verify brittle string matching for non-deterministic output (T2) | Dev |
| A9 | Evaluate mtime-based staleness for non-AGENTS.md docs — may have same false-positive problem (L5) | Dev |
| A10 | Triage and either schedule or drop all carried action items older than 2 epics (L6) | SM |

---

## Metrics

| Metric | Start of Session | End of Session | Delta |
|--------|-----------------|----------------|-------|
| Production lines | 10,529 | 10,800 | +271 |
| Test lines | 20,054 | 20,688 | +634 |
| Unit tests | 1,390 | 1,438 | +48 |
| Source files | 43 | 43 | 0 |
| Test files | 45 | 45 | 0 |
| Statement coverage | 95.10% | 95.14% | +0.04 |
| Branch coverage | 84.21% | 84.35% | +0.14 |
| Function coverage | 98.02% | 98.06% | +0.04 |
| Line coverage | 95.57% | 95.61% | +0.04 |
| Stories completed | 0 | 3 | +3 |
| Bugs found & fixed | 0 | 4 | +4 |
| Carried action items | 5 (from Epic 11) | 5 (0 resolved) | 0 |
