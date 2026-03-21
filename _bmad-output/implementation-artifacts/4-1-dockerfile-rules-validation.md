# Story 4.1: Dockerfile Rules & Validation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want formalized rules for verification Dockerfiles validated by audit,
so that "container missing binary" never happens.

## Acceptance Criteria

1. **Given** `patches/infra/dockerfile-rules.md` exists, **When** read, **Then** it lists required elements: pinned FROM, project binary on PATH, verification tools, no source code, non-root user, cache cleanup. <!-- verification: cli-verifiable -->
2. **Given** a Dockerfile without the project binary installed, **When** `infra.validateDockerfile()` runs, **Then** it reports a gap: "project binary not installed." <!-- verification: cli-verifiable -->
3. **Given** a Dockerfile with `FROM node:latest`, **When** validated, **Then** it reports: "unpinned base image -- use specific version." <!-- verification: cli-verifiable -->
4. **Given** a Dockerfile that passes all rules, **When** validated, **Then** audit reports infrastructure status: pass. <!-- verification: cli-verifiable -->
5. **Given** `patches/infra/dockerfile-rules.md` defines required verification tools (e.g., curl, jq), **When** a Dockerfile is missing one of these tools, **Then** `validateDockerfile()` reports a gap naming the missing tool. <!-- verification: cli-verifiable -->
6. **Given** a Dockerfile with `COPY src/ /app/src/`, **When** validated, **Then** it reports: "source code copied into container -- use build artifact instead." <!-- verification: cli-verifiable -->
7. **Given** a Dockerfile with no `USER` instruction (running as root), **When** validated, **Then** it reports: "no non-root USER instruction found." <!-- verification: cli-verifiable -->
8. **Given** a Dockerfile with no cache cleanup (e.g., missing `rm -rf /var/lib/apt/lists/*` after apt-get), **When** validated, **Then** it reports: "no cache cleanup detected." <!-- verification: cli-verifiable -->
9. **Given** `checkInfrastructure()` in audit dimensions currently only checks pinned FROM, **When** the new `validateDockerfile()` is integrated, **Then** all 6 rule categories (pinned FROM, binary on PATH, verification tools, no source copy, non-root user, cache cleanup) are checked and gaps are reported through the existing audit coordinator. <!-- verification: cli-verifiable -->
10. **Given** no `patches/infra/dockerfile-rules.md` exists, **When** `validateDockerfile()` runs, **Then** it uses hardcoded defaults and reports a warning: "dockerfile-rules.md not found -- using defaults." <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [ ] Task 1: Create `patches/infra/dockerfile-rules.md` (AC: #1)
  - [ ] 1.1: Define 6 required-element categories with human-readable descriptions: pinned FROM, project binary on PATH, verification tools (curl, jq), no source code COPY, non-root USER, cache cleanup
  - [ ] 1.2: Add project-type-specific sections (Node.js, Python, Plugin) per Architecture Decision 5

- [ ] Task 2: Create `src/modules/infra/dockerfile-validator.ts` (AC: #2, #3, #5, #6, #7, #8, #10)
  - [ ] 2.1: Define `DockerfileValidationResult` interface: `{ passed: boolean; gaps: DockerfileGap[]; warnings: string[] }` where `DockerfileGap` has `{ rule: string; description: string; suggestedFix: string; line?: number }`
  - [ ] 2.2: `validateDockerfile(projectDir: string): Result<DockerfileValidationResult>` -- reads Dockerfile, loads rules, checks each rule category
  - [ ] 2.3: `loadRules(projectDir: string): DockerfileRules` -- reads `patches/infra/dockerfile-rules.md` or falls back to hardcoded defaults with a warning (AC #10)
  - [ ] 2.4: Rule check: pinned FROM -- reject `:latest` or missing tag/digest (AC #3)
  - [ ] 2.5: Rule check: project binary on PATH -- look for `npm install -g`, `pip install`, or `COPY --from` patterns that install a binary (AC #2)
  - [ ] 2.6: Rule check: verification tools -- scan for `apt-get install` / `apk add` containing `curl`, `jq` or equivalent (AC #5)
  - [ ] 2.7: Rule check: no source code COPY -- flag `COPY src/`, `COPY lib/`, `COPY test/` patterns (AC #6)
  - [ ] 2.8: Rule check: non-root USER -- require at least one `USER` instruction that is not `root` (AC #7)
  - [ ] 2.9: Rule check: cache cleanup -- look for `rm -rf /var/lib/apt/lists/*`, `npm cache clean`, or `pip cache purge` (AC #8)

- [ ] Task 3: Integrate `validateDockerfile()` into audit `checkInfrastructure()` (AC: #4, #9)
  - [ ] 3.1: Replace the current inline pinned-FROM check in `src/modules/audit/dimensions.ts` `checkInfrastructure()` with a call to `validateDockerfile()` from `src/modules/infra/dockerfile-validator.ts`
  - [ ] 3.2: Map `DockerfileGap` results to `AuditGap` format for the infrastructure dimension
  - [ ] 3.3: Preserve existing behavior: no Dockerfile = fail, unreadable = warn, no FROM = fail

- [ ] Task 4: Export from barrel `src/modules/infra/index.ts` (AC: all)
  - [ ] 4.1: Export `validateDockerfile` function from barrel
  - [ ] 4.2: Export `DockerfileValidationResult`, `DockerfileGap` types from barrel

- [ ] Task 5: Write unit tests (AC: all)
  - [ ] 5.1: Create `src/modules/infra/__tests__/dockerfile-validator.test.ts`:
    - Test pinned FROM passes for `node:22-slim`, fails for `node:latest` and `node` (AC #3)
    - Test project binary detection for npm install -g and pip install patterns (AC #2)
    - Test verification tools detection for curl and jq (AC #5)
    - Test source code COPY detection for `COPY src/` and `COPY lib/` (AC #6)
    - Test non-root USER detection, fail when missing or only `USER root` (AC #7)
    - Test cache cleanup detection for apt, npm, pip patterns (AC #8)
    - Test all-passing Dockerfile returns `passed: true` (AC #4)
    - Test missing rules file uses defaults with warning (AC #10)
    - Test missing Dockerfile returns fail result
  - [ ] 5.2: Update `src/modules/audit/__tests__/dimensions.test.ts`:
    - Test `checkInfrastructure()` now reports all 6 rule categories
    - Test backward compatibility: no Dockerfile still returns fail
  - [ ] 5.3: Mock all I/O: filesystem (readFileSync, existsSync)
  - [ ] 5.4: Target 100% coverage on new files

- [ ] Task 6: Integration verification (AC: all)
  - [ ] 6.1: `npm run build` -- verify tsup compiles new files
  - [ ] 6.2: `npm run test:unit` -- all tests pass, no regressions
  - [ ] 6.3: Verify module boundaries: only barrel `index.ts` exports public API
  - [ ] 6.4: Verify no file exceeds 300 lines (NFR9)
  - [ ] 6.5: Verify `codeharness audit` runs end-to-end and infrastructure dimension reports all 6 rule categories

## Dev Notes

### Architecture References

This story implements FR23 (formalized Dockerfile rules) and FR24 (audit validates Dockerfile against rules). It extends the infrastructure dimension from Story 3.1's audit coordinator (Architecture Decision 5: Rules as Markdown). The validator approach is "parse Dockerfile line by line, check for required patterns, report missing as gaps" -- simple regex matching, no Docker build required.

### Key Implementation Details

**Rules file format (Decision 5):** `patches/infra/dockerfile-rules.md` is a human-readable markdown document listing required Dockerfile elements. The validator does NOT parse this markdown programmatically -- the rules are hardcoded in the validator, and the markdown serves as documentation and a reference for developers. If the rules file is missing, the validator still works with defaults but emits a warning (AC #10).

**Validator pattern:** `validateDockerfile()` reads the Dockerfile content, splits into lines, and checks each rule category via regex. Returns `Result<DockerfileValidationResult>` following the project's Result<T> pattern. Each gap includes the rule name, description, suggested fix, and optionally the line number where the issue was found.

**Audit integration (AC #9):** The current `checkInfrastructure()` in `src/modules/audit/dimensions.ts` (lines 166-190) already checks for Dockerfile existence and pinned FROM images. This story replaces that inline logic with a call to `validateDockerfile()`, which checks all 6 categories. The audit gap format is preserved -- `validateDockerfile()` results map directly to `AuditGap` via the existing `gap()` helper.

**Rule categories (6 total):**
1. Pinned FROM -- no `:latest`, no missing tag (already partially implemented in `checkInfrastructure`)
2. Project binary on PATH -- `npm install -g`, `pip install`, or multi-stage `COPY --from` that installs the binary
3. Verification tools -- `curl`, `jq` present (installed via apt-get, apk, or already in base image)
4. No source code COPY -- flag `COPY src/`, `COPY lib/`, `COPY test/` (should use build artifacts)
5. Non-root USER -- at least one `USER` instruction that isn't `USER root`
6. Cache cleanup -- `rm -rf /var/lib/apt/lists/*`, `npm cache clean`, `pip cache purge`

**Regex approach, not AST:** We intentionally use simple line-by-line regex matching. This is fast, predictable, and sufficient for the rule categories. False positives are acceptable -- this is an advisory tool, not a security gate.

### Existing Code to Reuse

- `src/modules/audit/dimensions.ts` -- `checkInfrastructure()` has the current inline Dockerfile check (lines 166-190) to be replaced
- `src/modules/audit/types.ts` -- `AuditGap`, `DimensionResult` types
- `src/modules/infra/index.ts` -- barrel file to export new `validateDockerfile`
- `src/types/result.ts` -- `Result<T>`, `ok()`, `fail()` for return types
- `patches/` directory structure -- already has `observability/` subdirectory with YAML rules as precedent

### What This Story Does NOT Include

- No Dockerfile template generation -- that's Story 4.2
- No `docker build` execution -- validation is static, regex-based
- No dev workflow integration for dependency changes -- that's Story 4.2
- No `codeharness init` template generation -- that's Story 4.2
- No project-type auto-detection for rules -- all 6 generic rules apply universally; project-type-specific rules are documentation only in the rules markdown

### Dependencies

- **Depends on:** Story 3.1 (audit coordinator, `checkInfrastructure()` dimension) -- DONE
- **Depended on by:** Story 4.2 (Dockerfile template & dev integration)

### File Size Constraint

Each new file must be under 300 lines per NFR9.
- `patches/infra/dockerfile-rules.md` -- ~40-60 lines (documentation)
- `src/modules/infra/dockerfile-validator.ts` -- ~120-180 lines (validator logic)
- `src/modules/infra/__tests__/dockerfile-validator.test.ts` -- ~200-250 lines (tests)
- `src/modules/audit/dimensions.ts` -- modification only, currently 198 lines

### Previous Story Intelligence (Story 3.1 Audit Coordinator)

- **`checkInfrastructure()` is in `dimensions.ts` lines 166-190.** It checks Dockerfile existence, readability, FROM lines, and pinned tags. This story replaces the FROM/tag checking with the full `validateDockerfile()` call while preserving the existence/readability prechecks.
- **`AuditGap` has `{ dimension, description, suggestedFix }`.** The new `DockerfileGap` maps 1:1 to this.
- **Barrel imports only.** Import `validateDockerfile` from `../infra/index.js`, not from `dockerfile-validator.js` directly.
- **The `gap()` helper in dimensions.ts** constructs `AuditGap` objects. Reuse it for all new gaps.
- **57+ audit tests exist.** New tests must not regress these.
- **`patches/` directory has no `infra/` subdirectory yet.** Create `patches/infra/dockerfile-rules.md` as the first file there.

### Git Intelligence

Recent commits show epics 0-3 completed. The project uses:
- Commander for CLI commands
- `Result<T>` discriminated union for error handling
- tsup for building
- Vitest for testing (2779+ tests as of story 3.1)
- Barrel exports (`index.ts`) for module boundaries
- Regex-based Dockerfile parsing already exists in `checkInfrastructure()`

### References

- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 5] -- Rules as Markdown, validator approach
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 4.1] -- Acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#FR23] -- Formalized Dockerfile rules
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#FR24] -- Audit validates Dockerfile against rules
- [Source: src/modules/audit/dimensions.ts#checkInfrastructure] -- Existing inline Dockerfile check to replace
- [Source: src/modules/infra/index.ts] -- Barrel file to export new validator

### Project Structure Notes

- New files: `patches/infra/dockerfile-rules.md`, `src/modules/infra/dockerfile-validator.ts`, `src/modules/infra/__tests__/dockerfile-validator.test.ts`
- Modified files: `src/modules/audit/dimensions.ts` (replace inline check with validateDockerfile call), `src/modules/infra/index.ts` (add barrel export)
- Module follows existing conventions: barrel exports, Result<T> returns, <300 line files

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-1-dockerfile-rules-validation.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/infra/AGENTS.md)
- [ ] Exec-plan created in `docs/exec-plans/active/4-1-dockerfile-rules-validation.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] All I/O mocked (filesystem, subprocess, HTTP)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
