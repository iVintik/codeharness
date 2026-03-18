import { describe, it, expect, vi } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

// Import after mock is set up — readPatchFile will always return null
const {
  storyVerificationPatch,
  devEnforcementPatch,
  reviewEnforcementPatch,
  retroEnforcementPatch,
  sprintBeadsPatch,
  sprintPlanningRetroPatch,
} = await import('../bmad-patches.js');

describe('bmad-patches inline fallback defaults', () => {
  it('storyVerificationPatch returns inline default when file missing', () => {
    const content = storyVerificationPatch();
    expect(content).toContain('Verification Requirements');
    expect(content).toContain('proof');
    expect(content).toContain('coverage');
  });

  it('devEnforcementPatch returns inline default when file missing', () => {
    const content = devEnforcementPatch();
    expect(content).toContain('Enforcement');
    expect(content).toContain('Observability');
  });

  it('reviewEnforcementPatch returns inline default when file missing', () => {
    const content = reviewEnforcementPatch();
    expect(content).toContain('Review Gates');
    expect(content).toContain('Coverage');
  });

  it('retroEnforcementPatch returns inline default when file missing', () => {
    const content = retroEnforcementPatch();
    expect(content).toContain('Quality Metrics');
  });

  it('sprintBeadsPatch returns inline default when file missing', () => {
    const content = sprintBeadsPatch();
    expect(content).toContain('Sprint Planning');
  });

  it('sprintPlanningRetroPatch delegates to sprintBeadsPatch', () => {
    const content = sprintPlanningRetroPatch();
    expect(content).toBe(sprintBeadsPatch());
  });
});
