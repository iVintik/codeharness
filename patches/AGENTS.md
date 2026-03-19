# patches/ — BMAD Workflow Enforcement Patches

## Purpose

Markdown patch files applied to BMAD workflow targets during `codeharness init`.
Each patch encodes operational learnings (FR33) as enforcement rules that
prevent recurrence of observed failures.

## Directory Structure (FR35)

```
patches/
  dev/enforcement.md        — Dev agent guardrails
  review/enforcement.md     — Review gates (proof quality, coverage)
  verify/story-verification.md — Black-box proof requirements
  sprint/planning.md        — Sprint planning pre-checks
  retro/enforcement.md      — Retrospective quality metrics
```

Subdirectories map to BMAD workflow roles (or analysis categories like `observability/`).

## Observability Module (`observability/`)

Semgrep YAML rules for static analysis of observability gaps. Each `.yaml` file is a standalone Semgrep config — no build step required. Deleting a rule file removes that check.

**Rules:**
- `catch-without-logging.yaml` — Detects catch blocks without error/warn logging (WARNING)
- `function-no-debug-log.yaml` — Detects functions without debug/info logging (INFO)
- `error-path-no-log.yaml` — Detects error paths (throw/return err) without preceding log (WARNING)

**Testing:** `semgrep --test patches/observability/` runs annotated test fixtures (`.ts` files alongside rules).

**Customization:** Edit YAML rules to add custom logger patterns (e.g., `logger.error(...)` for winston). Rules use `pattern-not` / `pattern-not-inside` to detect absence of logging.

## How Patches Work

1. `src/templates/bmad-patches.ts` reads files via `readPatchFile(role, name)`
2. `src/lib/bmad.ts` maps patch names to BMAD workflow target files via `PATCH_TARGETS`
3. `src/lib/patch-engine.ts` injects patch content between `CODEHARNESS-PATCH-START/END` markers
4. `src/commands/teardown.ts` removes patches on teardown

## Editing Patches

- Edit `.md` files directly — no TypeScript rebuild required (runtime `readFileSync`)
- Each patch MUST have a `## WHY` section explaining the operational failure it prevents (FR36)
- Do NOT change filenames without updating `readPatchFile()` calls in `bmad-patches.ts`
- Do NOT remove inline fallback strings in `bmad-patches.ts` — they cover npm installs without `patches/`

## Adding a New Patch

1. Create `patches/{role}/{name}.md` with `## WHY` section
2. Add a template function in `src/templates/bmad-patches.ts` calling `readPatchFile(role, name)`
3. Add entry to `PATCH_TEMPLATES` in `bmad-patches.ts`
4. Add target mapping in `PATCH_TARGETS` in `src/lib/bmad.ts`
5. Add tests in `src/templates/__tests__/bmad-patches.test.ts`
