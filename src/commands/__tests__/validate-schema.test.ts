import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { runSchemaValidation } from '../validate-schema.js';
import { registerValidateCommand } from '../validate.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock validate-self to avoid pulling in modules/verify
vi.mock('../validate-self.js', () => ({
  registerValidateSelfCommand: vi.fn(),
}));

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-validate-schema-test-'));
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

// ─── Valid YAML content ──────────────────────────────────────────────────────

const validWorkflowYaml = `
tasks:
  implement:
    agent: dev
    session: fresh
    source_access: true
  verify:
    agent: evaluator
    session: fresh
    source_access: false

story_flow:
  - implement
  - verify
epic_flow:
  - story_flow
`;

const invalidWorkflowMissingTasks = `
story_flow:
  - implement
epic_flow:
  - story_flow
`;

const danglingRefYaml = `
tasks:
  implement:
    agent: dev

story_flow:
  - implement
  - nonexistent_task
epic_flow:
  - story_flow
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupWorkflowsDir(files: Record<string, string>): void {
  const wfDir = join(testDir, '.codeharness', 'workflows');
  mkdirSync(wfDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(wfDir, name), content, 'utf-8');
  }
}

function createCli(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerValidateCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const logs: string[] = [];
  const errLogs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    errLogs.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const origCwd = process.cwd();
  process.chdir(testDir);
  try {
    const program = createCli();
    await program.parseAsync(['node', 'codeharness', ...args]);
  } finally {
    process.chdir(origCwd);
  }
  consoleSpy.mockRestore();
  stderrSpy.mockRestore();
  return { stdout: logs.join('\n'), stderr: errLogs.join('') };
}

// ─── Unit tests for runSchemaValidation ──────────────────────────────────────

describe('runSchemaValidation', () => {
  it('returns pass when all workflow files are valid (AC #1)', () => {
    setupWorkflowsDir({ 'default.yaml': validWorkflowYaml });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('pass');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].valid).toBe(true);
    expect(result.files[0].errors).toEqual([]);
  });

  it('returns fail with errors when workflow has missing required keys (AC #2)', () => {
    setupWorkflowsDir({ 'bad.yaml': invalidWorkflowMissingTasks });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('fail');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].valid).toBe(false);
    expect(result.files[0].errors.length).toBeGreaterThan(0);
    // Error should mention path and message
    expect(result.files[0].errors[0].message).toBeTruthy();
    expect(result.files[0].errors[0].path).toBeTruthy();
  });

  it('catches dangling task references (AC #3)', () => {
    setupWorkflowsDir({ 'dangling.yaml': danglingRefYaml });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('fail');
    expect(result.files[0].valid).toBe(false);
    const danglingError = result.files[0].errors.find(e =>
      e.message.includes('nonexistent_task'),
    );
    expect(danglingError).toBeDefined();
    expect(danglingError!.path).toContain('/story_flow/');
  });

  it('returns fail when .codeharness/workflows/ directory does not exist (AC #4)', () => {
    // testDir has no .codeharness/ directory
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('fail');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].valid).toBe(false);
    expect(result.files[0].errors[0].message).toBe('No workflow files found');
  });

  it('returns fail when workflows directory exists but is empty (AC #4)', () => {
    mkdirSync(join(testDir, '.codeharness', 'workflows'), { recursive: true });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('fail');
    expect(result.files[0].errors[0].message).toBe('No workflow files found');
  });

  it('handles mixed valid and invalid files (AC #5)', () => {
    setupWorkflowsDir({
      'good.yaml': validWorkflowYaml,
      'bad.yaml': invalidWorkflowMissingTasks,
    });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('fail');
    expect(result.files).toHaveLength(2);
    const goodFile = result.files.find(f => f.path.includes('good.yaml'));
    const badFile = result.files.find(f => f.path.includes('bad.yaml'));
    expect(goodFile!.valid).toBe(true);
    expect(badFile!.valid).toBe(false);
    expect(badFile!.errors.length).toBeGreaterThan(0);
  });

  it('discovers .yml files too', () => {
    setupWorkflowsDir({ 'custom.yml': validWorkflowYaml });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('pass');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toContain('custom.yml');
  });

  it('handles non-WorkflowParseError exceptions gracefully (M2)', async () => {
    // Set up a valid-looking directory so discovery finds the file
    setupWorkflowsDir({ 'crash.yaml': validWorkflowYaml });
    // Mock parseWorkflow to throw a plain Error (not WorkflowParseError)
    const wfParser = await import('../../lib/workflow-parser.js');
    const spy = vi.spyOn(wfParser, 'parseWorkflow').mockImplementation(() => {
      throw new TypeError('unexpected internal failure');
    });
    const result = runSchemaValidation(testDir);
    expect(result.status).toBe('fail');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].valid).toBe(false);
    expect(result.files[0].errors[0].message).toBe('unexpected internal failure');
    spy.mockRestore();
  });
});

// ─── CLI integration tests ──────────────────────────────────────────────────

describe('validate schema CLI', () => {
  it('exits 0 and prints [OK] for valid workflow (AC #1)', async () => {
    setupWorkflowsDir({ 'default.yaml': validWorkflowYaml });
    const { stdout } = await runCli(['validate', 'schema']);
    expect(stdout).toContain('[OK]');
    expect(stdout).toContain('default.yaml');
    expect(process.exitCode).toBe(0);
  });

  it('exits 1 and prints [FAIL] with error details for invalid workflow (AC #2)', async () => {
    setupWorkflowsDir({ 'bad.yaml': invalidWorkflowMissingTasks });
    const { stdout } = await runCli(['validate', 'schema']);
    expect(stdout).toContain('[FAIL]');
    expect(stdout).toContain('bad.yaml');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 and reports dangling reference (AC #3)', async () => {
    setupWorkflowsDir({ 'dangling.yaml': danglingRefYaml });
    const { stdout, stderr } = await runCli(['validate', 'schema']);
    expect(stdout).toContain('[FAIL]');
    expect(stderr).toContain('nonexistent_task');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 with "No workflow files found" when dir missing (AC #4)', async () => {
    const { stdout, stderr } = await runCli(['validate', 'schema']);
    expect(stdout).toContain('[FAIL]');
    expect(stderr).toContain('No workflow files found');
    expect(process.exitCode).toBe(1);
  });

  it('--json outputs correct shape (AC #5)', async () => {
    setupWorkflowsDir({
      'good.yaml': validWorkflowYaml,
      'bad.yaml': invalidWorkflowMissingTasks,
    });
    const { stdout } = await runCli(['--json', 'validate', 'schema']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(parsed.files.length).toBe(2);
    for (const f of parsed.files) {
      expect(f).toHaveProperty('path');
      expect(f).toHaveProperty('valid');
      expect(f).toHaveProperty('errors');
      expect(Array.isArray(f.errors)).toBe(true);
      for (const e of f.errors) {
        expect(e).toHaveProperty('path');
        expect(e).toHaveProperty('message');
      }
    }
  });

  it('default "validate" (no subcommand) runs schema validation (AC #6)', async () => {
    setupWorkflowsDir({ 'default.yaml': validWorkflowYaml });
    const { stdout } = await runCli(['validate']);
    expect(stdout).toContain('[OK]');
    expect(stdout).toContain('default.yaml');
    expect(process.exitCode).toBe(0);
  });

  it('default "validate" with no workflows reports fail (AC #6)', async () => {
    const { stdout, stderr } = await runCli(['validate']);
    expect(stdout).toContain('[FAIL]');
    expect(stderr).toContain('No workflow files found');
    expect(process.exitCode).toBe(1);
  });

  it('--json on default validate outputs correct shape (AC #5, #6)', async () => {
    setupWorkflowsDir({ 'default.yaml': validWorkflowYaml });
    const { stdout } = await runCli(['--json', 'validate']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('pass');
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].valid).toBe(true);
  });
});
