# Session Retrospective — 2026-03-25

**Sprint:** Operational Excellence (Epic 13-14 — AgentDriver + Retro Pipeline)
**Session:** 10 (continuation from session 9 on 2026-03-24)
**Session window:** ~2026-03-24 20:14 UTC to ~2026-03-25 02:05 UTC (~6 hours)

---

## 1. Session Summary

| Story | Epic | Outcome | Pipeline Stages | Commit Time |
|-------|------|---------|-----------------|-------------|
| 13-1-agentdriver-interface-and-types | Epic 13 (AgentDriver) | done | create-story, dev-story, code-review, verification | 2026-03-24 20:14 |
| 13-2-ralph-driver-implementation | Epic 13 (AgentDriver) | done | create-story, dev-story, code-review, verification | 2026-03-24 20:14 |
| 13-3-migrate-run-ts-to-agentdriver | Epic 13 (AgentDriver) | done | create-story, dev-story, code-review, verification | 2026-03-24 20:37 |
| 14-1-retro-to-sprint-pipeline-epic-td | Epic 14 (Tech Debt Pipeline) | done | create-story, dev-story, code-review, verification | 2026-03-25 02:05 |

**Net progress:** Epic 13 fully closed (all 3 stories done). Epic 14 started — 1 of 7 stories done, 6 remain in backlog. Overall sprint: 54 of 66 stories done (82%).

All four stories passed the full pipeline: story creation, development, adversarial code review, and verification. No story required retry.

---

## 2. Issues Analysis

### Bugs Discovered During Implementation or Verification

| Severity | Story | Issue | Fixed? |
|----------|-------|-------|--------|
| HIGH | 14-1 | `generateSlug('')` returned `''`, creating malformed TD story keys like `TD-1-` | Yes |
| HIGH | 14-1 | `backlogAppended` reported items as persisted when `projectRoot` was omitted — misleading return value | Yes |
| HIGH | 14-1 | `wordOverlap` exceeded 1.0 with duplicate words in input, breaking the 0-1 dedup contract | Yes |
| MEDIUM | 14-1 | Missing test for no-projectRoot code path in backlog append | Yes |

Code review caught 3 HIGH bugs and 1 MEDIUM gap in story 14-1. All fixed in the same review cycle. The `wordOverlap > 1.0` bug was a set-vs-array issue — using `new Set()` for deduplication resolved it.

### Workarounds Applied (Tech Debt Introduced)

1. **`getExistingTdTitles` reconstructs titles from slugs** (14-1, LOW, not fixed) — Slug-to-title reverse mapping loses fidelity (hyphens could be spaces or original hyphens). Acceptable for dedup threshold matching but not exact comparisons.
2. **`createTdStory` implicitly creates `epic-TD` via spread+override** (14-1, LOW, not fixed) — Does not call `ensureEpicTd()` explicitly, relying on caller to have done so. Works but fragile if called directly.

### Code Quality Concerns

1. **`state.ts` at 543 lines** — exceeds the 300-line limit (NFR5). Pre-existing from before this session. The epic-TD override was a minimal 2-line addition to `generateSprintStatusYaml()`, so the story did not meaningfully worsen it.
2. **`sprint-yaml.test.ts` at 388 lines** — also over the limit. Pre-existing.
3. **No test for `appendToBacklogFile` append-to-existing path or error handling** — Coverage gap noted by code review. The happy path (create new file) is tested; the append and error paths are not.

### Verification Gaps

None significant. All 10 ACs for story 14-1 passed unit-testable verification with direct CLI checks. No ACs were escalated or given weak evidence.

### Tooling/Infrastructure Problems

1. **Disk space critically low (45MB free)** — BATS integration tests failed with "No space left on device" during 14-1 verification. Resolved by clearing npm cache (freed 2.2GB). This is a recurring risk on this machine.
2. **AGENTS.md for `src/lib/` was stale** — missing `retro-to-sprint.ts` entry. Fixed during verification. AGENTS.md maintenance continues to be a manual step that gets missed.

---

## 3. What Went Well

- **4 stories completed in one session** — Epic 13 closed entirely (3 stories) plus the first story of Epic 14. High throughput.
- **Zero retries** — Every story passed through the pipeline on the first attempt. No stuck stories, no rollbacks.
- **Adversarial code review caught real bugs** — 3 HIGH bugs in 14-1 were found and fixed before verification. The review process is paying for itself.
- **New code is well-structured** — `retro-to-sprint.ts` and `retro-parser-sections.test.ts` are new files under the 300-line limit, following the domain separation pattern established in Epic 12.
- **Dedup logic is solid** — Set-based word overlap with `min(|a|, |b|)` denominator prevents false positives from short items matching long unrelated items.

---

## 4. What Went Wrong

- **Disk space crisis** — 45MB free on the machine nearly blocked verification. This is the second time disk pressure has caused problems. npm cache was the culprit (2.2GB).
- **AGENTS.md drift** — New files added to `src/lib/` were not reflected in the directory's AGENTS.md until verification caught it. This happens every session.
- **state.ts continues to grow** — Story 14-1's dev notes explicitly recommended putting TD functions in a separate file (`td-state.ts`), but the functions ended up in `retro-to-sprint.ts` instead. The `generateSprintStatusYaml()` modification still went into the already-oversized `state.ts`. No progress on splitting this file.

---

## 5. Lessons Learned

### Repeat
- **Adversarial code review before verification** — caught 3 HIGH bugs that would have been harder to find later.
- **New functionality in new files** — `retro-to-sprint.ts` kept the codebase modular rather than inflating existing files.
- **Set-based dedup** — Using `new Set()` for word overlap calculation is a pattern worth reusing in any fuzzy-match scenario.

### Avoid
- **Letting disk space go unchecked** — Should proactively clear caches before long autonomous sessions.
- **Assuming AGENTS.md is up to date** — Verification should always check AGENTS.md for new files. Consider automating this.
- **Deferring file splits** — `state.ts` has been over 300 lines for multiple sessions. Each session adds a tiny bit more. The split should happen proactively.

---

## 6. Action Items

### Fix Now (Before Next Session)
- Clear disk space: run `npm cache clean --force` and check for other caches (brew, docker). Target >5GB free.
- Verify `src/lib/AGENTS.md` lists all current `.ts` files in the directory.

### Fix Soon (Next Sprint)
- **Split `state.ts`** — Extract `generateSprintStatusYaml()` and related helpers into `src/modules/sprint/sprint-yaml.ts`. This has been deferred for 3+ sessions. Story 15-4 or a new TD story should cover it.
- **Add `appendToBacklogFile` error/append tests** — Coverage gap from 14-1 code review. Quick fix, <30 minutes.
- **Add AGENTS.md auto-check to verification** — Verification subagent should compare directory listing to AGENTS.md entries and flag missing files.

### Backlog (Track But Not Urgent)
- `getExistingTdTitles` slug-to-title fidelity loss — acceptable for threshold matching but may cause false negatives if titles contain hyphens. Monitor.
- `createTdStory` should call `ensureEpicTd()` internally for safety — defensive coding improvement.
- Automate disk space check at session start — ralph could abort early if <500MB free.
