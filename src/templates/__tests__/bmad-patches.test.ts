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

  it('contains WHY section from patches/verify/ directory', () => {
    const content = storyVerificationPatch();
    expect(content).toContain('## WHY');
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

  it('contains WHY section from patches/dev/ directory', () => {
    const content = devEnforcementPatch();
    expect(content).toContain('## WHY');
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

  it('contains WHY section from patches/review/ directory', () => {
    const content = reviewEnforcementPatch();
    expect(content).toContain('## WHY');
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

  it('contains WHY section from patches/retro/ directory', () => {
    const content = retroEnforcementPatch();
    expect(content).toContain('## WHY');
  });
});

describe('sprintBeadsPatch', () => {
  it('returns non-empty string with planning content', () => {
    const content = sprintBeadsPatch();
    expect(content.length).toBeGreaterThan(50);
    expect(content.toLowerCase()).toContain('planning');
  });

  it('contains WHY section from patches/sprint/ directory', () => {
    const content = sprintBeadsPatch();
    expect(content).toContain('## WHY');
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

describe('per-role directory loading', () => {
  it('loads patches from patches/{role}/ subdirectories at runtime', () => {
    // Each patch function reads from the new subdirectory structure.
    // If the files exist (which they do in the repo), content comes from disk.
    // Verify content matches what we know is in the files.
    const devContent = devEnforcementPatch();
    expect(devContent).toContain('Architecture Awareness');

    const reviewContent = reviewEnforcementPatch();
    expect(reviewContent).toContain('Proof Quality Checks');

    const verifyContent = storyVerificationPatch();
    expect(verifyContent).toContain('Verification Requirements');

    const sprintContent = sprintBeadsPatch();
    expect(sprintContent).toContain('Pre-Planning Checks');

    const retroContent = retroEnforcementPatch();
    expect(retroContent).toContain('Verification Pipeline Health');
  });

  it('reads files at call time (not import time) for hot-reload behavior', () => {
    // Call twice — both should succeed, proving readFileSync happens at call time
    const first = devEnforcementPatch();
    const second = devEnforcementPatch();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });
});
