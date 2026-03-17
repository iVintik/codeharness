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
  it('returns non-empty string with verification content', () => {
    const content = storyVerificationPatch();
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('Verification');
    expect(content).toContain('proof');
  });

  it('contains testing requirements', () => {
    const content = storyVerificationPatch();
    expect(content.toLowerCase()).toContain('test');
    expect(content.toLowerCase()).toContain('coverage');
  });
});

describe('devEnforcementPatch', () => {
  it('returns non-empty string with enforcement content', () => {
    const content = devEnforcementPatch();
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('Enforcement');
  });

  it('contains observability and testing sections', () => {
    const content = devEnforcementPatch();
    expect(content.toLowerCase()).toContain('observability');
    expect(content.toLowerCase()).toContain('test');
  });
});

describe('reviewEnforcementPatch', () => {
  it('returns non-empty string with review gates', () => {
    const content = reviewEnforcementPatch();
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('Review');
    expect(content.toLowerCase()).toContain('proof');
  });

  it('contains coverage check', () => {
    const content = reviewEnforcementPatch();
    expect(content.toLowerCase()).toContain('coverage');
  });
});

describe('retroEnforcementPatch', () => {
  it('returns non-empty string with retro metrics', () => {
    const content = retroEnforcementPatch();
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('Verification');
  });

  it('contains test quality section', () => {
    const content = retroEnforcementPatch();
    expect(content.toLowerCase()).toContain('test');
  });
});

describe('sprintBeadsPatch', () => {
  it('returns non-empty string with planning content', () => {
    const content = sprintBeadsPatch();
    expect(content.length).toBeGreaterThan(50);
    expect(content.toLowerCase()).toContain('planning');
  });
});

describe('sprintPlanningRetroPatch', () => {
  it('returns non-empty string', () => {
    const content = sprintPlanningRetroPatch();
    expect(content.length).toBeGreaterThan(50);
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
});
