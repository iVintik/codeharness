/**
 * Tests for Story 16-6: Update create-story workflow with tier criteria.
 * Validates that instructions.xml Step 5 contains the four-tier decision tree
 * and checklist.md Section 3.6 checks for missing tier tags.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const INSTRUCTIONS_PATH = resolve(
  __dirname,
  '../../../../_bmad/bmm/workflows/4-implementation/create-story/instructions.xml',
);
const CHECKLIST_PATH = resolve(
  __dirname,
  '../../../../_bmad/bmm/workflows/4-implementation/create-story/checklist.md',
);
const HARNESS_RUN_PATH = resolve(__dirname, '../../../../commands/harness-run.md');

let instructions: string;
let checklist: string;
let harnessRun: string;

/** Extract a bounded section from content between two marker strings.
 *  Throws if either marker is missing — prevents silent false-passes. */
function extractSection(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Start marker not found: "${startMarker}"`);
  }
  const end = content.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`End marker not found: "${endMarker}" (searching after "${startMarker}")`);
  }
  return content.slice(start, end);
}

/** The VERIFICATION TIER TAGGING section in instructions.xml (Step 5). */
function tierSection(): string {
  return extractSection(
    instructions,
    'VERIFICATION TIER TAGGING',
    '<!-- Developer context section',
  );
}

/** The Tier Decision Tree up to (but not including) the Concrete Examples. */
function decisionTreeOnly(): string {
  return extractSection(instructions, 'Tier Decision Tree', 'Concrete Examples');
}

/** Checklist Section 3.6 content. */
function checklistSection36(): string {
  return extractSection(checklist, '3.6 Spec Coverage DISASTERS', 'Step 4:');
}

beforeAll(() => {
  instructions = readFileSync(INSTRUCTIONS_PATH, 'utf-8');
  checklist = readFileSync(CHECKLIST_PATH, 'utf-8');
  harnessRun = readFileSync(HARNESS_RUN_PATH, 'utf-8');
});

// ─── AC1: Step 5 contains verification tier tagging instruction ──────────────

describe('AC1: Step 5 verification tier tagging instruction', () => {
  it('contains a VERIFICATION TIER TAGGING section in Step 5', () => {
    expect(instructions).toContain('VERIFICATION TIER TAGGING');
  });

  it('lists all four tier names', () => {
    const section = tierSection();
    expect(section).toContain('test-provable');
    expect(section).toContain('runtime-provable');
    expect(section).toContain('environment-provable');
    expect(section).toContain('escalate');
  });
});

// ─── AC2: Decision tree with criteria and 4 concrete examples ────────────────

describe('AC2: decision tree with criteria and examples', () => {
  it('contains a Tier Decision Tree section', () => {
    expect(instructions).toContain('Tier Decision Tree');
  });

  it('includes at least 4 concrete examples (one per tier)', () => {
    const section = tierSection();
    // In XML, the comment tags are escaped as &lt;!-- and --&gt;
    expect(section).toContain('verification: test-provable');
    expect(section).toContain('verification: runtime-provable');
    expect(section).toContain('verification: environment-provable');
    expect(section).toContain('verification: escalate');
  });
});

// ─── AC3: Tag format is <!-- verification: {tier} --> ────────────────────────

describe('AC3: correct tag format', () => {
  it('specifies the tag format <!-- verification: {tier} --> (XML-escaped)', () => {
    // In XML content, angle brackets are escaped: &lt;!-- verification: {tier} --&gt;
    expect(instructions).toContain('verification: {tier}');
    expect(instructions).toContain('&lt;!-- verification: {tier} --&gt;');
  });
});

// ─── AC4: No references to old tier names ────────────────────────────────────

describe('AC4: no old tier names in instructions.xml', () => {
  it('does NOT reference cli-verifiable in the decision tree', () => {
    // Old tier names may appear in the "Do NOT use" warning below the tree — that is expected.
    // The decision tree itself (between "Tier Decision Tree" and "Concrete Examples") must be clean.
    const section = decisionTreeOnly();
    expect(section).not.toContain('cli-verifiable');
  });

  it('does NOT reference integration-required in the decision tree', () => {
    const section = decisionTreeOnly();
    expect(section).not.toContain('integration-required');
  });

  it('explicitly warns against using legacy tier names', () => {
    expect(instructions).toContain('Do NOT use legacy tier names');
  });
});

// ─── AC5: Checklist 3.6 includes missing tier tag check ─────────────────────

describe('AC5: checklist Section 3.6 tier tag check', () => {
  it('contains a missing verification tier tags bullet in Section 3.6', () => {
    const section = checklistSection36();
    expect(section).toContain('Missing verification tier tags');
  });

  it('mentions the tag format in the checklist bullet', () => {
    const section = checklistSection36();
    expect(section).toContain('<!-- verification: {tier} -->');
  });
});

// ─── AC6: test-provable criteria ─────────────────────────────────────────────

describe('AC6: test-provable criteria in decision tree', () => {
  it.each([
    'code structure',
    'types',
    'file existence',
    'test passing',
    'documentation',
    'config changes',
    'refactoring',
  ])('includes "%s" as a criterion', (criterion) => {
    expect(tierSection()).toContain(criterion);
  });
});

// ─── AC7: runtime-provable criteria ──────────────────────────────────────────

describe('AC7: runtime-provable criteria in decision tree', () => {
  it.each([
    'CLI output',
    'API endpoint behavior',
    'exit codes',
    'running the built application',
  ])('includes "%s" as a criterion', (criterion) => {
    expect(tierSection()).toContain(criterion);
  });
});

// ─── AC8: environment-provable criteria ──────────────────────────────────────

describe('AC8: environment-provable criteria in decision tree', () => {
  it.each([
    'Docker',
    'databases',
    'observability stack',
    'multiple services',
  ])('includes "%s" as a criterion', (criterion) => {
    expect(tierSection()).toContain(criterion);
  });
});

// ─── AC9: escalate criteria ──────────────────────────────────────────────────

describe('AC9: escalate criteria in decision tree', () => {
  it.each([
    'physical hardware',
    'human visual judgment',
    'paid external services',
    'GPU',
  ])('includes "%s" as a criterion', (criterion) => {
    expect(tierSection()).toContain(criterion);
  });
});

// ─── AC10: harness-run Step 3a regression check ──────────────────────────────

describe('AC10: harness-run Step 3a regression check (read-only)', () => {
  it('contains the four-tier decision tree in Step 3a', () => {
    expect(harnessRun).toContain('**Tier Decision Tree');
  });

  it('lists all four tiers in harness-run', () => {
    const section = extractSection(
      harnessRun,
      '**Tier Decision Tree',
      'Default to `test-provable` when unsure',
    );
    expect(section).toContain('`test-provable`');
    expect(section).toContain('`runtime-provable`');
    expect(section).toContain('`environment-provable`');
    expect(section).toContain('`escalate`');
  });

  it('defaults to test-provable when unsure', () => {
    expect(harnessRun).toContain('Default to `test-provable` when unsure');
  });
});
