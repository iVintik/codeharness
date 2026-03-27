# Story 16-7: Update Knowledge and Enforcement Docs for New Tiers
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want all knowledge files and enforcement patches to reference the new four-tier verification system,
So that agents reading these docs get consistent, accurate guidance about verification tiers.

## Acceptance Criteria

- [ ] AC1: Given `knowledge/verification-patterns.md`, when inspected, then it includes a tier decision guide section explaining all four tiers with examples <!-- verification: test-provable -->
- [ ] AC2: Given `knowledge/verification-patterns.md`, when inspected, then it does not reference `cli-verifiable` or `integration-required` as current terminology (may mention them as legacy for context) <!-- verification: test-provable -->
- [ ] AC3: Given `patches/dev/enforcement.md`, when inspected, then the "Black-Box Thinking" section (L39-L45) is updated to reference tier-appropriate verification instead of only black-box <!-- verification: test-provable -->
- [ ] AC4: Given `patches/review/enforcement.md`, when inspected, then any references to old verification terminology are updated to new tier names <!-- verification: test-provable -->
- [ ] AC5: Given `patches/verify/story-verification.md`, when inspected, then the "Verification Tags" section (L22-L28) references the four new tier names instead of `cli-verifiable` / `integration-required` <!-- verification: test-provable -->
- [ ] AC6: Given `patches/verify/story-verification.md`, when inspected, then the "Proof Standard" section (L14-L20) notes that Docker evidence is only required for `environment-provable` tier, not all stories <!-- verification: test-provable -->
- [ ] AC7: Given all four files, when searched for `cli-verifiable` or `integration-required`, then zero matches are found outside of explicit "legacy format" notes <!-- verification: test-provable -->

## Technical Notes

**File:** `knowledge/verification-patterns.md` (92 lines)

Add a new section at the top (after the frontmatter) — "Verification Tier Guide":

```markdown
## Verification Tier Guide

Every AC is tagged with one of four verification tiers based on what evidence is needed:

| Tier | What it proves | How to verify |
|------|---------------|---------------|
| `test-provable` | Code structure + passing tests = sufficient | Build, run tests, grep/read code. No running app. |
| `runtime-provable` | Running the built artifact = sufficient | Build -> run binary/server -> interact -> check output. |
| `environment-provable` | Full environment with services = needed | Docker stack, databases, observability. |
| `escalate` | Cannot be proven automatically | Human judgment, hardware, paid services. |

Story tier = max(AC tiers). If any AC is `environment-provable`, the story is `environment-provable`.
```

Keep existing UI/API/DB/Log verification pattern sections — they describe HOW to verify within each tier, which is still valid.

**File:** `patches/dev/enforcement.md` (53 lines)

Update "Black-Box Thinking" section (L39-L45): Rename to "Verification Thinking". Replace the three bullet points with tier-aware guidance:
- `test-provable`: Can tests and code inspection prove this works?
- `runtime-provable`: Can running the binary prove this works?
- `environment-provable`: Can Docker + observability prove this works?
- `escalate`: Does this genuinely require human judgment?

**File:** `patches/review/enforcement.md` (41 lines)

Scan for any `cli-verifiable` / `integration-required` references and update.

**File:** `patches/verify/story-verification.md` (57 lines)

- L22-L28 "Verification Tags" section: Replace the two tag options with four:
  - `<!-- verification: test-provable -->` — Build + test + code inspection
  - `<!-- verification: runtime-provable -->` — Build + run + interact
  - `<!-- verification: environment-provable -->` — Full Docker stack
  - `<!-- verification: escalate -->` — Human judgment required
- L14-L20 "Proof Standard" section: Note that `docker exec` evidence is required only for `environment-provable` tier. `test-provable` proofs use test output and code inspection. `runtime-provable` proofs use local execution output.

## Files to Change

- `knowledge/verification-patterns.md` — Add tier decision guide section at top. Keep existing verification pattern sections.
- `patches/dev/enforcement.md` — Rename "Black-Box Thinking" to "Verification Thinking" with tier-aware guidance.
- `patches/review/enforcement.md` — Update any old tier terminology.
- `patches/verify/story-verification.md` — Rewrite "Verification Tags" section with four tiers. Update "Proof Standard" to be tier-aware.
