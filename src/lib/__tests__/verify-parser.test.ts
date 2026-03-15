import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStoryACs, classifyAC } from '../verify-parser.js';

// Mock output.ts to suppress warnings during tests
vi.mock('../output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

let testDir: string;

beforeEach(() => {
  vi.restoreAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-parser-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeStoryFile(filename: string, content: string): string {
  const filePath = join(testDir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ─── classifyAC ─────────────────────────────────────────────────────────────

describe('classifyAC', () => {
  it('classifies UI keywords', () => {
    expect(classifyAC('use agent-browser to navigate')).toBe('ui');
    expect(classifyAC('take a screenshot of the page')).toBe('ui');
    expect(classifyAC('click on the submit button')).toBe('ui');
    expect(classifyAC('fill the form with data')).toBe('ui');
    expect(classifyAC('navigate to the home page')).toBe('ui');
  });

  it('classifies API keywords', () => {
    expect(classifyAC('make HTTP calls to the endpoint')).toBe('api');
    expect(classifyAC('use curl to test the API')).toBe('api');
    expect(classifyAC('verify REST response body')).toBe('api');
    expect(classifyAC('check the API endpoint status')).toBe('api');
  });

  it('classifies DB keywords', () => {
    expect(classifyAC('check database state after insert')).toBe('db');
    expect(classifyAC('verify DB state via query')).toBe('db');
    expect(classifyAC('use Database MCP to query')).toBe('db');
    expect(classifyAC('run SQL to verify')).toBe('db');
    expect(classifyAC('check the table contents')).toBe('db');
  });

  it('classifies general when no keywords match', () => {
    expect(classifyAC('verify the output is correct')).toBe('general');
    expect(classifyAC('check that the file exists')).toBe('general');
    expect(classifyAC('ensure the config is valid')).toBe('general');
  });

  it('is case insensitive', () => {
    expect(classifyAC('Use AGENT-BROWSER to test')).toBe('ui');
    expect(classifyAC('Make HTTP calls')).toBe('api');
    expect(classifyAC('Check DATABASE state')).toBe('db');
  });

  it('returns first matching type when multiple keywords present', () => {
    // UI keywords are checked first
    expect(classifyAC('use agent-browser to call API endpoint')).toBe('ui');
  });
});

// ─── parseStoryACs ──────────────────────────────────────────────────────────

describe('parseStoryACs', () => {
  it('extracts numbered ACs from a standard story file', () => {
    const filePath = writeStoryFile('story.md', `# Story 4.1: Test Story

Status: ready-for-dev

## Story

As a developer...

## Acceptance Criteria

1. **Given** a developer runs the command, **When** tests pass, **Then** output is shown.

2. **Given** a user opens the app, **When** they click submit, **Then** the form is saved.

## Tasks / Subtasks

- [ ] Task 1: Do something
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(2);
    expect(acs[0].id).toBe('1');
    expect(acs[0].description).toContain('developer runs the command');
    expect(acs[0].type).toBe('general');
    expect(acs[1].id).toBe('2');
    expect(acs[1].description).toContain('click submit');
    expect(acs[1].type).toBe('ui');
  });

  it('handles multi-line ACs', () => {
    const filePath = writeStoryFile('story.md', `# Story 1.1: Multi

## Acceptance Criteria

1. **Given** a developer runs the verify command,
   **When** the verification pipeline starts,
   **Then** preconditions are checked.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(1);
    expect(acs[0].description).toContain('developer runs the verify command');
    expect(acs[0].description).toContain('preconditions are checked');
  });

  it('classifies ACs by type from content', () => {
    const filePath = writeStoryFile('story.md', `# Story 1.1: Types

## Acceptance Criteria

1. **Given** agent-browser is used, **Then** screenshots are captured.

2. **Given** HTTP calls are made to the API endpoint, **Then** response bodies are inspected.

3. **Given** Database MCP is used for read-only queries, **Then** results are captured.

4. **Given** verification steps complete, **Then** a proof document is created.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(4);
    expect(acs[0].type).toBe('ui');
    expect(acs[1].type).toBe('api');
    expect(acs[2].type).toBe('db');
    expect(acs[3].type).toBe('general');
  });

  it('throws with actionable message when file not found', () => {
    expect(() => parseStoryACs('/nonexistent/path/story.md')).toThrow(
      'Story file not found: /nonexistent/path/story.md',
    );
  });

  it('returns empty array when no AC section exists', () => {
    const filePath = writeStoryFile('story.md', `# Story 1.1: No ACs

## Story

As a developer...

## Tasks

- [ ] Do something
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toEqual([]);
  });

  it('handles malformed ACs — skips empty descriptions', () => {
    const filePath = writeStoryFile('story.md', `# Story 1.1: Malformed

## Acceptance Criteria

1. **Given** a valid AC, **Then** it works.

2.

3. **Given** another valid AC, **Then** it also works.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    // AC #2 has empty description and should be skipped
    expect(acs).toHaveLength(2);
    expect(acs[0].id).toBe('1');
    expect(acs[1].id).toBe('3');
  });

  it('handles AC section at end of file (no following section)', () => {
    const filePath = writeStoryFile('story.md', `# Story 1.1: EOF

## Acceptance Criteria

1. **Given** it is the last section, **Then** it should still parse.
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(1);
    expect(acs[0].description).toContain('last section');
  });
});
