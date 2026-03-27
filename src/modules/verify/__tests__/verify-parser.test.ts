import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStoryACs, classifyAC, classifyVerifiability, classifyStrategy, classifyTier, parseVerificationTag, INTEGRATION_KEYWORDS } from '../parser.js';

// Mock output.ts to suppress warnings during tests
vi.mock('../../../lib/output.js', () => ({
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
    expect(acs[0].verifiability).toBe('cli-verifiable');
    expect(acs[0].tier).toBe('test-provable');
    expect(acs[1].id).toBe('2');
    expect(acs[1].description).toContain('click submit');
    expect(acs[1].type).toBe('ui');
    expect(acs[1].verifiability).toBe('cli-verifiable');
    expect(acs[1].tier).toBe('test-provable');
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
    expect(acs[0].verifiability).toBe('cli-verifiable');
  });

  it('reads verification tag from AC line and sets tier accordingly', () => {
    const filePath = writeStoryFile('story.md', `# Story 12.3: Tags

## Acceptance Criteria

1. **Given** a CLI command, **Then** output is shown. <!-- verification: cli-verifiable -->

2. **Given** sprint planning surfaces retro items, **Then** items appear. <!-- verification: integration-required -->

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(2);
    // Tag cli-verifiable maps to test-provable; verifiability is computed independently
    expect(acs[0].verifiability).toBe('cli-verifiable');
    expect(acs[0].tier).toBe('test-provable');
    // Tag integration-required maps to environment-provable; verifiability is now independent
    expect(acs[1].verifiability).toBe('cli-verifiable');
    expect(acs[1].tier).toBe('environment-provable');
  });

  it('falls back to classifyTier when no verification tag is present', () => {
    const filePath = writeStoryFile('story.md', `# Story 12.3: Heuristic

## Acceptance Criteria

1. **Given** a CLI command, **Then** output is correct.

2. **Given** an external system connection, **Then** data syncs.

3. **Given** manual verification is needed, **Then** flag for human review.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(3);
    // "cli command" matches RUNTIME_PROVABLE_KEYWORDS
    expect(acs[0].verifiability).toBe('cli-verifiable');
    expect(acs[0].tier).toBe('runtime-provable');
    // "external system" matches INTEGRATION_KEYWORDS (verifiability) but no tier keywords -> test-provable
    expect(acs[1].verifiability).toBe('integration-required');
    expect(acs[1].tier).toBe('test-provable');
    // "manual verification" matches INTEGRATION_KEYWORDS (verifiability) but no tier keywords -> test-provable
    expect(acs[2].verifiability).toBe('integration-required');
    expect(acs[2].tier).toBe('test-provable');
  });

  it('verification tag overrides heuristic tier classification', () => {
    const filePath = writeStoryFile('story.md', `# Story 12.3: Override

## Acceptance Criteria

1. **Given** an external system is connected, **Then** output is correct. <!-- verification: cli-verifiable -->

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(1);
    // "external system" would heuristically classify tier as test-provable (default),
    // but the explicit tag (cli-verifiable -> test-provable via LEGACY_TIER_MAP) sets tier.
    // verifiability is now computed independently by classifyVerifiability
    expect(acs[0].verifiability).toBe('integration-required');
    expect(acs[0].tier).toBe('test-provable');
  });

  it('tier is derived from classifyTier independently of verifiability', () => {
    const filePath = writeStoryFile('story.md', `# Story 16.1: Tier test

## Acceptance Criteria

1. **Given** an external system is used, **Then** it is verified.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(1);
    // verifiability matches "external system" -> integration-required
    expect(acs[0].verifiability).toBe('integration-required');
    // tier uses classifyTier: no tier keywords match -> test-provable (default)
    expect(acs[0].tier).toBe('test-provable');
  });

  it('defaults tier to test-provable for cli-verifiable ACs', () => {
    const filePath = writeStoryFile('story.md', `# Story 16.1: Default tier

## Acceptance Criteria

1. **Given** a simple check, **Then** it passes.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(1);
    expect(acs[0].verifiability).toBe('cli-verifiable');
    expect(acs[0].tier).toBe('test-provable');
  });

  it('derives tier from classifyTier fallback when no tag present (AC11)', () => {
    const filePath = writeStoryFile('story.md', `# Story 16.2: Tier fallback

## Acceptance Criteria

1. **Given** function X exists, **When** called, **Then** returns Z.

2. **Given** the CLI outputs JSON, **Then** it is valid.

3. **Given** Docker container starts, **Then** services are healthy.

4. **Given** physical display renders correctly, **Then** fps is 60.

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(4);
    expect(acs[0].tier).toBe('test-provable');
    expect(acs[1].tier).toBe('runtime-provable');
    expect(acs[2].tier).toBe('environment-provable');
    expect(acs[3].tier).toBe('escalate');
  });

  it('parses new verification tier tags from story AC lines', () => {
    const filePath = writeStoryFile('story.md', `# Story 16.1: New tags

## Acceptance Criteria

1. **Given** a test-provable AC, **Then** it works. <!-- verification: test-provable -->

2. **Given** a runtime-provable AC, **Then** it works. <!-- verification: runtime-provable -->

3. **Given** an environment-provable AC, **Then** it works. <!-- verification: environment-provable -->

4. **Given** an escalate AC, **Then** it works. <!-- verification: escalate -->

## Tasks
`);

    const acs = parseStoryACs(filePath);
    expect(acs).toHaveLength(4);
    expect(acs[0].tier).toBe('test-provable');
    expect(acs[1].tier).toBe('runtime-provable');
    expect(acs[2].tier).toBe('environment-provable');
    expect(acs[3].tier).toBe('escalate');
  });
});

// ─── classifyVerifiability ───────────────────────────────────────────────────

describe('classifyVerifiability', () => {
  it('returns integration-required for descriptions mentioning integration keywords', () => {
    expect(classifyVerifiability('connects to external system')).toBe('integration-required');
    expect(classifyVerifiability('uses real infrastructure for testing')).toBe('integration-required');
    expect(classifyVerifiability('requires manual verification')).toBe('integration-required');
  });

  it('returns cli-verifiable for descriptions that were previously over-classified', () => {
    expect(classifyVerifiability('sprint planning surfaces retro action items')).toBe('cli-verifiable');
    expect(classifyVerifiability('the workflow executes correctly')).toBe('cli-verifiable');
    expect(classifyVerifiability('run /command to start the process')).toBe('cli-verifiable');
    expect(classifyVerifiability('user session is active and preserved')).toBe('cli-verifiable');
    expect(classifyVerifiability('requires multi-step verification')).toBe('cli-verifiable');
  });

  it('returns cli-verifiable for descriptions without integration keywords', () => {
    expect(classifyVerifiability('CLI output contains expected text')).toBe('cli-verifiable');
    expect(classifyVerifiability('file exists at the expected path')).toBe('cli-verifiable');
    expect(classifyVerifiability('command returns exit code 0')).toBe('cli-verifiable');
    expect(classifyVerifiability('JSON contains the expected field')).toBe('cli-verifiable');
    expect(classifyVerifiability('verify the output is correct')).toBe('cli-verifiable');
  });

  it('is case insensitive', () => {
    expect(classifyVerifiability('EXTERNAL SYSTEM connection')).toBe('integration-required');
    expect(classifyVerifiability('Manual Verification required')).toBe('integration-required');
  });
});

// ─── parseVerificationTag ────────────────────────────────────────────────────

describe('parseVerificationTag', () => {
  it('maps legacy cli-verifiable tag to test-provable (AC9)', () => {
    expect(parseVerificationTag('some text <!-- verification: cli-verifiable -->')).toBe('test-provable');
  });

  it('maps legacy integration-required tag to environment-provable (AC10)', () => {
    expect(parseVerificationTag('some text <!-- verification: integration-required -->')).toBe('environment-provable');
  });

  it('returns null when no tag is present', () => {
    expect(parseVerificationTag('some text without a tag')).toBeNull();
  });

  it('handles extra whitespace in tag', () => {
    expect(parseVerificationTag('text <!--  verification:  cli-verifiable  -->')).toBe('test-provable');
  });

  it('parses new tier values: test-provable (AC8)', () => {
    expect(parseVerificationTag('text <!-- verification: test-provable -->')).toBe('test-provable');
  });

  it('parses new tier values: runtime-provable', () => {
    expect(parseVerificationTag('text <!-- verification: runtime-provable -->')).toBe('runtime-provable');
  });

  it('parses new tier values: environment-provable', () => {
    expect(parseVerificationTag('text <!-- verification: environment-provable -->')).toBe('environment-provable');
  });

  it('parses new tier values: escalate', () => {
    expect(parseVerificationTag('text <!-- verification: escalate -->')).toBe('escalate');
  });

  it('returns VerificationTier type (not legacy Verifiability)', () => {
    const result = parseVerificationTag('text <!-- verification: test-provable -->');
    expect(['test-provable', 'runtime-provable', 'environment-provable', 'escalate']).toContain(result);
  });

  it('maps legacy unit-testable tag to test-provable', () => {
    expect(parseVerificationTag('text <!-- verification: unit-testable -->')).toBe('test-provable');
  });

  it('maps legacy black-box tag to environment-provable', () => {
    expect(parseVerificationTag('text <!-- verification: black-box -->')).toBe('environment-provable');
  });

  it('returns null for unknown/invalid tag values', () => {
    expect(parseVerificationTag('text <!-- verification: unknown-value -->')).toBeNull();
    expect(parseVerificationTag('text <!-- verification: auto -->')).toBeNull();
  });
});

// ─── classifyTier ───────────────────────────────────────────────────────────

describe('classifyTier', () => {
  // AC1: test-provable for function/returns keywords
  it('returns test-provable for function descriptions (AC1)', () => {
    expect(classifyTier('Given function X exists, when called with Y, then returns Z')).toBe('test-provable');
  });

  // AC2: runtime-provable for CLI output keywords
  it('returns runtime-provable for CLI output descriptions (AC2)', () => {
    expect(classifyTier('Given the CLI outputs JSON when --format json is passed')).toBe('runtime-provable');
  });

  // AC3: environment-provable for VictoriaLogs keywords
  it('returns environment-provable for observability descriptions (AC3)', () => {
    expect(classifyTier('Given logs appear in VictoriaLogs after the request')).toBe('environment-provable');
  });

  // AC4: escalate for physical display keywords
  it('returns escalate for physical hardware descriptions (AC4)', () => {
    expect(classifyTier('Given 60fps rendering on a physical display')).toBe('escalate');
  });

  // AC5: test-provable for type/export keywords
  it('returns test-provable for type/export descriptions (AC5)', () => {
    expect(classifyTier('Given the type is exported from types.ts')).toBe('test-provable');
  });

  // AC6: runtime-provable for API endpoint keywords
  it('returns runtime-provable for API endpoint descriptions (AC6)', () => {
    expect(classifyTier('Given the API endpoint returns 200')).toBe('runtime-provable');
  });

  // AC7: environment-provable for Docker/container keywords
  it('returns environment-provable for Docker descriptions (AC7)', () => {
    expect(classifyTier('Given the Docker container starts successfully')).toBe('environment-provable');
  });

  it('defaults to test-provable when no keywords match', () => {
    expect(classifyTier('Given a simple check, Then it passes')).toBe('test-provable');
  });

  it('returns test-provable for empty string', () => {
    expect(classifyTier('')).toBe('test-provable');
  });

  it('is case insensitive', () => {
    expect(classifyTier('Given the DOCKER CONTAINER starts')).toBe('environment-provable');
    expect(classifyTier('Given HTTP server responds')).toBe('runtime-provable');
    expect(classifyTier('Given PHYSICAL HARDWARE is needed')).toBe('escalate');
  });

  it('respects priority order: escalate > environment > runtime > test', () => {
    // Description with both escalate and environment keywords — escalate wins
    expect(classifyTier('physical hardware with Docker container')).toBe('escalate');
    // Description with both environment and runtime keywords — environment wins
    expect(classifyTier('Docker container with HTTP server')).toBe('environment-provable');
  });

  it('matches multiple test-provable keywords', () => {
    expect(classifyTier('Given the interface is exported from config')).toBe('test-provable');
    expect(classifyTier('Given test passes with full coverage')).toBe('test-provable');
    expect(classifyTier('Given the refactor is complete and documentation updated')).toBe('test-provable');
  });

  it('matches multiple runtime-provable keywords', () => {
    expect(classifyTier('Given the server output shows the exit code')).toBe('runtime-provable');
    expect(classifyTier('Given the binary runs and produces correct output')).toBe('runtime-provable');
  });

  it('matches multiple environment-provable keywords', () => {
    expect(classifyTier('Given telemetry flows to the observability stack')).toBe('environment-provable');
    expect(classifyTier('Given the distributed queue processes messages end-to-end')).toBe('environment-provable');
  });

  it('matches multiple escalate keywords', () => {
    expect(classifyTier('Given GPU rendering with human visual confirmation')).toBe('escalate');
    expect(classifyTier('Given manual inspection of paid service output')).toBe('escalate');
  });
});

// ─── classifyStrategy ──────────────────────────────────────────────────────

describe('classifyStrategy', () => {
  it('returns docker as the default for all normal ACs', () => {
    expect(classifyStrategy('Given the user runs codeharness status, Then output shows version')).toBe('docker');
  });

  it('returns docker for Agent tool ACs', () => {
    expect(classifyStrategy('invokes /create-story via Agent tool')).toBe('docker');
  });

  it('returns docker for workflow ACs', () => {
    expect(classifyStrategy('runs the sprint planning workflow')).toBe('docker');
  });

  it('returns docker for integration keywords', () => {
    expect(classifyStrategy('requires integration test with external system')).toBe('docker');
  });

  it('returns docker for CLI ACs (safer than cli-direct)', () => {
    expect(classifyStrategy('runs npm test and checks coverage')).toBe('docker');
  });

  it('returns escalate for physical hardware ACs', () => {
    expect(classifyStrategy('requires physical hardware testing on device')).toBe('escalate');
  });

  it('returns escalate for manual human review ACs', () => {
    expect(classifyStrategy('needs manual human visual inspection')).toBe('escalate');
  });

  it('includes strategy in parsed ACs', () => {
    const storyPath = writeStoryFile('strategy-test.md', [
      '# Story',
      '',
      '## Acceptance Criteria',
      '',
      '1. Given the CLI is built, Then codeharness --version shows the version',
      '2. Given a sprint, Then it invokes /create-story via Agent tool for backlog stories',
    ].join('\n'));

    const acs = parseStoryACs(storyPath);
    expect(acs).toHaveLength(2);
    expect(acs[0].strategy).toBe('docker');
    expect(acs[1].strategy).toBe('docker');
  });

  // ─── AC #6: classifyStrategy never refuses based on project type ──────

  it('returns docker for empty description', () => {
    expect(classifyStrategy('')).toBe('docker');
  });

  it('returns docker for unusual project keywords', () => {
    expect(classifyStrategy('Rust cargo build and run tests')).toBe('docker');
    expect(classifyStrategy('Go binary compilation with modules')).toBe('docker');
    expect(classifyStrategy('Java Maven Spring Boot application')).toBe('docker');
    expect(classifyStrategy('Ruby on Rails web server')).toBe('docker');
  });

  it('never returns escalate for project-type descriptions', () => {
    const projectDescriptions = [
      'CLI project with Node.js',
      'Python library with pip install',
      'Claude Code plugin with slash commands',
      'Unknown project with no package.json',
      'Generic container with basic tools',
      'Web application with React frontend',
      'API server with Express',
      'Library published on npm',
    ];
    for (const desc of projectDescriptions) {
      expect(classifyStrategy(desc)).toBe('docker');
    }
  });

  it('only escalates for genuine escalation keywords', () => {
    expect(classifyStrategy('requires physical hardware testing')).toBe('escalate');
    expect(classifyStrategy('manual human review required')).toBe('escalate');
    expect(classifyStrategy('visual inspection by human needed')).toBe('escalate');
    expect(classifyStrategy('paid external service integration')).toBe('escalate');
  });
});

