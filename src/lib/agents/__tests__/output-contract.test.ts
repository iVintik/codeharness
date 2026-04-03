import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { writeOutputContract, readOutputContract } from '../output-contract.js';
import type { OutputContract } from '../types.js';

// --- Helpers ---

function makeContract(overrides: Partial<OutputContract> = {}): OutputContract {
  return {
    version: 1,
    taskName: 'implement',
    storyId: '13-1',
    driver: 'claude-code',
    model: 'opus-4',
    timestamp: '2026-04-03T12:00:00Z',
    cost_usd: 0.42,
    duration_ms: 12345,
    changedFiles: ['src/lib/agents/output-contract.ts'],
    testResults: { passed: 10, failed: 0, coverage: 95.5 },
    output: 'All tasks complete.',
    acceptanceCriteria: [
      { id: 'AC1', description: 'Module exports write/read', status: 'passed' },
    ],
    ...overrides,
  };
}

describe('output-contract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'output-contract-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AC #1, #2: writeOutputContract creates file at correct path
  it('writes contract to {taskName}-{storyId}.json', () => {
    const contract = makeContract();
    writeOutputContract(contract, tmpDir);

    const expectedFile = join(tmpDir, 'implement-13-1.json');
    expect(existsSync(expectedFile)).toBe(true);
  });

  // AC #2: atomic write — no .tmp file remains
  it('does not leave .tmp file after successful write', () => {
    const contract = makeContract();
    writeOutputContract(contract, tmpDir);

    const files = readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  // AC #3: readOutputContract returns deserialized contract with all fields
  it('round-trips all fields correctly', () => {
    const contract = makeContract();
    writeOutputContract(contract, tmpDir);

    const result = readOutputContract('implement', '13-1', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.taskName).toBe('implement');
    expect(result!.storyId).toBe('13-1');
    expect(result!.driver).toBe('claude-code');
    expect(result!.model).toBe('opus-4');
    expect(result!.timestamp).toBe('2026-04-03T12:00:00Z');
    expect(result!.cost_usd).toBe(0.42);
    expect(result!.duration_ms).toBe(12345);
    expect(result!.changedFiles).toEqual(['src/lib/agents/output-contract.ts']);
    expect(result!.testResults).toEqual({ passed: 10, failed: 0, coverage: 95.5 });
    expect(result!.output).toBe('All tasks complete.');
    expect(result!.acceptanceCriteria).toEqual([
      { id: 'AC1', description: 'Module exports write/read', status: 'passed' },
    ]);
  });

  // AC #4: readOutputContract returns null when file does not exist
  it('returns null when contract file does not exist', () => {
    const result = readOutputContract('nonexistent', 'story-99', tmpDir);
    expect(result).toBeNull();
  });

  // AC #5: null values preserved on round-trip
  it('preserves null values for cost_usd and testResults', () => {
    const contract = makeContract({ cost_usd: null, testResults: null });
    writeOutputContract(contract, tmpDir);

    const result = readOutputContract('implement', '13-1', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.cost_usd).toBeNull();
    expect(result!.testResults).toBeNull();
  });

  // AC #7: creates directory recursively
  it('creates target directory recursively when it does not exist', () => {
    const deepDir = join(tmpDir, 'a', 'b', 'c', 'contracts');
    const contract = makeContract();
    writeOutputContract(contract, deepDir);

    const result = readOutputContract('implement', '13-1', deepDir);
    expect(result).not.toBeNull();
    expect(result!.taskName).toBe('implement');
  });

  // AC #9: throws descriptive error on write failure
  it.skipIf(platform() === 'win32')(
    'throws descriptive error including file path on write failure',
    () => {
      // Create a read-only directory to trigger write failure
      const readOnlyDir = join(tmpDir, 'readonly');
      mkdirSync(readOnlyDir, { recursive: true });
      chmodSync(readOnlyDir, 0o444);

      const contract = makeContract();
      expect(() => writeOutputContract(contract, readOnlyDir)).toThrow(
        /Failed to write output contract/,
      );
      expect(() => writeOutputContract(contract, readOnlyDir)).toThrow(/implement-13-1\.json/);

      // Restore permissions for cleanup
      chmodSync(readOnlyDir, 0o755);
    },
  );

  // Input validation: rejects path traversal in taskName
  it('rejects taskName containing path separators', () => {
    const contract = makeContract({ taskName: '../../../etc/passwd' });
    expect(() => writeOutputContract(contract, tmpDir)).toThrow(/invalid path characters/);
  });

  // Input validation: rejects path traversal in storyId
  it('rejects storyId containing path separators', () => {
    const contract = makeContract({ storyId: '../secret' });
    expect(() => writeOutputContract(contract, tmpDir)).toThrow(/invalid path characters/);
  });

  // Input validation: rejects empty taskName
  it('rejects empty taskName', () => {
    const contract = makeContract({ taskName: '' });
    expect(() => writeOutputContract(contract, tmpDir)).toThrow(/non-empty string/);
  });

  // Input validation: rejects empty storyId
  it('rejects empty storyId', () => {
    const contract = makeContract({ storyId: '  ' });
    expect(() => writeOutputContract(contract, tmpDir)).toThrow(/non-empty string/);
  });

  // Read validation: rejects empty taskName
  it('readOutputContract rejects empty taskName', () => {
    expect(() => readOutputContract('', '13-1', tmpDir)).toThrow(/non-empty string/);
  });

  // Error handling: corrupted JSON on read
  it('throws descriptive error when contract file contains invalid JSON', () => {
    const filePath = join(tmpDir, 'implement-13-1.json');
    writeFileSync(filePath, '{not valid json!!!', 'utf-8');

    expect(() => readOutputContract('implement', '13-1', tmpDir)).toThrow(
      /Failed to read output contract/,
    );
  });

  // AC #8: performance — 1MB round-trip within 1 second
  it('round-trips a ~1MB contract within 1 second', () => {
    const largeOutput = 'x'.repeat(1_000_000);
    const contract = makeContract({ output: largeOutput });

    const start = performance.now();
    writeOutputContract(contract, tmpDir);
    const result = readOutputContract('implement', '13-1', tmpDir);
    const elapsed = performance.now() - start;

    expect(result).not.toBeNull();
    expect(result!.output).toHaveLength(1_000_000);
    expect(elapsed).toBeLessThan(1000);
  });

  // AC #6: JSON Schema validates a correct contract
  describe('JSON Schema validation', () => {
    // We use Ajv for schema validation in tests
    it('validates a correct contract against the schema', async () => {
      const Ajv = (await import('ajv')).default;
      const { readFileSync } = await import('node:fs');
      const schemaPath = join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'schemas',
        'output-contract.schema.json',
      );
      const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
      const ajv = new Ajv();
      const validate = ajv.compile(schema);

      const contract = makeContract();
      const valid = validate(contract);
      expect(valid).toBe(true);
    });

    it('rejects a contract missing required fields', async () => {
      const Ajv = (await import('ajv')).default;
      const { readFileSync } = await import('node:fs');
      const schemaPath = join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'schemas',
        'output-contract.schema.json',
      );
      const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
      const ajv = new Ajv();
      const validate = ajv.compile(schema);

      const incomplete = { version: 1, taskName: 'test' };
      const valid = validate(incomplete);
      expect(valid).toBe(false);
      expect(validate.errors).not.toBeNull();
      expect(validate.errors!.length).toBeGreaterThan(0);
    });
  });

  // AC #1: barrel exports
  it('is exported from barrel index', async () => {
    const barrel = await import('../index.js');
    expect(typeof barrel.writeOutputContract).toBe('function');
    expect(typeof barrel.readOutputContract).toBe('function');
  });
});
