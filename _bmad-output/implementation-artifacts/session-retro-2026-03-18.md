# Session Retrospective — 2026-03-18

**Sprint:** Architecture Overhaul Sprint
**Session window:** ~04:30Z – 04:45Z (estimated from issue timestamps)
**Stories attempted:** 2
**Stories completed:** 2 (both marked done)

---

## 1. Session Summary

| Story | Outcome | Notes |
|-------|---------|-------|
| 1-1-result-type-shared-types | Done | All 6 ACs verified (0 pending, 0 escalated). Blocked by black-box enforcement bug — required manual workaround. |
| 1-2-module-skeleton-index-pattern | Done | Story created, implemented, code-reviewed, and completed. 95.37% coverage. Two HIGH mutability issues found and fixed in review. |

Both stories in Epic 1 that were attempted are now done. Story 1-3 (migrate existing tests) remains in backlog.

---

## 2. Issues Analysis

### Bugs discovered

1. **Black-box enforcement applied unconditionally (verify.ts:112)** — `checkBlackBoxEnforcement()` requires docker-exec/docker-host/observability commands in every AC proof section. Unit-testable stories that use `npx tsx` or local commands get flagged as failing (`blackBoxPass=false`) even when all ACs are verified. This is the most significant bug found this session. It actively blocks the verification pipeline for an entire category of stories.

2. **`import.meta.dirname` requires Node 21.2+** — Used in `import-boundaries.test.ts`. Project targets `node>=18`. Works under vitest but would break under Node 18-20 direct execution. Minor compatibility risk.

### Workarounds applied (tech debt introduced)

1. **Story 1-1 manual verification bypass** — Verified proof quality from JSON output instead of relying on exit code. This means the automation cannot be trusted for unit-testable stories until the black-box enforcement bug is fixed. Any future session running `codeharness verify` on unit-testable stories will hit the same wall.

### Code quality concerns (found in review)

1. **Mutable arrays in Result types** — `VerifyResult.acResults` was `AcResult[]` instead of `ReadonlyArray<AcResult>`. `ProofQuality.issues` was `string[]` instead of `readonly string[]`. Both fixed during review. Pattern: new type definitions defaulting to mutable when the project convention is immutable.

2. **Module-specific types are stub-quality** — Fields like `InitOptions.template`, `DevResult.filesChanged` are placeholders. Will need refinement in stories 2.x-6.x. Acceptable for skeleton story, but creates a revision burden later.

### Verification gaps

1. **import-boundaries.test.ts silently passes when COMMANDS_DIR missing** — Test skips instead of failing in environments without the commands directory. False green. Not fixed this session (LOW priority per review).

### Design ambiguities

1. **`getObservabilityBackend()` return type mismatch** — Architecture Decision 3 specifies a bare return type, while all other functions return `Result<T>`. Stub had to work around this inconsistency. Needs architectural clarification before Epic 7.

2. **AC #3 "no command file exceeds 100 lines"** — 16 of 17 command files currently exceed this limit. The AC is aspirational and cannot pass until future stories extract logic into modules. Story framed it as documenting the gap.

### Tooling/infrastructure problems

None reported this session.

---

## 3. What Went Well

- **Two stories completed in a single session** — Story 1-1 (shared types) and 1-2 (module skeleton) both reached done status. Epic 1 is 2/3 complete.
- **Code review caught real issues** — Two HIGH-severity mutability violations were found and fixed before merge. The review step is earning its keep.
- **95.37% test coverage** — All 64 files above 80% floor. Strong foundation for the skeleton layer.
- **Session issues log was used properly** — Every subagent (verification, create-story, dev, code-review) logged problems as they arose. This made the retrospective possible from real data rather than memory.

---

## 4. What Went Wrong

- **Black-box enforcement bug wasted verification time** — The verifier reported failure on a fully-verified story. The human had to manually inspect JSON output and override. This is a process bottleneck — the automation should have passed cleanly.
- **Types-only files show 0% coverage** — `types.ts` files containing only interfaces report 0 statements to v8. Not a real gap, but it pollutes coverage reports and could trigger false alarms in CI if minimum thresholds are enforced at the file level.

---

## 5. Lessons Learned

**Repeat:**
- Logging issues in `.session-issues.md` as they happen. Every entry here was actionable.
- Running code review as a separate step after dev — caught mutability violations that would have propagated.

**Avoid:**
- Assuming the verification pipeline handles all story types. The unit-testable vs. black-box distinction was added recently (v0.19.1) but the enforcement logic was not updated to respect it.
- Defining types as mutable by default. Use `readonly` and `ReadonlyArray` from the start.

---

## 6. Action Items

### Fix now (before next session)

- [ ] **Fix black-box enforcement for unit-testable stories** — `validateProofQuality` in `src/lib/verify.ts` must skip `checkBlackBoxEnforcement()` when the story is classified as unit-testable (or when no black-box tier is specified). This blocks all future unit-testable story verification. Ref: story 1-1 workaround.

### Fix soon (next sprint)

- [ ] **Replace `import.meta.dirname` with Node 18-compatible alternative** — In `import-boundaries.test.ts`. Use `path.dirname(fileURLToPath(import.meta.url))` or similar.
- [ ] **Make import-boundaries.test.ts fail instead of skip when COMMANDS_DIR missing** — Silent skip creates false green results.
- [ ] **Clarify `getObservabilityBackend()` return type** — Resolve mismatch between architecture doc and Result<T> convention before Epic 7 begins.

### Backlog (track but not urgent)

- [ ] **Handle types-only files in coverage reporting** — Either exclude `types.ts` files from coverage or set a per-file exception so 0% on interface-only files doesn't trigger alarms.
- [ ] **Refine module-specific stub types** — `InitOptions`, `DevResult`, etc. are placeholders. Revisit as each module's story is implemented (Epics 2-6).
- [ ] **Reduce command file line counts below 100** — 16/17 files exceed the limit. Track as ongoing tech debt to resolve as modules absorb logic.
