<story-spec>

# Story 22-3: Update default.yaml to new format

Status: draft

## Story

As a workflow author,
I want the default workflow template to use the new `for_each` + `gate` syntax instead of the legacy `story_flow` / `epic_flow` / `loop:` format,
So that new projects start with the clean, architecturally-correct format from day one.

## Context

**Epic 22: Flow Configuration Format & Parser** — this is story 3 of 3 (final story in the epic). Story 22-1 (done) added `for_each` block parsing. Story 22-2 (done) added `gate` block parsing. Both stories preserved backward compatibility with the old format. This story migrates the shipped template to the new format and removes the old keys.

The current `templates/workflows/default.yaml` uses the legacy format:
```yaml
story_flow:
  - create-story
  - implement
  - check
  - review
  - loop:
      - retry
      - check
      - review
  - document

epic_flow:
  - story_flow
  - retro
```

The target format (from architecture-xstate-engine.md) replaces this with:
```yaml
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - create-story
        - implement
        - gate: quality
          check: [check, review]
          fix: [retry]
          pass_when: consensus
          max_retries: 5
          circuit_breaker: stagnation
        - document
    - deploy
    - gate: verification
      check: [verify]
      fix: [retry, document, deploy]
      pass_when: consensus
      max_retries: 3
      circuit_breaker: stagnation
    - retro
```

**Key decisions:**
- The `tasks:` section stays the same — same 9 task definitions, no changes.
- `story_flow`, `epic_flow`, and `loop:` keys are removed entirely.
- The `loop:` retry logic is replaced by `gate: quality` with check/fix semantics.
- A new `gate: verification` is added at the epic level for deploy verification (matching the architecture reference).
- The `deploy` and `verify` tasks already exist in the tasks section but weren't in `story_flow` — they were in `epic_flow` indirectly. Now they're explicit in the `for_each: epic` steps.
- Backward compat for old-format files is preserved in the parser (stories 22-1 and 22-2 ensured this). This story only changes the default template itself.

**Current state:** Parser supports both old and new formats. 4988+ tests passing. Build clean.

## Acceptance Criteria

1. **Given** the file `templates/workflows/default.yaml` after this change, **When** a user runs `codeharness validate templates/workflows/default.yaml`, **Then** the command exits 0 with no errors printed to stderr.
   <!-- verification: run `codeharness validate templates/workflows/default.yaml`, expect exit 0 -->

2. **Given** the updated `templates/workflows/default.yaml`, **When** a user opens the file and inspects its contents, **Then** the file contains a `workflow:` key with a `for_each: epic` block at the top level — and does NOT contain `story_flow:`, `epic_flow:`, or `loop:` keys.
   <!-- verification: run `cat templates/workflows/default.yaml`, check output contains "workflow:" and "for_each: epic", and does NOT contain "story_flow:", "epic_flow:", or "loop:" -->

3. **Given** the updated `templates/workflows/default.yaml`, **When** a user inspects the `workflow:` block, **Then** there is a nested `for_each: story` block inside `for_each: epic` containing story-level steps.
   <!-- verification: run `cat templates/workflows/default.yaml`, check output contains "for_each: story" nested under "for_each: epic" -->

4. **Given** the updated `templates/workflows/default.yaml`, **When** a user inspects the story-level steps, **Then** they contain a `gate: quality` block with `check:` listing at least `check` and `review`, and `fix:` listing at least `retry`.
   <!-- verification: run `cat templates/workflows/default.yaml`, check output contains "gate: quality" with "check:" and "fix:" fields -->

5. **Given** the updated `templates/workflows/default.yaml`, **When** a user inspects the epic-level steps (after `for_each: story`), **Then** there is a `gate: verification` block with `check:` listing `verify`.
   <!-- verification: run `cat templates/workflows/default.yaml`, check output contains "gate: verification" with "check:" including "verify" -->

6. **Given** the updated `templates/workflows/default.yaml`, **When** a user counts the task definitions under `tasks:`, **Then** there are exactly 9 tasks: `create-story`, `implement`, `check`, `review`, `document`, `deploy`, `verify`, `retry`, `retro` — unchanged from before.
   <!-- verification: run `cat templates/workflows/default.yaml`, verify the `tasks:` section lists exactly 9 task names matching the expected list -->

7. **Given** a YAML file using the old `story_flow` / `epic_flow` format (without `workflow:` key), **When** a user runs `codeharness validate <file>`, **Then** the command still exits 0 — backward compatibility is preserved for user-authored files that haven't migrated yet.
   <!-- verification: create a test YAML file with old-format keys (story_flow, epic_flow, loop), run `codeharness validate <file>`, expect exit 0 -->

8. **Given** a new project is initialized via `codeharness init`, **When** the user inspects the generated workflow file, **Then** it uses the new `workflow:` / `for_each:` / `gate:` format (not the old `story_flow` / `epic_flow` format).
   <!-- verification: run `codeharness init` in a temp directory, inspect the generated workflow YAML, confirm it contains "workflow:" and "for_each:" and does not contain "story_flow:" or "epic_flow:" -->

9. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no TypeScript errors.
   <!-- verification: `npm run build` exits 0 -->

10. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** all existing tests pass — zero failures, no regressions.
    <!-- verification: `npx vitest run` exits 0 -->

11. **Given** the updated template is validated by the parser, **When** the parser returns the resolved workflow, **Then** any test that previously referenced `templates/workflows/default.yaml` still passes — no test regressions from the format change.
    <!-- verification: `npx vitest run` exits 0 (same as AC10, confirms no test references to old format keys break) -->

## Tasks / Subtasks

- [ ] Task 1: Rewrite `templates/workflows/default.yaml` to new format (AC: 1-6)
  - [ ] 1.1: Keep the `tasks:` section exactly as-is (all 9 tasks, same properties)
  - [ ] 1.2: Remove `story_flow:`, `epic_flow:`, and `loop:` keys entirely
  - [ ] 1.3: Add `workflow:` key with `for_each: epic` and `steps:` array
  - [ ] 1.4: Add nested `for_each: story` block with steps: `create-story`, `implement`, `gate: quality`, `document`
  - [ ] 1.5: Configure `gate: quality` with `check: [check, review]`, `fix: [retry]`, `pass_when: consensus`, `max_retries: 5`, `circuit_breaker: stagnation`
  - [ ] 1.6: Add epic-level steps after story loop: `deploy`, `gate: verification`, `retro`
  - [ ] 1.7: Configure `gate: verification` with `check: [verify]`, `fix: [retry, document, deploy]`, `pass_when: consensus`, `max_retries: 3`, `circuit_breaker: stagnation`

- [ ] Task 2: Update any code that reads default.yaml and expects old format keys (AC: 8-10)
  - [ ] 2.1: Search codebase for references to `story_flow`, `epic_flow`, `loop:` that assume the default template format
  - [ ] 2.2: Update `codeharness init` template copying to ensure the new-format file is used
  - [ ] 2.3: Verify no hardcoded expectations on old keys exist outside the parser's backward-compat path

- [ ] Task 3: Update tests that reference default.yaml or old format keys (AC: 10, 11)
  - [ ] 3.1: Find all tests that load `templates/workflows/default.yaml` and assert on `story_flow` / `epic_flow`
  - [ ] 3.2: Update assertions to expect `workflow:` / `for_each:` / `gate:` structure instead
  - [ ] 3.3: Add or update test that validates the default template parses successfully with new format

- [ ] Task 4: Ensure backward compat for old-format user files (AC: 7)
  - [ ] 4.1: Confirm the parser still accepts old format (this should already work from 22-1/22-2 — just verify)
  - [ ] 4.2: Add explicit test with a minimal old-format YAML if one doesn't exist

- [ ] Task 5: Build and test (AC: 9, 10)
  - [ ] 5.1: Run `npm run build` — expect exit 0
  - [ ] 5.2: Run `npx vitest run` — expect all tests pass, zero regressions

## Dev Notes

- **This is a template-only change at its core.** The parser already supports both formats (22-1 and 22-2 ensured this). The primary work is rewriting `default.yaml` and updating anything downstream that assumed the old format.
- **The architecture doc's reference YAML** (architecture-xstate-engine.md, lines 103-131) is the canonical target format. Match it exactly for the workflow structure.
- **`pass_when: all_pass` vs `consensus`.** The architecture doc shows `pass_when: all_pass` for the verification gate, but the parser (22-2) only accepts `consensus`, `majority`, `any_pass` — NOT `all_pass`. Use `consensus` instead (semantically equivalent: all checks must pass). If `all_pass` support is needed, that's a separate parser change.
- **`deploy` and `verify` tasks.** These exist in the current `tasks:` section but `deploy` was only reachable via `epic_flow: [story_flow, retro]` indirectly. In the new format, `deploy` becomes an explicit step in the `for_each: epic` steps. `verify` is now referenced by `gate: verification`'s check list.
- **`codeharness init` flow.** Check whether init copies `default.yaml` as-is or generates it from a template. If it's a direct copy, the new file should propagate automatically. If there's template logic, update it.
- **Test impact.** The main risk is tests that load the real `default.yaml` and assert on `story_flow` / `epic_flow` keys. These will fail after the rewrite and must be updated.
- **No TypeScript changes expected** unless code outside the parser destructures `story_flow` / `epic_flow` from the loaded config. Search for these references.

### Project Structure Notes

- `templates/workflows/default.yaml` — the primary file being rewritten
- `src/lib/workflow-parser.ts` — parser (already supports both formats, no changes expected)
- `src/lib/__tests__/workflow-parser.test.ts` — may need test updates if tests load the real template
- `src/commands/init.ts` (or similar) — check for template generation logic

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#Flow Configuration Format] — canonical target YAML format
- [Source: _bmad-output/planning-artifacts/epics-xstate-engine.md#Story 1.3] — epic-level story definition
- [Source: _bmad-output/implementation-artifacts/22-1-parse-for-each-blocks.md] — for_each parser (done)
- [Source: _bmad-output/implementation-artifacts/22-2-parse-named-gate-blocks.md] — gate parser (done)
- [Source: templates/workflows/default.yaml] — current file to be rewritten

## Verification Requirements

Before this story can be marked complete, the following must be verified:

- [ ] All acceptance criteria verified via Docker-based blind verification
- [ ] Proof document at `verification/22-3-update-default-yaml-to-new-format-proof.md`
- [ ] Evidence is reproducible

## Documentation Requirements

- [ ] Per-subsystem AGENTS.md updated for any new/changed modules
- [ ] Exec-plan created at `docs/exec-plans/active/22-3-update-default-yaml-to-new-format.md`
- [ ] Inline code documentation for new public APIs

## Testing Requirements

- [ ] Tests written for all new code
- [ ] Project-wide test coverage at 100%
- [ ] All tests passing

</story-spec>
