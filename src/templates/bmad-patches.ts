/**
 * BMAD workflow patch templates.
 * Reads patch content from `patches/{role}/{name}.md` files at runtime.
 * Falls back to inline defaults if files are not found (e.g., in npm package).
 *
 * Architecture Decision 6: Templates as files, not hardcoded strings.
 * This allows patches to be updated without rebuilding — learnings from
 * verification failures, agent misbehavior, and architectural changes
 * are captured in the patch files and applied on next init.
 *
 * Directory layout (FR35):
 *   patches/{dev,review,verify,sprint,retro}/*.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Reads a patch file from the patches/{role}/ directory.
 * Resolves relative to package root (works for both dev and npm install).
 *
 * @param role - The role subdirectory (dev, review, verify, sprint, retro)
 * @param name - The patch file name (without .md extension)
 */
function readPatchFile(role: string, name: string): string | null {
  const patchPath = join(__dirname, '..', '..', 'patches', role, `${name}.md`);
  try {
    if (existsSync(patchPath)) {
      return readFileSync(patchPath, 'utf-8').trim();
    }
  } catch {
    // IGNORE: patch file may have disappeared between check and read
  }

  return null;
}

export function storyVerificationPatch(): string {
  return readPatchFile('verify', 'story-verification') ?? `## Verification Requirements

- [ ] Showboat proof document created (verification/<story-key>-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/<story-key>.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%`;
}

export function devEnforcementPatch(): string {
  return readPatchFile('dev', 'enforcement') ?? `## Codeharness Enforcement

### Observability Check
- [ ] Query VictoriaLogs after test runs to verify telemetry flows

### Documentation Update
- [ ] AGENTS.md updated for all changed modules

### Test Enforcement
- [ ] All tests pass
- [ ] Coverage gate: 100% of new/changed code`;
}

export function reviewEnforcementPatch(): string {
  return readPatchFile('review', 'enforcement') ?? `## Codeharness Review Gates

### Verification
- [ ] Proof document exists and passes codeharness verify
- [ ] All acceptance criteria have evidence in proof document

### Coverage
- [ ] No coverage regression in changed files`;
}

export function retroEnforcementPatch(): string {
  return readPatchFile('retro', 'enforcement') ?? `## Codeharness Quality Metrics

### Verification Effectiveness
- [ ] How many ACs were caught by verification vs manual review?
- [ ] Were there any false positives in proofs?

### Test Quality
- [ ] Coverage trend (improving, stable, declining)`;
}

export function sprintBeadsPatch(): string {
  return readPatchFile('sprint', 'planning') ?? `## Codeharness Sprint Planning

- [ ] Review unresolved retrospective action items
- [ ] Import from all backlog sources before triage
- [ ] Verify story ACs are testable via CLI + Docker`;
}

export function sprintPlanningRetroPatch(): string {
  // Merged into sprint-planning patch — no longer separate
  return sprintBeadsPatch();
}

export function docsReadmeGenerationPatch(): string {
  return readPatchFile('docs', 'readme-generation') ?? `## Codeharness Documentation Targets (README + docs/index.md)

After the project scan is complete, generate or update \`{project-root}/README.md\`
alongside \`{project_knowledge}/index.md\`. README must contain, in order:

1. Project name + one-line description.
2. **What it does** — 3-6 sentences covering problem, audience, primary capability.
3. **Key features** — 4-8 bullets, each tied to a real scanned subpackage.
4. **Tech stack** — languages, frameworks, runtimes, optional extras.
5. **Getting started** — EXACTLY one install command, one run command, one
   expected-output block. No forks, no "alternatively", no lists of variants.
   Pick the happy path that works for the most users with the fewest prerequisites.
6. **Usage** — 3-6 everyday recipes (run as service, use as library, process
   batch, etc.), each with a short heading, 1-2 sentence description, and a
   minimal snippet. All commands/symbols must be real.
7. **Project structure** — tight annotated tree from source-tree-analysis.md.
8. **Documentation** — link docs/index.md plus key generated docs.
9. **Contributing / License** — preserve existing if present.

Use managed markers \`<!-- codeharness:readme -->\` / \`<!-- /codeharness:readme -->\`
so updates are non-destructive. \`docs/index.md\` must link back to \`../README.md\`.
Never embed codeharness CLI help. Never hardcode project structure — use real
scan data. Never invent features or APIs.`;
}

/**
 * Maps patch names to their template functions.
 */
export const PATCH_TEMPLATES: Record<string, () => string> = {
  'story-verification': storyVerificationPatch,
  'dev-enforcement': devEnforcementPatch,
  'review-enforcement': reviewEnforcementPatch,
  'retro-enforcement': retroEnforcementPatch,
  'sprint-beads': sprintBeadsPatch,
  'sprint-retro': sprintPlanningRetroPatch,
  'docs-readme-generation': docsReadmeGenerationPatch,
};
