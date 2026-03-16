# Story 4.1: Verification Pipeline & Showboat Integration

Status: ready-for-dev

## Story

As a developer,
I want to run `codeharness verify --story <id>` to produce real-world proof that a story works,
So that verified stories are backed by reproducible evidence, not just test results.

## Acceptance Criteria

1. **Given** a developer or agent runs `codeharness verify --story <story-id>`, **When** the verification pipeline starts, **Then** the story file is read and acceptance criteria are extracted, **And** preconditions are checked: `tests_passed` and `coverage_met` flags must be `true`, **And** if preconditions fail, `[FAIL] Preconditions not met` is printed with which flags are false.

2. **Given** verification is running for a story with UI acceptance criteria, **When** the agent executes UI verification steps, **Then** agent-browser is used to interact with the application (navigate, fill forms, click, screenshot), **And** annotated screenshots are captured via `showboat image`, **And** if agent-browser is unavailable, verification falls back gracefully with `[WARN] agent-browser unavailable — skipping UI verification` (NFR17).

3. **Given** verification is running for a story with API acceptance criteria, **When** the agent executes API verification steps, **Then** real HTTP calls are made (`curl` or equivalent) and response bodies inspected, **And** side effects are verified (e.g., DB state after POST), **And** command output is captured via `showboat exec`.

4. **Given** verification is running for a story with database acceptance criteria, **When** the agent needs to check DB state, **Then** Database MCP is used for read-only queries, **And** query results are captured as verification evidence.

5. **Given** all verification steps complete, **When** evidence is captured, **Then** a Showboat proof document is created at `verification/<story-id>-proof.md`, **And** screenshots are stored at `verification/screenshots/<story-id>-<ac>-<desc>.png`, **And** proof document follows canonical structure: story header, AC sections with `showboat exec` blocks, verification summary, **And** verification summary includes: total ACs, verified count, failed count, showboat verify status.

6. **Given** a proof document exists, **When** `showboat verify` is run against it, **Then** all captured commands are re-executed and outputs compared, **And** verification completes within 5 minutes for a typical story (NFR3), **And** pass/fail result is reported.

7. **Given** verification completes successfully, **When** all ACs are verified, **Then** CLI updates state: `codeharness state set verification_run true`, **And** beads issue is updated: `bd close <story-id>`, **And** `[OK] Story <id>: verified — proof at verification/<id>-proof.md` is printed.

8. **Given** `codeharness verify --story <id> --json`, **When** verification completes, **Then** JSON output includes per-AC pass/fail, evidence paths, and showboat verify status.

## Tasks / Subtasks

- [ ] Task 1: Create Showboat proof template in `src/templates/showboat-template.ts` (AC: #5)
  - [ ] 1.1: Define `ShowboatProofConfig` interface: `{ storyId: string, storyTitle: string, acceptanceCriteria: AcceptanceCriterion[] }` where `AcceptanceCriterion` has `{ id: string, description: string, verified: boolean, evidence: EvidenceItem[] }` and `EvidenceItem` has `{ type: 'exec' | 'image', content: string, path?: string }`
  - [ ] 1.2: Implement `showboatProofTemplate(config: ShowboatProofConfig): string` — generates the canonical proof document structure with story header, per-AC sections containing `showboat exec` and `showboat image` blocks, and verification summary (total ACs, verified count, failed count, showboat verify status)
  - [ ] 1.3: Implement `verificationSummaryBlock(criteria: AcceptanceCriterion[]): string` — generates the summary section with counts and PASS/FAIL status
  - [ ] 1.4: Pin `showboat` CLI version as a constant (check what's used in `src/lib/deps.ts` for consistency)

- [ ] Task 2: Create story file AC parser in `src/lib/verify-parser.ts` (AC: #1)
  - [ ] 2.1: Define `ParsedAC` interface: `{ id: string, description: string, type: 'ui' | 'api' | 'db' | 'general' }` — type inferred from keywords in the AC description (agent-browser/UI/screenshot → `ui`, HTTP/API/endpoint/curl → `api`, database/DB/query/MCP → `db`, else `general`)
  - [ ] 2.2: Implement `parseStoryACs(storyFilePath: string): ParsedAC[]` — reads a story markdown file, finds the `## Acceptance Criteria` section, extracts numbered ACs. Parse the `**Given**`/`**When**`/`**Then**` blocks as full AC descriptions.
  - [ ] 2.3: Implement `classifyAC(description: string): 'ui' | 'api' | 'db' | 'general'` — keyword-based classification for routing verification steps to the correct tool (agent-browser, curl, Database MCP)
  - [ ] 2.4: Handle edge cases: story file not found (throw with actionable message), no AC section (return empty array with warning), malformed ACs (skip with warning)

- [ ] Task 3: Implement verification orchestrator in `src/lib/verify.ts` (AC: #1, #5, #6, #7)
  - [ ] 3.1: Define `VerifyResult` interface: `{ storyId: string, success: boolean, totalACs: number, verifiedCount: number, failedCount: number, proofPath: string, showboatVerifyStatus: 'pass' | 'fail' | 'skipped', perAC: { id: string, description: string, verified: boolean, evidencePaths: string[] }[] }`
  - [ ] 3.2: Implement `checkPreconditions(dir?: string): { passed: boolean, failures: string[] }` — reads state file via `readState()`, checks `session_flags.tests_passed` and `session_flags.coverage_met`, returns which flags are false
  - [ ] 3.3: Implement `createProofDocument(storyId: string, storyTitle: string, acs: ParsedAC[], dir?: string): string` — creates the `verification/` directory and `verification/screenshots/` directory if they don't exist, generates the proof document skeleton at `verification/<story-id>-proof.md` using the showboat template, returns the proof file path
  - [ ] 3.4: Implement `runShowboatVerify(proofPath: string): { passed: boolean, output: string }` — runs `showboat verify <proofPath>` via `execFileSync`, parses exit code (0 = pass, non-zero = fail), captures stdout/stderr. Handle showboat not installed: `[WARN] Showboat not installed — skipping re-verification` and return `{ passed: false, output: 'showboat not available' }` with status `skipped`
  - [ ] 3.5: Implement `updateVerificationState(storyId: string, result: VerifyResult, dir?: string): void` — reads state with body via `readStateWithBody()`, sets `session_flags.verification_run = true`, appends entry to `verification_log` array (format: `<story-id>: <pass|fail> at <ISO timestamp>`), writes state back
  - [ ] 3.6: Implement `closeBeadsIssue(storyId: string): void` — calls `syncClose()` from `beads-sync.ts` to close the beads issue AND update the story file status to `done`. Handle beads not initialized gracefully (warn, don't fail).

- [ ] Task 4: Implement `codeharness verify` command in `src/commands/verify.ts` (AC: #1, #7, #8)
  - [ ] 4.1: Replace the existing stub with a full Commander.js command accepting `--story <id>` (required), and global `--json` flag
  - [ ] 4.2: Implement command flow: validate `--story` argument → check preconditions → parse story file ACs → create proof document skeleton → run showboat verify (if proof already has content) → update state → close beads issue → print results
  - [ ] 4.3: Precondition failure path: if `checkPreconditions()` returns failures, print `[FAIL] Preconditions not met:` followed by each failed flag with remediation instructions, exit code 1
  - [ ] 4.4: Success path: print `[OK] Story <id>: verified — proof at verification/<id>-proof.md`, exit code 0
  - [ ] 4.5: JSON output path: when `--json` is passed, output `VerifyResult` as JSON instead of human-readable output
  - [ ] 4.6: Error handling: story file not found → `[FAIL] Story file not found: <path>`, showboat unavailable → `[WARN]` but continue, beads unavailable → `[WARN]` but continue

- [ ] Task 5: Create Showboat proof template tests in `src/templates/__tests__/showboat-template.test.ts` (AC: #5)
  - [ ] 5.1: Test `showboatProofTemplate()` generates correct markdown structure with story header, AC sections, and summary
  - [ ] 5.2: Test proof template includes `showboat exec` blocks for each AC with evidence
  - [ ] 5.3: Test proof template includes `showboat image` blocks for ACs with screenshot evidence
  - [ ] 5.4: Test verification summary calculates correct counts (total, verified, failed)
  - [ ] 5.5: Test template handles zero ACs, single AC, and many ACs

- [ ] Task 6: Create AC parser tests in `src/lib/__tests__/verify-parser.test.ts` (AC: #1)
  - [ ] 6.1: Test `parseStoryACs()` extracts numbered ACs from a standard story file
  - [ ] 6.2: Test `classifyAC()` correctly identifies UI, API, DB, and general AC types from keywords
  - [ ] 6.3: Test parser handles missing file (throws with actionable message)
  - [ ] 6.4: Test parser handles file with no AC section (returns empty array)
  - [ ] 6.5: Test parser handles malformed ACs (skips with warning, returns parseable ones)

- [ ] Task 7: Create verification orchestrator tests in `src/lib/__tests__/verify.test.ts` (AC: #1, #5, #6, #7)
  - [ ] 7.1: Test `checkPreconditions()` returns pass when both flags are true
  - [ ] 7.2: Test `checkPreconditions()` returns failure list when flags are false
  - [ ] 7.3: Test `createProofDocument()` creates directories and writes proof file
  - [ ] 7.4: Test `runShowboatVerify()` handles showboat pass (exit 0), fail (exit non-zero), and not installed
  - [ ] 7.5: Test `updateVerificationState()` sets `verification_run` flag and appends to `verification_log`
  - [ ] 7.6: Test `closeBeadsIssue()` calls syncClose and handles beads not initialized
  - [ ] 7.7: Mock `execFileSync` for showboat calls, mock `readState`/`writeState` for state operations, mock beads-sync functions

- [ ] Task 8: Create verify command tests in `src/commands/__tests__/verify.test.ts` (AC: #1, #7, #8)
  - [ ] 8.1: Test verify command requires `--story` argument
  - [ ] 8.2: Test verify command fails with precondition error when flags are false
  - [ ] 8.3: Test verify command succeeds and prints OK message when verification passes
  - [ ] 8.4: Test verify command `--json` output matches `VerifyResult` structure
  - [ ] 8.5: Test verify command handles missing story file gracefully
  - [ ] 8.6: Test verify command continues when showboat or beads are unavailable (warns, doesn't fail)

- [ ] Task 9: Build and verify (AC: #1, #5, #6, #7, #8)
  - [ ] 9.1: Run `npm run build` — verify tsup compiles successfully with new files
  - [ ] 9.2: Run `npm run test:unit` — all tests pass including new verify tests
  - [ ] 9.3: Run `npm run test:coverage` — verify 100% coverage for all new code in `src/`
  - [ ] 9.4: Manual test: `codeharness verify --story 1-1-project-scaffold-cli-entry-point` with tests_passed=false — should print precondition failure
  - [ ] 9.5: Manual test: set both flags true, run verify — should create proof document skeleton
  - [ ] 9.6: Manual test: `codeharness verify --story 1-1-project-scaffold-cli-entry-point --json` — verify JSON output structure

## Dev Notes

### This Story Starts Epic 4: Verification Pipeline & Quality Enforcement

This is the first story in Epic 4, establishing the verification pipeline that produces Showboat proof documents. Later stories in Epic 4 add hook enforcement (4.2), coverage gates (4.3), and doc freshness enforcement (4.4). The verification pipeline is the foundation — hooks and gates reference its outputs.

### What Already Exists (from Epics 1-3)

- `src/commands/verify.ts` — Stub that prints "Not yet implemented. Coming in Epic 4." This must be replaced with the full implementation.
- `src/lib/state.ts` — Full state file read/write with `readState()`, `readStateWithBody()`, `writeState()`, `getNestedValue()`, `setNestedValue()`. The verify command reads `session_flags.tests_passed` and `session_flags.coverage_met` as preconditions and sets `session_flags.verification_run`.
- `src/lib/beads.ts` — Full beads CLI wrapper: `createIssue()`, `getReady()`, `closeIssue()`, `updateIssue()`, `listIssues()`. Used to close story issues on verification pass.
- `src/lib/beads-sync.ts` — Sync module with `syncClose()` that closes beads issue AND updates story file status to `done` AND updates sprint-status.yaml. The verify command should use this for the post-verification close.
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` utilities.
- `src/lib/deps.ts` — Dependency auto-install logic. Check here for Showboat version pin.
- `src/templates/bmad-patches.ts` — Patch templates including `storyVerificationPatch()` which references `docs/exec-plans/active/<story-key>.proof.md`. The verification pipeline creates proof docs at `verification/<story-id>-proof.md` per architecture decision D8.
- `src/index.ts` — CLI entry point, already registers the verify command via `registerVerifyCommand()`.

### Architecture Decisions That Apply

- **Decision 8 (Verification Pipeline):** CLI orchestrates verification. Agent executes verification steps in isolated context via Agent tool. Flow: read story file → extract ACs → check preconditions → agent executes verification (Showboat, agent-browser, curl, DB MCP) → check proof exists → update state → update beads.
- **Decision 1 (CLI ↔ Plugin Boundary):** Verification is CLI-side orchestration. The plugin's `agents/verifier.md` (created by plugin scaffold) tells the agent how to verify, but the CLI handles bookkeeping (state updates, beads close, proof file creation).
- **Decision 2 (State Management):** Verification sets `session_flags.verification_run = true` and appends to `verification_log[]`. Hooks in Story 4.2 will read this flag.

### Showboat Integration

Showboat is a Python tool (`pip install showboat`) that creates proof documents with executable evidence blocks:

```markdown
<!-- showboat exec: curl http://localhost:3000/api/health -->
```json
{"status": "ok"}
```
<!-- /showboat exec -->

<!-- showboat image: verification/screenshots/1-1-ac1-health-check.png -->
```

`showboat verify <proof.md>` re-executes all `showboat exec` blocks and compares outputs. If outputs match, verification passes. If they differ, it fails with a diff.

The CLI creates the proof document skeleton. The agent (or the verification subagent from `agents/verifier.md`) fills in the actual `showboat exec` and `showboat image` blocks during verification. The CLI then runs `showboat verify` to confirm.

### Verification Flow Detail

```
codeharness verify --story <story-id>
  ├── 1. Validate --story argument
  ├── 2. Resolve story file path (_bmad-output/implementation-artifacts/<story-id>.md)
  ├── 3. Read story file, parse acceptance criteria
  ├── 4. Check preconditions (tests_passed && coverage_met)
  │   └── If fail → print failures, exit 1
  ├── 5. Create proof document skeleton at verification/<story-id>-proof.md
  │   └── Directories: verification/, verification/screenshots/
  ├── 6. If proof document already has content → run showboat verify
  │   ├── Pass → continue
  │   └── Fail → print diff, exit 1
  ├── 7. Update state: verification_run = true, append to verification_log
  ├── 8. Close beads issue via syncClose() (also updates story file + sprint-status.yaml)
  └── 9. Print success message
```

### Sprint Skill Integration

The sprint execution skill (`/harness-run` from Epic 0) will call `codeharness verify --story <id>` between dev-story completion and marking status `done`. When this story is complete, the skill's story-completion flow can be enhanced to include verification. That enhancement is not in scope for this story — it will be wired in when Epic 4 stories are complete and the skill is updated.

### AC Type Classification

The parser classifies each AC by keywords to help the agent (or verifier subagent) choose the right verification tool:

| AC Type | Keywords | Tool |
|---------|----------|------|
| `ui` | agent-browser, UI, screenshot, navigate, click, form | agent-browser |
| `api` | HTTP, API, endpoint, curl, REST, response | curl / HTTP calls |
| `db` | database, DB, query, MCP, SQL, table | Database MCP |
| `general` | (default) | Manual inspection / showboat exec |

This classification is advisory — the agent uses it as guidance but can override based on context.

### What NOT To Do

- **Do NOT implement hook scripts** — that's Story 4.2.
- **Do NOT implement coverage gate logic** — that's Story 4.3.
- **Do NOT implement doc freshness checks** — that's Story 4.4.
- **Do NOT implement the verifier subagent** — `agents/verifier.md` is a plugin skill file, not CLI code. It already exists in the plugin scaffold or will be created by the plugin scaffold template. This story implements the CLI orchestration.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT introduce external dependencies beyond Node.js built-ins** and the existing project deps (`yaml`, `commander`).
- **Do NOT call `bd` commands directly** — use the beads wrapper (`src/lib/beads.ts`) and sync module (`src/lib/beads-sync.ts`).

### Scope Boundaries

**IN SCOPE (this story):**
- New template `src/templates/showboat-template.ts` — proof document generation
- New module `src/lib/verify-parser.ts` — story file AC extraction and classification
- New module `src/lib/verify.ts` — verification orchestration (preconditions, proof creation, showboat verify, state update, beads close)
- Replacement of `src/commands/verify.ts` stub with full command implementation
- Unit tests for all new modules
- Proof document creation at `verification/<story-id>-proof.md`

**OUT OF SCOPE (later stories):**
- Hook enforcement (pre-commit gate, post-write check, etc.) — Story 4.2
- Coverage gate logic (`src/lib/coverage.ts`) — Story 4.3
- Doc freshness enforcement (`src/lib/scanner.ts`) — Story 4.4
- Ralph/sprint execution integration — Epic 5
- Verifier subagent implementation — plugin scaffold concern

### Dependencies

- **Depends on:** Story 1.2 (core libraries — state.ts) — DONE. Story 3.1 (beads CLI wrapper) — DONE. Story 3.4 (beads sync — syncClose) — DONE.
- **Depended on by:** Story 4.2 (hooks read `verification_run` flag), Story 4.3 (coverage gate is a precondition for verify), Story 5.2 (Ralph verification gates call verify).

### New npm Dependencies

None. Uses Node.js built-ins (`fs`, `path`, `child_process`) and existing project dependencies.

### New Files Created

| File | Purpose |
|------|---------|
| `src/templates/showboat-template.ts` | Proof document template generation |
| `src/lib/verify-parser.ts` | Story file AC extraction and type classification |
| `src/lib/verify.ts` | Verification orchestration (preconditions, proof, state, beads) |
| `src/templates/__tests__/showboat-template.test.ts` | Showboat template unit tests |
| `src/lib/__tests__/verify-parser.test.ts` | AC parser unit tests |
| `src/lib/__tests__/verify.test.ts` | Verification orchestrator unit tests |
| `src/commands/__tests__/verify.test.ts` | Verify command unit tests |

### Files Modified

| File | Change |
|------|--------|
| `src/commands/verify.ts` | Replace stub with full implementation |

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 8 (Verification Pipeline), Showboat Proof Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR20-FR25 (Real-World Verification)]
- [Source: src/lib/state.ts — readState(), readStateWithBody(), writeState(), HarnessState interface]
- [Source: src/lib/beads-sync.ts — syncClose()]
- [Source: src/lib/output.ts — ok(), fail(), warn(), info(), jsonOutput()]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-1-verification-pipeline-showboat-integration.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib — verify.ts, verify-parser.ts; src/templates — showboat-template.ts; src/commands — verify.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/4-1-verification-pipeline-showboat-integration.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
