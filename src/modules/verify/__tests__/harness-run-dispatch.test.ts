/**
 * Tests for Story 16-5: harness-run verification dispatch rewrite.
 * Validates that commands/harness-run.md contains the four-tier routing
 * instead of the old binary unit-testable/black-box dispatch.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const HARNESS_RUN_PATH = resolve(__dirname, '../../../../commands/harness-run.md');
let content: string;

beforeAll(() => {
  content = readFileSync(HARNESS_RUN_PATH, 'utf-8');
});

// ─── AC1: Step 3d-0 derives tier from AC-level tags, not story-level tag ────

describe('AC1: Step 3d-0 AC-level tier derivation', () => {
  it('contains instruction to ignore story-level verification-tier tag', () => {
    expect(content).toContain('Ignore the story-level `<!-- verification-tier: ... -->` tag');
  });

  it('instructs to parse AC-level <!-- verification: {tier} --> tags', () => {
    expect(content).toContain('extract its `<!-- verification: {tier} -->` tag');
  });

  it('references maxTier() for computing derived tier', () => {
    expect(content).toContain('maxTier(collectedTiers)');
  });

  it('defaults to test-provable when no AC-level tags are found', () => {
    expect(content).toContain('If no AC-level tags are found at all, default to `test-provable`');
  });
});

// ─── AC2: test-provable dispatch — build, test, code inspect ────────────────

describe('AC2: test-provable verification dispatch', () => {
  it('has a test-provable verification section', () => {
    expect(content).toContain('**test-provable verification (derived tier = test-provable):**');
  });

  it('mentions test-provable tier in the subagent prompt', () => {
    expect(content).toContain('test-provable tier');
  });

  it('does NOT instruct to use Docker in the test-provable subagent prompt', () => {
    // Extract just the subagent prompt within the test-provable section
    const sectionStart = content.indexOf('**test-provable verification (derived tier = test-provable):**');
    const sectionEnd = content.indexOf('**runtime-provable verification (derived tier = runtime-provable):**');
    const section = content.slice(sectionStart, sectionEnd);
    // The subagent prompt itself should not reference Docker or codeharness stack start
    expect(section).not.toContain('codeharness stack start');
    expect(section).not.toContain('docker run');
    expect(section).not.toContain('docker exec');
    // The post-subagent note "No Docker involved" is fine — it's an instruction to skip Docker steps
    expect(section).toContain('No Docker involved at any point');
  });
});

// ─── AC3: runtime-provable dispatch — build, run locally, interact ──────────

describe('AC3: runtime-provable verification dispatch', () => {
  it('has a runtime-provable verification section', () => {
    expect(content).toContain('**runtime-provable verification (derived tier = runtime-provable):**');
  });

  it('instructs to build and run the app locally', () => {
    const start = content.indexOf('**runtime-provable verification (derived tier = runtime-provable):**');
    const end = content.indexOf('**escalate verification (derived tier = escalate):**');
    const section = content.slice(start, end);
    expect(section).toContain('npm start');
    expect(section).toContain('cargo run');
    expect(section).toContain('python');
  });

  it('instructs to kill the running process after verification', () => {
    const start = content.indexOf('**runtime-provable verification (derived tier = runtime-provable):**');
    const end = content.indexOf('**escalate verification (derived tier = escalate):**');
    const section = content.slice(start, end);
    expect(section).toContain('Kill the running application process');
  });

  it('explicitly forbids Docker in runtime-provable section', () => {
    const start = content.indexOf('**runtime-provable verification (derived tier = runtime-provable):**');
    const end = content.indexOf('**escalate verification (derived tier = escalate):**');
    const section = content.slice(start, end);
    expect(section).toContain('Do NOT use Docker');
    expect(section).toContain('Do NOT run codeharness stack start');
  });
});

// ─── AC4: environment-provable dispatch — full Docker flow ──────────────────

describe('AC4: environment-provable verification dispatch', () => {
  it('has an environment-provable verification section', () => {
    expect(content).toContain('**environment-provable verification (derived tier = environment-provable):**');
  });

  it('references the Docker verification flow (3d-i through 3d-viii)', () => {
    expect(content).toContain('3d-i: Build Docker verify image');
    expect(content).toContain('3d-viii: Cleanup');
  });
});

// ─── AC5: escalate dispatch — mixed-tier per-AC routing ─────────────────────

describe('AC5: escalate verification dispatch', () => {
  it('has an escalate verification section', () => {
    expect(content).toContain('**escalate verification (derived tier = escalate):**');
  });

  it('instructs to mark escalate-tier ACs as [ESCALATE]', () => {
    const start = content.indexOf('**escalate verification (derived tier = escalate):**');
    const end = content.indexOf('**environment-provable verification (derived tier = environment-provable):**');
    const section = content.slice(start, end);
    expect(section).toContain('[ESCALATE]');
  });

  it('instructs to dispatch non-escalated ACs at their individual tier', () => {
    const start = content.indexOf('**escalate verification (derived tier = escalate):**');
    const end = content.indexOf('**environment-provable verification (derived tier = environment-provable):**');
    const section = content.slice(start, end);
    expect(section).toContain('dispatch verification at their individual tier level');
  });

  it('marks story done with escalation notes when non-escalated ACs pass', () => {
    const start = content.indexOf('**escalate verification (derived tier = escalate):**');
    const end = content.indexOf('**environment-provable verification (derived tier = environment-provable):**');
    const section = content.slice(start, end);
    expect(section).toContain('escalated ACs — marking done with known limitations');
  });
});

// ─── AC6: backward compat — old story-level tag is ignored ──────────────────

describe('AC6: backward compatibility with old story-level tags', () => {
  it('does NOT use the old binary check for <!-- verification-tier: unit-testable -->', () => {
    // The old pattern: "Search for `<!-- verification-tier: unit-testable -->`"
    // followed by "If the tag IS found" / "If the tag is NOT found"
    expect(content).not.toContain('Search for `<!-- verification-tier: unit-testable -->`');
    expect(content).not.toContain('If the tag `<!-- verification-tier: unit-testable -->` IS found');
  });

  it('explicitly states story-level tag is not used for dispatch', () => {
    expect(content).toContain('AC-level tags are the sole source of truth');
  });
});

// ─── AC7: legacy tag mapping via LEGACY_TIER_MAP ────────────────────────────

describe('AC7: legacy tag mapping in Step 3d-0', () => {
  it('references LEGACY_TIER_MAP', () => {
    expect(content).toContain('LEGACY_TIER_MAP');
  });

  it('lists cli-verifiable -> test-provable mapping', () => {
    expect(content).toContain('`cli-verifiable` → `test-provable`');
  });

  it('lists integration-required -> environment-provable mapping', () => {
    expect(content).toContain('`integration-required` → `environment-provable`');
  });

  it('lists unit-testable -> test-provable mapping', () => {
    expect(content).toContain('`unit-testable` → `test-provable`');
  });

  it('lists black-box -> environment-provable mapping', () => {
    expect(content).toContain('`black-box` → `environment-provable`');
  });
});

// ─── Step 3a: four-tier tagging instructions ────────────────────────────────

describe('Step 3a: create-story prompt uses four tiers', () => {
  it('contains the tier decision tree', () => {
    expect(content).toContain('**Tier Decision Tree');
  });

  it('lists all four tiers in the decision tree', () => {
    const start = content.indexOf('**Tier Decision Tree');
    const end = content.indexOf('Default to `test-provable` when unsure');
    const section = content.slice(start, end);
    expect(section).toContain('`test-provable`');
    expect(section).toContain('`runtime-provable`');
    expect(section).toContain('`environment-provable`');
    expect(section).toContain('`escalate`');
  });

  it('does NOT reference old cli-verifiable/integration-required in Step 3a', () => {
    // Find Step 3a section
    const start = content.indexOf('### 3a: If status is `backlog`');
    const end = content.indexOf('### 3b: If status is');
    const section = content.slice(start, end);
    expect(section).not.toContain('cli-verifiable');
    expect(section).not.toContain('integration-required');
  });
});

// ─── Dispatch routing table ─────────────────────────────────────────────────

describe('Step 3d-0 dispatch routing table', () => {
  it('routes test-provable to test-provable verification', () => {
    expect(content).toContain('**`test-provable`** → Use **test-provable verification**');
  });

  it('routes runtime-provable to runtime-provable verification', () => {
    expect(content).toContain('**`runtime-provable`** → Use **runtime-provable verification**');
  });

  it('routes environment-provable to environment-provable verification', () => {
    expect(content).toContain('**`environment-provable`** → Use **environment-provable verification**');
  });

  it('routes escalate to escalate verification', () => {
    expect(content).toContain('**`escalate`** → Use **escalate verification**');
  });
});

// ─── No old terminology left ────────────────────────────────────────────────

describe('no old terminology in dispatch sections', () => {
  it('does not contain "Unit-testable verification" heading', () => {
    expect(content).not.toContain('**Unit-testable verification');
  });

  it('does not contain "Black-box verification (default, no tag)" heading', () => {
    expect(content).not.toContain('**Black-box verification (default, no tag):**');
  });

  it('does not contain "unit-testable tier" in subagent prompts', () => {
    expect(content).not.toContain('unit-testable tier');
  });
});
