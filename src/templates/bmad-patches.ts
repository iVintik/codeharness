/**
 * Embedded patch templates for BMAD workflow files.
 * Each function returns patch content (without markers — the patch engine adds those).
 * Patch names use kebab-case matching the marker format.
 *
 * Architecture Decision 6: All templates are TypeScript string literals.
 */

/**
 * Patch for story template: verification, documentation, and testing requirements.
 * Target: _bmad/bmm/workflows/4-implementation/create-story/template.md
 */
export function storyVerificationPatch(): string {
  return `## Verification Requirements

- [ ] Showboat proof document created (\`docs/exec-plans/active/<story-key>.proof.md\`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in \`docs/exec-plans/active/<story-key>.md\`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%`;
}

/**
 * Patch for dev-story workflow: observability, docs update, and test enforcement.
 * Target: _bmad/bmm/workflows/4-implementation/dev-story/checklist.md
 */
export function devEnforcementPatch(): string {
  return `## Codeharness Enforcement

### Observability Check
- [ ] Query VictoriaLogs after test runs to verify telemetry flows
- [ ] Confirm logs, metrics, and traces are being collected

### Documentation Update
- [ ] AGENTS.md updated for all changed modules
- [ ] Exec-plan reflects current implementation state

### Test Enforcement
- [ ] All tests pass (\`npm test\` / \`pytest\`)
- [ ] Coverage gate: 100% of new/changed code
- [ ] No skipped or pending tests without justification`;
}

/**
 * Patch for code-review workflow: Showboat proof, AGENTS.md freshness, coverage delta.
 * Target: _bmad/bmm/workflows/4-implementation/code-review/checklist.md
 */
export function reviewEnforcementPatch(): string {
  return `## Codeharness Review Gates

### Verification
- [ ] Showboat proof document exists and passes \`showboat verify\`
- [ ] All acceptance criteria have evidence in proof document

### Documentation Freshness
- [ ] AGENTS.md is current for all changed modules
- [ ] No stale references to removed or renamed modules

### Coverage
- [ ] Coverage delta reported (before vs after)
- [ ] No coverage regression in changed files
- [ ] Overall coverage meets project target`;
}

/**
 * Patch for retrospective workflow: verification effectiveness, doc health, test quality.
 * Target: _bmad/bmm/workflows/4-implementation/retrospective/instructions.md
 */
export function retroEnforcementPatch(): string {
  return `## Codeharness Quality Metrics

### Verification Effectiveness
- [ ] How many ACs were caught by verification vs manual review?
- [ ] Were there any false positives in Showboat proofs?
- [ ] Time spent on verification vs value delivered

### Documentation Health
- [ ] AGENTS.md accuracy grade (A/B/C/D/F)
- [ ] Exec-plans completeness — are all active stories documented?
- [ ] Stale documentation identified and cleaned up

### Test Quality
- [ ] Coverage trend (improving, stable, declining)
- [ ] Test reliability — any flaky tests introduced?
- [ ] Integration test coverage for cross-module interactions`;
}

/**
 * Patch for sprint-planning workflow: bd ready integration, beads issue status.
 * Target: _bmad/bmm/workflows/4-implementation/sprint-planning/checklist.md
 */
export function sprintBeadsPatch(): string {
  return `## Codeharness Backlog Integration

### Beads Issue Status
- [ ] Run \`bd ready\` to display issues ready for development
- [ ] Review beads issue counts by status (open, in-progress, done)
- [ ] Verify no blocked issues without documented reason

### Sprint Readiness
- [ ] All selected stories have corresponding beads issues
- [ ] Dependencies between stories are reflected in beads deps
- [ ] Capacity aligns with estimated story complexity`;
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
};
