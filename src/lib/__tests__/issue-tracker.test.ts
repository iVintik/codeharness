import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  readIssues,
  writeIssues,
  nextIssueId,
  createIssue,
  closeIssue,
  VALID_STATUSES,
  VALID_PRIORITIES,
  type Issue,
  type IssuesFile,
} from '../issue-tracker.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-issue-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readIssues
// ---------------------------------------------------------------------------

describe('readIssues', () => {
  it('returns empty array when file does not exist', () => {
    const result = readIssues(testDir);
    expect(result).toEqual({ issues: [] });
  });

  it('parses existing issues.yaml correctly', () => {
    const dir = join(testDir, '.codeharness');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'issues.yaml'),
      `issues:\n  - id: issue-001\n    title: Bug A\n    source: manual\n    priority: high\n    status: backlog\n    created_at: "2026-01-01T00:00:00.000Z"\n`,
      'utf-8',
    );

    const result = readIssues(testDir);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe('issue-001');
    expect(result.issues[0].title).toBe('Bug A');
    expect(result.issues[0].priority).toBe('high');
    expect(result.issues[0].status).toBe('backlog');
  });

  it('returns empty array for malformed YAML without issues key', () => {
    const dir = join(testDir, '.codeharness');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'issues.yaml'), 'foo: bar\n', 'utf-8');

    const result = readIssues(testDir);
    expect(result).toEqual({ issues: [] });
  });
});

// ---------------------------------------------------------------------------
// writeIssues
// ---------------------------------------------------------------------------

describe('writeIssues', () => {
  it('creates .codeharness/ directory if needed', () => {
    const data: IssuesFile = {
      issues: [
        {
          id: 'issue-001',
          title: 'Test',
          source: 'manual',
          priority: 'medium',
          status: 'backlog',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    writeIssues(data, testDir);

    expect(existsSync(join(testDir, '.codeharness'))).toBe(true);
    expect(existsSync(join(testDir, '.codeharness', 'issues.yaml'))).toBe(true);
  });

  it('outputs valid YAML matching workflow-engine expected format', () => {
    const data: IssuesFile = {
      issues: [
        {
          id: 'issue-001',
          title: 'Docker timeout',
          source: 'retro-sprint-1',
          priority: 'high',
          status: 'backlog',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    writeIssues(data, testDir);

    const raw = readFileSync(join(testDir, '.codeharness', 'issues.yaml'), 'utf-8');
    const parsed = parse(raw) as Record<string, unknown>;

    // Verify structure matches what loadWorkItems() expects
    expect(parsed).toHaveProperty('issues');
    expect(Array.isArray(parsed.issues)).toBe(true);
    const issues = parsed.issues as Array<Record<string, unknown>>;
    expect(issues[0].id).toBe('issue-001');
    expect(issues[0].title).toBe('Docker timeout');
    expect(issues[0].source).toBe('retro-sprint-1');
    expect(issues[0].priority).toBe('high');
    expect(issues[0].status).toBe('backlog');
  });
});

// ---------------------------------------------------------------------------
// nextIssueId
// ---------------------------------------------------------------------------

describe('nextIssueId', () => {
  it('generates issue-001 for empty array', () => {
    expect(nextIssueId([])).toBe('issue-001');
  });

  it('increments from highest existing id', () => {
    const existing: Issue[] = [
      { id: 'issue-001', title: 'A', source: 'manual', priority: 'low', status: 'done', created_at: '' },
      { id: 'issue-005', title: 'B', source: 'manual', priority: 'low', status: 'backlog', created_at: '' },
    ];
    expect(nextIssueId(existing)).toBe('issue-006');
  });

  it('handles non-sequential ids correctly', () => {
    const existing: Issue[] = [
      { id: 'issue-003', title: 'A', source: 'manual', priority: 'low', status: 'done', created_at: '' },
    ];
    expect(nextIssueId(existing)).toBe('issue-004');
  });

  it('ignores ids that do not match the pattern', () => {
    const existing: Issue[] = [
      { id: 'custom-id', title: 'A', source: 'manual', priority: 'low', status: 'done', created_at: '' },
    ];
    expect(nextIssueId(existing)).toBe('issue-001');
  });
});

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------

describe('createIssue', () => {
  it('sets defaults: source=manual, priority=medium, status=backlog', () => {
    const issue = createIssue('Test bug', undefined, testDir);

    expect(issue.source).toBe('manual');
    expect(issue.priority).toBe('medium');
    expect(issue.status).toBe('backlog');
    expect(issue.id).toBe('issue-001');
    expect(issue.title).toBe('Test bug');
    expect(issue.created_at).toBeTruthy();
  });

  it('respects provided priority and source', () => {
    const issue = createIssue('Bug X', { priority: 'critical', source: 'retro-sprint-2' }, testDir);

    expect(issue.priority).toBe('critical');
    expect(issue.source).toBe('retro-sprint-2');
  });

  it('appends without modifying existing issues', () => {
    const first = createIssue('First', undefined, testDir);
    const second = createIssue('Second', undefined, testDir);

    expect(first.id).toBe('issue-001');
    expect(second.id).toBe('issue-002');

    const data = readIssues(testDir);
    expect(data.issues).toHaveLength(2);
    expect(data.issues[0].title).toBe('First');
    expect(data.issues[1].title).toBe('Second');
  });

  it('persists to disk', () => {
    createIssue('Persisted', undefined, testDir);

    const raw = readFileSync(join(testDir, '.codeharness', 'issues.yaml'), 'utf-8');
    expect(raw).toContain('issue-001');
    expect(raw).toContain('Persisted');
  });

  it('throws for invalid priority', () => {
    expect(() => createIssue('Bad priority', { priority: 'garbage' }, testDir)).toThrow(
      "Invalid priority 'garbage'",
    );
  });

  it('accepts all valid priorities', () => {
    for (const p of ['low', 'medium', 'high', 'critical']) {
      const issue = createIssue(`Priority ${p}`, { priority: p }, testDir);
      expect(issue.priority).toBe(p);
    }
  });
});

// ---------------------------------------------------------------------------
// closeIssue
// ---------------------------------------------------------------------------

describe('closeIssue', () => {
  it('updates status to done', () => {
    createIssue('To close', undefined, testDir);
    const closed = closeIssue('issue-001', testDir);

    expect(closed.status).toBe('done');
    expect(closed.id).toBe('issue-001');
  });

  it('persists the closed status', () => {
    createIssue('Persist close', undefined, testDir);
    closeIssue('issue-001', testDir);

    const data = readIssues(testDir);
    expect(data.issues[0].status).toBe('done');
  });

  it('throws for non-existent id', () => {
    createIssue('Exists', undefined, testDir);
    expect(() => closeIssue('issue-999', testDir)).toThrow("Issue 'issue-999' not found");
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('VALID_STATUSES contains all expected values', () => {
    const expected = ['backlog', 'ready', 'in-progress', 'review', 'verifying', 'done', 'failed', 'blocked'];
    for (const s of expected) {
      expect(VALID_STATUSES.has(s)).toBe(true);
    }
    expect(VALID_STATUSES.size).toBe(8);
  });

  it('VALID_PRIORITIES contains all expected values', () => {
    const expected = ['low', 'medium', 'high', 'critical'];
    for (const p of expected) {
      expect(VALID_PRIORITIES.has(p)).toBe(true);
    }
    expect(VALID_PRIORITIES.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Compatibility with loadWorkItems()
// ---------------------------------------------------------------------------

describe('workflow-engine compatibility', () => {
  it('created YAML round-trips through yaml parse matching loadWorkItems expectations', () => {
    createIssue('Docker timeout', { priority: 'high', source: 'retro-sprint-1' }, testDir);
    createIssue('Memory leak', { priority: 'critical', source: 'manual' }, testDir);

    const raw = readFileSync(join(testDir, '.codeharness', 'issues.yaml'), 'utf-8');
    const parsed = parse(raw) as Record<string, unknown>;

    // loadWorkItems expects: parsed.issues as Array<Record<string, unknown>>
    expect(Array.isArray(parsed.issues)).toBe(true);
    const issues = parsed.issues as Array<Record<string, unknown>>;

    expect(issues).toHaveLength(2);

    // Verify all fields that loadWorkItems accesses
    expect(issues[0].id).toBe('issue-001');
    expect(issues[0].title).toBe('Docker timeout');
    expect(issues[0].status).toBe('backlog');

    expect(issues[1].id).toBe('issue-002');
    expect(issues[1].title).toBe('Memory leak');
    expect(issues[1].status).toBe('backlog');
  });
});
