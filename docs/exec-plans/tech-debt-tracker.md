# Tech Debt Tracker

## Active Items

### TD-001: Docker Test Infrastructure Needs Generalization

**Logged:** 2026-03-15 (Story 0.1 verification)
**Severity:** Medium
**Connected to:** Epic 4 (Story 4.1 — Verification Pipeline)

**Problem:** During Story 0.1 verification, we built Docker test infrastructure from scratch (`tests/docker/`). It took 6 Dockerfile iterations to get right (git identity, root vs non-root, .dockerignore, empty commits, permissions). The resulting setup works but is specific to Story 0.1.

**What exists now:**
- `tests/docker/Dockerfile.harness-test` — builds a Claude Code container with test fixtures
- `tests/docker/run-harness-test.sh` — builds, runs, captures proof document
- `tests/docker/fixtures/` — test sprint-status and story fixtures
- `.dockerignore` — excludes `.env`, `.git`, `node_modules`

**What's missing:**
- No reusable template for testing arbitrary skills/commands in Docker
- No parameterized fixture generation (currently hardcoded to one story)
- No failure-path testing (retry logic, cycle limits, halting)
- Story 4.1 (`codeharness verify`) should formalize this as the verification runtime
- The Dockerfile pattern (non-root user, git init, Claude Code CLI) should be a template in `templates/`

**Action:** When implementing Story 4.1, extract and generalize the Docker test infrastructure into a reusable verification runtime. The `tests/docker/` setup is the prototype.

---

### TD-002: AC5 (Retry Logic) Not Fully Verified

**Logged:** 2026-03-15 (Story 0.1 verification)
**Severity:** Low
**Connected to:** Story 0.1

**Problem:** The Docker test used a happy-path fixture (trivial story that succeeds). Retry logic (max_retries=3, max_cycles=5) was verified at initialization level only — never triggered during the test run.

**What would be needed:**
- A fixture that forces a failure (e.g., story with impossible AC)
- A fixture that triggers dev↔review cycling (story with perpetual code review issues)
- Both would require longer test runs and more API usage

**Action:** Consider adding failure-path fixtures to `tests/docker/fixtures/` when Epic 4 adds quality gates. The gates will naturally create more failure scenarios to test against.
