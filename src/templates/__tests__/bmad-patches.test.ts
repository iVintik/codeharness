import { describe, it, expect } from 'vitest';

import {
  storyVerificationPatch,
  devEnforcementPatch,
  reviewEnforcementPatch,
  retroEnforcementPatch,
  sprintBeadsPatch,
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
});

describe('PATCH_TEMPLATES', () => {
  it('contains all 5 patch names', () => {
    const expected = ['story-verification', 'dev-enforcement', 'review-enforcement', 'retro-enforcement', 'sprint-beads'];
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
  });
});
