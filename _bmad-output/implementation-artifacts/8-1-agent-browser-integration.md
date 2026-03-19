# Story 8.1: Agent-Browser Integration

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a web developer,
I want verification to use agent-browser for UI testing inside Docker containers,
so that web features are verified with real browser interaction and screenshot evidence is captured as proof.

## Acceptance Criteria

1. **Given** `src/modules/verify/browser.ts` exists, **When** imported, **Then** it exports a `BrowserVerifier` class with methods `navigate(url)`, `screenshot(label)`, `click(selector)`, `type(selector, text)`, and `evaluate(script)`, each returning `Result<BrowserActionResult>`. <!-- verification: cli-verifiable -->
2. **Given** a `BrowserVerifier` instance constructed with a container name, **When** `navigate(url)` is called, **Then** it executes `docker exec <container> agent-browser navigate <url>` and returns the command output in `Result<BrowserActionResult>`. <!-- verification: cli-verifiable -->
3. **Given** a `BrowserVerifier` instance, **When** `screenshot(label)` is called, **Then** it executes `docker exec <container> agent-browser screenshot --output /workspace/verification/screenshots/<label>.png` and returns the screenshot path in the result. <!-- verification: cli-verifiable -->
4. **Given** a `BrowserVerifier` instance, **When** any action method fails (non-zero exit, timeout, container not running), **Then** it returns `fail(errorMessage, { command, exitCode? })` and never throws. <!-- verification: cli-verifiable -->
5. **Given** `templates/Dockerfile.verify` updated, **When** the verify image is built, **Then** `agent-browser` is installed via `npm install -g @anthropic-ai/agent-browser` and available on PATH inside the container. <!-- verification: integration-required -->
6. **Given** `templates/Dockerfile.verify.generic` updated, **When** the generic verify image is built, **Then** `agent-browser` is installed via `npm install -g @anthropic-ai/agent-browser` and available on PATH inside the container. <!-- verification: integration-required -->
7. **Given** screenshots captured during verification, **When** the proof document is assembled, **Then** screenshot paths are listed under a `## Screenshots` section with the label and relative path (e.g., `verification/screenshots/login-page.png`). <!-- verification: cli-verifiable -->
8. **Given** a before-action screenshot and an after-action screenshot exist, **When** `diffScreenshots(beforePath, afterPath)` is called, **Then** it returns `Result<DiffResult>` indicating whether visual differences were detected between the two images. <!-- verification: cli-verifiable -->
9. **Given** `src/modules/verify/browser.ts`, **When** reviewed, **Then** it does not exceed 300 lines (NFR18) and all public functions return `Result<T>`. <!-- verification: cli-verifiable -->
10. **Given** all new code in `browser.ts`, **When** unit tests run, **Then** 100% coverage is achieved on new/changed code, with `child_process.execSync` mocked via `vi.mock` or equivalent. <!-- verification: cli-verifiable -->
11. **Given** the verify module's `index.ts`, **When** updated, **Then** it re-exports `BrowserVerifier`, `BrowserActionResult`, and `DiffResult` from `browser.ts` following the existing module boundary pattern. <!-- verification: cli-verifiable -->
12. **Given** a `BrowserVerifier` instance, **When** `isAvailable()` is called, **Then** it checks whether `agent-browser` is installed in the container by running `docker exec <container> which agent-browser` and returns `Result<boolean>`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/verify/browser.ts` (AC: #1, #2, #3, #4, #8, #9, #12)
  - [x] Define `BrowserActionResult` and `DiffResult` interfaces
  - [x] Implement `BrowserVerifier` class with container name constructor parameter
  - [x] Implement `navigate(url)` — executes `docker exec <container> agent-browser navigate <url>`
  - [x] Implement `screenshot(label)` — captures screenshot to `verification/screenshots/<label>.png`
  - [x] Implement `click(selector)` — executes `docker exec <container> agent-browser click <selector>`
  - [x] Implement `type(selector, text)` — executes `docker exec <container> agent-browser type <text>`
  - [x] Implement `evaluate(script)` — executes `docker exec <container> agent-browser evaluate <script>`
  - [x] Implement `diffScreenshots(beforePath, afterPath)` — compares two screenshots
  - [x] Implement `isAvailable()` — checks agent-browser presence in container
  - [x] All methods return `Result<T>`, catch all errors, never throw
  - [x] Use `child_process.execSync` for docker exec commands
- [x] Task 2: Add types to `src/modules/verify/types.ts` (AC: #1, #8)
  - [x] Add `BrowserActionResult` interface with `output`, `screenshotPath?`, `exitCode`
  - [x] Add `DiffResult` interface with `hasDifferences`, `beforePath`, `afterPath`
- [x] Task 3: Update `src/modules/verify/index.ts` re-exports (AC: #11)
  - [x] Re-export `BrowserVerifier` class
  - [x] Re-export `BrowserActionResult` and `DiffResult` types
- [x] Task 4: Update `templates/Dockerfile.verify` (AC: #5)
  - [x] Add `@anthropic-ai/agent-browser` to npm install -g line
  - [x] Install Chromium dependencies for headless browser support
- [x] Task 5: Update `templates/Dockerfile.verify.generic` (AC: #6)
  - [x] Add `@anthropic-ai/agent-browser` to npm install -g line
  - [x] Install Chromium dependencies for headless browser support
- [x] Task 6: Create `src/modules/verify/__tests__/browser.test.ts` (AC: #10)
  - [x] Mock `child_process.execSync` globally
  - [x] Test `navigate()` — URL passed to docker exec command, success/failure handling
  - [x] Test `screenshot()` — label-to-path mapping, output path returned
  - [x] Test `click()` — selector escaping, success/failure handling
  - [x] Test `type()` — selector + text passed correctly
  - [x] Test `evaluate()` — script passed to agent-browser evaluate
  - [x] Test `diffScreenshots()` — difference detection, missing file handling
  - [x] Test `isAvailable()` — agent-browser present/absent in container
  - [x] Test error handling — non-zero exit codes, timeouts, container not found
- [x] Task 7: Update proof document assembly for screenshots (AC: #7)
  - [x] Modify proof template to include `## Screenshots` section when screenshots exist
  - [x] List screenshots with labels and relative paths
- [x] Task 8: Run `npm run build` — verify no compilation errors
- [x] Task 9: Run `npm test` — verify all tests pass, no regressions
- [x] Task 10: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **Module boundary** — only `index.ts` is the public interface. `browser.ts` is private to verify module. [Source: architecture-overhaul.md#Decision 3]
- **ES modules** — all imports use `.js` extension.
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).

### Existing Code to Reuse

- **`src/types/result.ts`** — `ok()`, `fail()`, `isOk()`, `isFail()` — use these, do not reinvent.
- **`src/modules/verify/index.ts`** — already re-exports all verify module functions. Add browser exports here.
- **`src/modules/verify/types.ts`** — add `BrowserActionResult` and `DiffResult` interfaces here.
- **`src/modules/verify/parser.ts`** — already recognizes `agent-browser` as a UI keyword for AC classification.
- **`src/modules/verify/env.ts`** — has docker exec patterns for container management. Reference for shell command construction.

### Agent-Browser CLI Commands (from UX Spec)

The agent-browser tool is invoked via `docker exec` inside the verify container:

| Command | Description | Example |
|---------|-------------|---------|
| `navigate <url>` | Navigate to a URL | `agent-browser navigate http://localhost:3000/login` |
| `click <selector>` | Click an element | `agent-browser click "[ref=submit-btn]"` |
| `type <text>` | Type text into focused element | `agent-browser type "test@example.com"` |
| `screenshot --output <path>` | Capture screenshot | `agent-browser screenshot --output /workspace/screenshots/login.png` |
| `evaluate <script>` | Run JS in browser context | `agent-browser evaluate "document.title"` |

### Docker Container Requirements

The verify Dockerfiles need Chromium dependencies for headless browser support. agent-browser uses Chromium internally. Required system packages:
- `chromium` or `chromium-browser`
- `libgbm1`, `libnss3`, `libxss1`, `libasound2` (Chromium runtime deps on Debian-based images)

### File Placement

Per architecture-overhaul.md project tree:

- `src/modules/verify/browser.ts` — BrowserVerifier class
- `src/modules/verify/__tests__/browser.test.ts` — unit tests
- `src/modules/verify/types.ts` — BrowserActionResult, DiffResult interfaces (add to existing)
- `src/modules/verify/index.ts` — re-export browser types and class (update existing)
- `templates/Dockerfile.verify` — add agent-browser install (update existing)
- `templates/Dockerfile.verify.generic` — add agent-browser install (update existing)

### What This Unblocks

- **FR16** — Agent-browser web UI verification with screenshots
- **Verification of web projects** — ACs referencing UI elements get browser-based proof
- **Visual regression testing** — before/after screenshot comparison for UI changes

### Previous Story Intelligence

Story 7-1 (ObservabilityBackend Interface & Victoria Implementation) established patterns for this module:
- New capability files (`browser.ts`) follow the same pattern as `victoria-backend.ts`
- Result<T> pattern for all return values
- Comprehensive mocked unit tests with `vi.mock`
- Re-export from module `index.ts`
- Dev notes document exact command patterns and APIs

The verify module already has:
- `parser.ts` with `agent-browser` in UI_KEYWORDS — browser ACs will be classified as type `ui`
- `env.ts` with docker exec command construction patterns
- `types.ts` with existing verify-specific type definitions

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#agent-browser in Docker]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 8.1]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — agent-browser command examples]
- [Source: src/modules/verify/index.ts — module boundary pattern]
- [Source: src/modules/verify/types.ts — existing type definitions]
- [Source: src/modules/verify/parser.ts — UI_KEYWORDS includes agent-browser]
- [Source: templates/Dockerfile.verify — current verify image definition]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-1-agent-browser-integration.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-1-agent-browser-integration.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
