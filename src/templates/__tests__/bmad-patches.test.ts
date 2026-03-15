import { describe, it, expect } from 'vitest';

import {
  storyVerificationPatch,
  devEnforcementPatch,
  reviewEnforcementPatch,
  retroEnforcementPatch,
  sprintBeadsPatch,
  sprintPlanningRetroPatch,
  PATCH_TEMPLATES,
} from '../bmad-patches.js';

describe('storyVerificationPatch', () => {
  it('returns non-empty string', () => {
    const content = storyVerificationPatch();
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains verification requirements', () => {
    const content = storyVerificationPatch();
    expect(content).toContain('Verification Requirements');
    expect(content).toContain('Showboat proof');
    expect(content).toContain('coverage');
  });

  it('contains documentation requirements', () => {
    const content = storyVerificationPatch();
    expect(content).toContain('Documentation Requirements');
    expect(content).toContain('AGENTS.md');
  });

  it('contains testing requirements', () => {
    const content = storyVerificationPatch();
    expect(content).toContain('Testing Requirements');
    expect(content).toContain('Unit tests');
    expect(content).toContain('Integration tests');
  });
});

describe('devEnforcementPatch', () => {
  it('returns non-empty string', () => {
    const content = devEnforcementPatch();
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains observability check', () => {
    const content = devEnforcementPatch();
    expect(content).toContain('Observability');
    expect(content).toContain('VictoriaLogs');
  });

  it('contains docs update enforcement', () => {
    const content = devEnforcementPatch();
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('Documentation');
  });

  it('contains test enforcement', () => {
    const content = devEnforcementPatch();
    expect(content).toContain('Test Enforcement');
    expect(content).toContain('100%');
  });
});

describe('reviewEnforcementPatch', () => {
  it('returns non-empty string', () => {
    const content = reviewEnforcementPatch();
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains Showboat proof check', () => {
    const content = reviewEnforcementPatch();
    expect(content).toContain('Showboat');
    expect(content).toContain('showboat verify');
  });

  it('contains AGENTS.md freshness check', () => {
    const content = reviewEnforcementPatch();
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('current');
  });

  it('contains coverage check', () => {
    const content = reviewEnforcementPatch();
    expect(content).toContain('coverage');
    expect(content).toContain('delta');
  });
});

describe('retroEnforcementPatch', () => {
  it('returns non-empty string', () => {
    const content = retroEnforcementPatch();
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains verification effectiveness section', () => {
    const content = retroEnforcementPatch();
    expect(content).toContain('Verification Effectiveness');
  });

  it('contains documentation health section', () => {
    const content = retroEnforcementPatch();
    expect(content).toContain('Documentation Health');
    expect(content).toContain('grade');
  });

  it('contains test quality section', () => {
    const content = retroEnforcementPatch();
    expect(content).toContain('Test Quality');
    expect(content).toContain('Coverage trend');
  });
});

describe('sprintBeadsPatch', () => {
  it('returns non-empty string', () => {
    const content = sprintBeadsPatch();
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains bd ready integration', () => {
    const content = sprintBeadsPatch();
    expect(content).toContain('bd ready');
  });

  it('contains beads issue counts', () => {
    const content = sprintBeadsPatch();
    expect(content).toContain('beads');
    expect(content).toContain('status');
  });

  it('contains pre-triage import verification checklist', () => {
    const content = sprintBeadsPatch();
    expect(content).toContain('Pre-Triage Import Verification');
    expect(content).toContain('codeharness retro-import');
    expect(content).toContain('codeharness github-import');
  });

  it('contains multi-source visibility checklist item', () => {
    const content = sprintBeadsPatch();
    expect(content).toContain('[gap:retro:...]');
    expect(content).toContain('[source:github:...]');
    expect(content).toContain('manual');
  });
});

describe('sprintPlanningRetroPatch', () => {
  it('returns non-empty string', () => {
    const content = sprintPlanningRetroPatch();
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains retrospective action items heading', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('Retrospective Action Items');
  });

  it('instructs scanning for retrospective files', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('epic-N-retrospective.md');
    expect(content).toContain('_bmad-output/implementation-artifacts/');
  });

  it('instructs surfacing unresolved action items', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('unresolved');
    expect(content).toContain('action items');
  });

  it('contains integration checklist items', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('- [ ]');
    expect(content).toContain('scanned');
    expect(content).toContain('incorporated');
  });

  it('is well-formed markdown with headings and list items', () => {
    const content = sprintPlanningRetroPatch();
    // Should have at least one heading
    expect(content).toMatch(/^##/m);
    // Should have checklist items
    expect(content).toMatch(/- \[ \]/);
  });

  it('includes codeharness retro-import step', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('codeharness retro-import --epic N');
    expect(content).toContain('[gap:retro:epic-N-item-M]');
  });

  it('includes codeharness github-import step', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('codeharness github-import');
    expect(content).toContain('[source:github:');
  });

  it('includes bd ready for combined backlog display', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('bd ready');
    expect(content).toContain('combined backlog');
  });

  it('contains source-aware backlog presentation section', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('Source-Aware Backlog Presentation');
    expect(content).toContain('[gap:retro:...]');
    expect(content).toContain('[source:github:...]');
    expect(content).toContain('no gap-id prefix');
  });

  it('contains uniform triage checklist item', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toContain('triaged uniformly');
  });

  it('has numbered steps in correct order (scan, retro-import, github-import, bd ready, identify, surface)', () => {
    const content = sprintPlanningRetroPatch();
    const scanIdx = content.indexOf('Scan for retrospective files');
    const retroImportIdx = content.indexOf('Import retro findings to beads');
    const ghImportIdx = content.indexOf('Import GitHub issues to beads');
    const bdReadyIdx = content.indexOf('Display combined backlog');
    const identifyIdx = content.indexOf('Identify unresolved items');
    const surfaceIdx = content.indexOf('Surface during planning');
    // All steps must exist
    expect(scanIdx).toBeGreaterThan(-1);
    expect(retroImportIdx).toBeGreaterThan(-1);
    expect(ghImportIdx).toBeGreaterThan(-1);
    expect(bdReadyIdx).toBeGreaterThan(-1);
    expect(identifyIdx).toBeGreaterThan(-1);
    expect(surfaceIdx).toBeGreaterThan(-1);
    // Steps must appear in correct order
    expect(scanIdx).toBeLessThan(retroImportIdx);
    expect(retroImportIdx).toBeLessThan(ghImportIdx);
    expect(ghImportIdx).toBeLessThan(bdReadyIdx);
    expect(bdReadyIdx).toBeLessThan(identifyIdx);
    expect(identifyIdx).toBeLessThan(surfaceIdx);
  });

  it('has no duplicate checklist items', () => {
    const content = sprintPlanningRetroPatch();
    const checklistItems = content.split('\n').filter((line) => line.startsWith('- [ ]'));
    const unique = new Set(checklistItems);
    expect(checklistItems.length).toBe(unique.size);
  });

  it('sections appear in correct order (retro review, source-aware, integration)', () => {
    const content = sprintPlanningRetroPatch();
    const retroReviewIdx = content.indexOf('### Unresolved Action Items');
    const sourceAwareIdx = content.indexOf('### Source-Aware Backlog Presentation');
    const integrationIdx = content.indexOf('### Integration with Sprint Planning');
    expect(retroReviewIdx).toBeGreaterThan(-1);
    expect(sourceAwareIdx).toBeGreaterThan(-1);
    expect(integrationIdx).toBeGreaterThan(-1);
    expect(retroReviewIdx).toBeLessThan(sourceAwareIdx);
    expect(sourceAwareIdx).toBeLessThan(integrationIdx);
  });

  it('matches expected content snapshot', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toMatchSnapshot();
  });
});

describe('sprintBeadsPatch', () => {
  it('has no duplicate checklist items', () => {
    const content = sprintBeadsPatch();
    const checklistItems = content.split('\n').filter((line) => line.startsWith('- [ ]'));
    const unique = new Set(checklistItems);
    expect(checklistItems.length).toBe(unique.size);
  });

  it('pre-triage section appears before beads status section', () => {
    const content = sprintBeadsPatch();
    const preTriage = content.indexOf('### Pre-Triage Import Verification');
    const beadsStatus = content.indexOf('### Beads Issue Status');
    const sprintReadiness = content.indexOf('### Sprint Readiness');
    expect(preTriage).toBeGreaterThan(-1);
    expect(beadsStatus).toBeGreaterThan(-1);
    expect(sprintReadiness).toBeGreaterThan(-1);
    expect(preTriage).toBeLessThan(beadsStatus);
    expect(beadsStatus).toBeLessThan(sprintReadiness);
  });

  it('matches expected content snapshot', () => {
    const content = sprintBeadsPatch();
    expect(content).toMatchSnapshot();
  });
});

describe('PATCH_TEMPLATES', () => {
  it('contains all 6 patch names', () => {
    const expected = [
      'story-verification',
      'dev-enforcement',
      'review-enforcement',
      'retro-enforcement',
      'sprint-beads',
      'sprint-retro',
    ];
    for (const name of expected) {
      expect(PATCH_TEMPLATES).toHaveProperty(name);
    }
  });

  it('all template functions return non-empty strings', () => {
    for (const [name, fn] of Object.entries(PATCH_TEMPLATES)) {
      const result = fn();
      expect(result.length, `Patch ${name} should return non-empty string`).toBeGreaterThan(0);
    }
  });

  it('maps to the correct functions', () => {
    expect(PATCH_TEMPLATES['story-verification']).toBe(storyVerificationPatch);
    expect(PATCH_TEMPLATES['dev-enforcement']).toBe(devEnforcementPatch);
    expect(PATCH_TEMPLATES['review-enforcement']).toBe(reviewEnforcementPatch);
    expect(PATCH_TEMPLATES['retro-enforcement']).toBe(retroEnforcementPatch);
    expect(PATCH_TEMPLATES['sprint-beads']).toBe(sprintBeadsPatch);
    expect(PATCH_TEMPLATES['sprint-retro']).toBe(sprintPlanningRetroPatch);
  });
});
