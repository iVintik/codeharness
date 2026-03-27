import { describe, it, expect } from 'vitest';
import {
  VALIDATION_ACS,
  getACsByCategory,
  getTestProvableACs,
  getEnvironmentProvableACs,
  getCliVerifiableACs,
  getIntegrationRequiredACs,
  getACById,
} from '../validation-acs.js';
import type { ValidationAC, AcCategory, VerificationMethod } from '../validation-acs.js';

describe('Validation AC Registry', () => {
  // ─── Task 6: Registry contains exactly 79 ACs ──────────────────────────────

  it('contains exactly 79 ACs', () => {
    expect(VALIDATION_ACS).toHaveLength(79);
  });

  // ─── Task 6: Every FR (1-40) has exactly one AC ────────────────────────────

  it('has exactly one AC per FR (IDs 1-40)', () => {
    for (let frNum = 1; frNum <= 40; frNum++) {
      const matches = VALIDATION_ACS.filter(ac => ac.id === frNum);
      expect(matches).toHaveLength(1);
      expect(matches[0].frRef).toMatch(/^FR\d+$/);
    }
  });

  // ─── Task 6: No duplicate AC IDs ───────────────────────────────────────────

  it('has no duplicate AC IDs', () => {
    const ids = VALIDATION_ACS.map(ac => ac.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // ─── Task 6: Every AC has a verificationMethod ─────────────────────────────

  it('every AC has a verificationMethod', () => {
    const validMethods: VerificationMethod[] = ['cli', 'integration'];
    for (const ac of VALIDATION_ACS) {
      expect(validMethods).toContain(ac.verificationMethod);
    }
  });

  // ─── Task 6: CLI-verifiable ACs have a command ─────────────────────────────

  it('every test-provable (cli) AC has a command', () => {
    const cliACs = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli');
    for (const ac of cliACs) {
      expect(ac.command, `AC ${ac.id} (${ac.frRef}) is test-provable (cli) but has no command`).toBeDefined();
      expect(ac.command!.length).toBeGreaterThan(0);
    }
  });

  // ─── Additional structural validations ─────────────────────────────────────

  it('ACs are numbered sequentially 1-79', () => {
    for (let i = 0; i < VALIDATION_ACS.length; i++) {
      expect(VALIDATION_ACS[i].id).toBe(i + 1);
    }
  });

  it('every AC has a non-empty description', () => {
    for (const ac of VALIDATION_ACS) {
      expect(ac.description.length, `AC ${ac.id} has empty description`).toBeGreaterThan(0);
    }
  });

  it('every AC has a non-empty frRef', () => {
    for (const ac of VALIDATION_ACS) {
      expect(ac.frRef.length, `AC ${ac.id} has empty frRef`).toBeGreaterThan(0);
    }
  });

  it('every AC has a valid category', () => {
    const validCategories: AcCategory[] = ['FR', 'NFR', 'UX', 'Regression', 'ActionItem'];
    for (const ac of VALIDATION_ACS) {
      expect(validCategories).toContain(ac.category);
    }
  });

  // ─── Category distribution ─────────────────────────────────────────────────

  it('has correct category distribution', () => {
    const frCount = VALIDATION_ACS.filter(ac => ac.category === 'FR').length;
    const nfrCount = VALIDATION_ACS.filter(ac => ac.category === 'NFR').length;
    const uxCount = VALIDATION_ACS.filter(ac => ac.category === 'UX').length;
    const regressionCount = VALIDATION_ACS.filter(ac => ac.category === 'Regression').length;
    const actionItemCount = VALIDATION_ACS.filter(ac => ac.category === 'ActionItem').length;

    expect(frCount).toBe(40);
    expect(nfrCount).toBe(8);
    expect(uxCount).toBe(3);
    expect(regressionCount).toBe(20);
    expect(actionItemCount).toBe(8);
  });

  // ─── Verification method distribution ──────────────────────────────────────

  it('has correct verification method distribution', () => {
    const cliCount = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli').length;
    const integrationCount = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'integration').length;

    // Story table says 53/26 but actual AC verification tags yield 55/24
    expect(cliCount).toBe(55);
    expect(integrationCount).toBe(24);
  });

  // ─── FR ref uniqueness ─────────────────────────────────────────────────────

  it('FR ACs have unique frRef values', () => {
    const frACs = VALIDATION_ACS.filter(ac => ac.category === 'FR');
    const refs = frACs.map(ac => ac.frRef);
    const uniqueRefs = new Set(refs);
    expect(uniqueRefs.size).toBe(refs.length);
  });
});

// ─── Helper function tests ───────────────────────────────────────────────────

describe('getACsByCategory', () => {
  it('returns only FR ACs when asked', () => {
    const frs = getACsByCategory('FR');
    expect(frs).toHaveLength(40);
    expect(frs.every(ac => ac.category === 'FR')).toBe(true);
  });

  it('returns only NFR ACs when asked', () => {
    const nfrs = getACsByCategory('NFR');
    expect(nfrs).toHaveLength(8);
    expect(nfrs.every(ac => ac.category === 'NFR')).toBe(true);
  });

  it('returns only UX ACs when asked', () => {
    const ux = getACsByCategory('UX');
    expect(ux).toHaveLength(3);
  });

  it('returns only Regression ACs when asked', () => {
    const reg = getACsByCategory('Regression');
    expect(reg).toHaveLength(20);
  });

  it('returns only ActionItem ACs when asked', () => {
    const actions = getACsByCategory('ActionItem');
    expect(actions).toHaveLength(8);
  });
});

describe('getTestProvableACs', () => {
  it('returns 55 test-provable ACs (verificationMethod === cli)', () => {
    const acs = getTestProvableACs();
    expect(acs).toHaveLength(55);
    expect(acs.every(ac => ac.verificationMethod === 'cli')).toBe(true);
  });

  it('every returned AC has a command', () => {
    const acs = getTestProvableACs();
    for (const ac of acs) {
      expect(ac.command).toBeDefined();
    }
  });

  it('returns same data as deprecated getCliVerifiableACs()', () => {
    const newResult = getTestProvableACs();
    const oldResult = getCliVerifiableACs();
    expect(newResult).toEqual(oldResult);
  });
});

describe('getEnvironmentProvableACs', () => {
  it('returns 24 environment-provable ACs (verificationMethod === integration)', () => {
    const acs = getEnvironmentProvableACs();
    expect(acs).toHaveLength(24);
    expect(acs.every(ac => ac.verificationMethod === 'integration')).toBe(true);
  });

  it('returns same data as deprecated getIntegrationRequiredACs()', () => {
    const newResult = getEnvironmentProvableACs();
    const oldResult = getIntegrationRequiredACs();
    expect(newResult).toEqual(oldResult);
  });
});

describe('getCliVerifiableACs (deprecated alias)', () => {
  it('returns 55 test-provable (cli) ACs', () => {
    const cliACs = getCliVerifiableACs();
    expect(cliACs).toHaveLength(55);
    expect(cliACs.every(ac => ac.verificationMethod === 'cli')).toBe(true);
  });

  it('every returned AC has a command', () => {
    const cliACs = getCliVerifiableACs();
    for (const ac of cliACs) {
      expect(ac.command).toBeDefined();
    }
  });
});

describe('getIntegrationRequiredACs (deprecated alias)', () => {
  it('returns 24 environment-provable (integration) ACs', () => {
    const intACs = getIntegrationRequiredACs();
    expect(intACs).toHaveLength(24);
    expect(intACs.every(ac => ac.verificationMethod === 'integration')).toBe(true);
  });
});

describe('getACById', () => {
  it('returns the correct AC for a valid ID', () => {
    const ac1 = getACById(1);
    expect(ac1).toBeDefined();
    expect(ac1!.id).toBe(1);
    expect(ac1!.frRef).toBe('FR1');
  });

  it('returns the last AC (79)', () => {
    const ac79 = getACById(79);
    expect(ac79).toBeDefined();
    expect(ac79!.id).toBe(79);
    expect(ac79!.category).toBe('ActionItem');
  });

  it('returns undefined for non-existent ID', () => {
    expect(getACById(0)).toBeUndefined();
    expect(getACById(80)).toBeUndefined();
    expect(getACById(-1)).toBeUndefined();
  });
});

// ─── Integration prerequisite tags (Task 3) ──────────────────────────────────

describe('Integration AC prerequisites', () => {
  it('Docker-dependent ACs are environment-provable (integration)', () => {
    const dockerACs = [2, 5, 6, 13, 14, 63];
    for (const id of dockerACs) {
      const ac = getACById(id);
      expect(ac).toBeDefined();
      expect(ac!.verificationMethod, `AC ${id} should be integration`).toBe('integration');
    }
  });

  it('Shared stack ACs are environment-provable (integration)', () => {
    const stackACs = [2, 66];
    for (const id of stackACs) {
      const ac = getACById(id);
      expect(ac).toBeDefined();
      expect(ac!.verificationMethod, `AC ${id} should be integration`).toBe('integration');
    }
  });

  it('OpenSearch ACs are environment-provable (integration)', () => {
    const osACs = [3, 32, 69];
    for (const id of osACs) {
      const ac = getACById(id);
      expect(ac).toBeDefined();
      expect(ac!.verificationMethod, `AC ${id} should be integration`).toBe('integration');
    }
  });

  it('Agent-browser ACs are environment-provable (integration)', () => {
    const browserACs = [16, 70];
    for (const id of browserACs) {
      const ac = getACById(id);
      expect(ac).toBeDefined();
      expect(ac!.verificationMethod, `AC ${id} should be integration`).toBe('integration');
    }
  });

  it('Ralph session ACs are environment-provable (integration)', () => {
    const ralphACs = [9, 42];
    for (const id of ralphACs) {
      const ac = getACById(id);
      expect(ac).toBeDefined();
      expect(ac!.verificationMethod, `AC ${id} should be integration`).toBe('integration');
    }
  });
});

// ─── Regression mapping (Task 4) ─────────────────────────────────────────────

describe('Regression ACs map to v1 stories', () => {
  it('regression ACs cover IDs 52-71', () => {
    const regACs = getACsByCategory('Regression');
    const ids = regACs.map(ac => ac.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(52);
    expect(ids[ids.length - 1]).toBe(71);
  });

  it('each regression AC references a story number', () => {
    const regACs = getACsByCategory('Regression');
    for (const ac of regACs) {
      expect(ac.frRef).toMatch(/^Regression: \d+-\d+$/);
    }
  });
});

// ─── Action item ACs (Task 5) ────────────────────────────────────────────────

describe('Action item ACs map to session retros', () => {
  it('action item ACs cover IDs 72-79', () => {
    const actionACs = getACsByCategory('ActionItem');
    const ids = actionACs.map(ac => ac.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(72);
    expect(ids[ids.length - 1]).toBe(79);
  });

  it('each action item AC references a session retro', () => {
    const actionACs = getACsByCategory('ActionItem');
    for (const ac of actionACs) {
      expect(ac.frRef).toMatch(/^Action: session-retro-/);
    }
  });

  it('all action item ACs are test-provable (cli)', () => {
    const actionACs = getACsByCategory('ActionItem');
    expect(actionACs.every(ac => ac.verificationMethod === 'cli')).toBe(true);
  });
});
