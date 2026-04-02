import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { registerBridgeCommand } from '../bridge.js';


const FIXTURES_DIR = resolve(__dirname, '../../../test/fixtures');
const SAMPLE_EPICS = join(FIXTURES_DIR, 'sample-epics.md');

describe('bridge command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
    testDir = mkdtempSync(join(tmpdir(), 'ch-bridge-cmd-'));
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = undefined;
    rmSync(testDir, { recursive: true, force: true });
  });

  function createProgram(): Command {
    const program = new Command();
    program.exitOverride();
    program.option('--json', 'JSON output');
    registerBridgeCommand(program);
    return program;
  }

  it('fails with code 2 when --epics not provided', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'bridge']);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[FAIL] Missing required option: --epics <path>',
    );
    expect(process.exitCode).toBe(2);
  });

  it('fails with code 1 when epics file does not exist', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'bridge', '--epics', '/nonexistent/epics.md']);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[FAIL] Epics file not found: /nonexistent/epics.md',
    );
    expect(process.exitCode).toBe(1);
  });

  it('prints per-epic summary and total imported count', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'bridge', '--epics', SAMPLE_EPICS]);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[OK] Epic 1: Foundation'));
    expect(calls).toContainEqual(expect.stringContaining('[OK] Epic 2: Core Features'));
    expect(calls).toContainEqual(expect.stringContaining('[OK] Epic 3: Polish'));
    expect(calls).toContainEqual(expect.stringContaining('[OK] Bridge: 5 stories processed'));
    expect(process.exitCode).toBe(0);
  });

  it('--dry-run mode prints without creating beads issues', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'bridge', '--epics', SAMPLE_EPICS, '--dry-run']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[INFO] Dry run: would import'));
    expect(calls).toContainEqual(expect.stringContaining('dry run, nothing created'));
    expect(process.exitCode).toBe(0);
  });

  it('--json outputs valid JSON with expected structure', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', '--json', 'bridge', '--epics', SAMPLE_EPICS, '--dry-run']);

    // Find the JSON output call (the one with the BridgeResult)
    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      const msg = c[0] as string;
      try {
        const parsed = JSON.parse(msg) as Record<string, unknown>;
        return 'epics_parsed' in parsed;
      } catch {
        return false;
      }
    });

    expect(jsonCalls).toHaveLength(1);
    const result = JSON.parse(jsonCalls[0][0] as string) as Record<string, unknown>;
    expect(result.status).toBe('ok');
    expect(result.epics_parsed).toBe(3);
    expect(result.stories_processed).toBe(5);
    expect(Array.isArray(result.results)).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(5);
    expect(results[0]).toHaveProperty('storyKey');
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('storyFilePath');
  });

  it('handles empty epics file gracefully', async () => {
    const emptyFile = join(testDir, 'empty.md');
    writeFileSync(emptyFile, '');
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'bridge', '--epics', emptyFile]);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(expect.stringContaining('[WARN] No stories found'));
    expect(process.exitCode).toBe(0);
  });

  it('warns about stories without acceptance criteria', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', 'bridge', '--epics', SAMPLE_EPICS, '--dry-run']);

    const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContainEqual(
      expect.stringContaining('[WARN] Story Story Without ACs: no acceptance criteria found'),
    );
  });

  // Deduplication test removed — beads integration removed (Epic 8 replacement pending)

  it('--json with missing --epics outputs JSON error', async () => {
    const program = createProgram();

    await program.parseAsync(['node', 'test', '--json', 'bridge']);

    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      try {
        const parsed = JSON.parse(c[0] as string) as Record<string, unknown>;
        return parsed.status === 'fail';
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(2);
  });

  it('--json handles empty file with JSON output', async () => {
    const emptyFile = join(testDir, 'empty.md');
    writeFileSync(emptyFile, '');
    const program = createProgram();

    await program.parseAsync(['node', 'test', '--json', 'bridge', '--epics', emptyFile]);

    const jsonCalls = consoleSpy.mock.calls.filter((c: unknown[]) => {
      try {
        const parsed = JSON.parse(c[0] as string) as Record<string, unknown>;
        return 'epics_parsed' in parsed;
      } catch {
        return false;
      }
    });
    expect(jsonCalls).toHaveLength(1);
    const result = JSON.parse(jsonCalls[0][0] as string) as Record<string, unknown>;
    expect(result.stories_processed).toBe(0);
    expect(result.results).toEqual([]);
  });
});
