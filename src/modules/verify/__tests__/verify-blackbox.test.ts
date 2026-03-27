import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock output
vi.mock('../../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

import {
  classifyEvidenceCommands,
  checkBlackBoxEnforcement,
  validateProofQuality,
} from '../proof.js';
import type { ClassifiedCommand } from '../types.js';

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-bb-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── classifyEvidenceCommands ────────────────────────────────────────────────

describe('classifyEvidenceCommands', () => {
  it('classifies docker exec commands', () => {
    const content = [
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('docker-exec');
    expect(result[0].command).toContain('docker exec');
  });

  it('classifies observability curl commands', () => {
    const content = [
      '```bash',
      "curl 'http://localhost:9428/select/logsql/query?query=_stream_id:*&limit=10'",
      '```',
      '',
      '```bash',
      "curl 'http://localhost:8428/api/v1/query?query=up'",
      '```',
      '',
      '```bash',
      "curl 'http://localhost:16686/api/traces?service=codeharness-verify'",
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('observability');
    expect(result[1].type).toBe('observability');
    expect(result[2].type).toBe('observability');
  });

  it('classifies grep against src/ commands', () => {
    const content = [
      '```bash',
      "grep -n 'pattern' src/lib/foo.ts",
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('grep-src');
  });

  it('classifies other commands', () => {
    const content = [
      '```bash',
      'cat README.md',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('other');
  });

  it('classifies docker host commands (ps, logs, inspect)', () => {
    const content = [
      '```bash',
      'docker ps --filter name=codeharness-verify',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('docker-host');
  });

  it('handles shell code blocks too', () => {
    const content = [
      '```shell',
      'docker exec codeharness-verify ls /workspace',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('docker-exec');
  });

  it('handles multiple commands in one code block', () => {
    const content = [
      '```bash',
      'docker exec codeharness-verify codeharness init',
      'docker exec codeharness-verify codeharness verify --story test',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('docker-exec');
    expect(result[1].type).toBe('docker-exec');
  });

  it('returns empty array when no code blocks', () => {
    const content = 'Just some text with no code blocks.';
    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(0);
  });

  it('ignores output blocks', () => {
    const content = [
      '```output',
      'this is output not a command',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(0);
  });

  it('classifies grep not against src/ as other', () => {
    const content = [
      '```bash',
      "grep -n 'pattern' README.md",
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('other');
  });

  it('classifies curl to non-observability ports as other', () => {
    const content = [
      '```bash',
      'curl http://localhost:3000/api/health',
      '```',
    ].join('\n');

    const result = classifyEvidenceCommands(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('other');
  });
});

// ─── checkBlackBoxEnforcement ────────────────────────────────────────────────

describe('checkBlackBoxEnforcement', () => {
  it('passes when all ACs have docker exec and no grep src/', () => {
    const content = [
      '## AC 1: Version check',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
      '',
      '## AC 2: Init check',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness init --json',
      '```',
      '',
      '```output',
      '{"ok":true}',
      '```',
    ].join('\n');

    const result = checkBlackBoxEnforcement(content);
    expect(result.blackBoxPass).toBe(true);
    expect(result.dockerExecCount).toBe(2);
    expect(result.grepSrcCount).toBe(0);
    expect(result.acsMissingDockerExec).toEqual([]);
  });

  it('fails when >50% of commands are grep against src/', () => {
    const content = [
      '## AC 1: Check impl',
      '',
      '```bash',
      "grep -n 'function' src/lib/verify.ts",
      '```',
      '',
      '```bash',
      "grep -n 'export' src/lib/output.ts",
      '```',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
    ].join('\n');

    const result = checkBlackBoxEnforcement(content);
    expect(result.blackBoxPass).toBe(false);
    expect(result.grepRatio).toBeGreaterThan(0.5);
    expect(result.grepSrcCount).toBe(2);
  });

  it('fails when an AC section has no docker exec commands', () => {
    const content = [
      '## AC 1: Version check',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
      '',
      '## AC 2: Logs check',
      '',
      '```bash',
      'cat README.md',
      '```',
      '',
      '```output',
      '# Codeharness',
      '```',
    ].join('\n');

    const result = checkBlackBoxEnforcement(content);
    expect(result.blackBoxPass).toBe(false);
    expect(result.acsMissingDockerExec).toContain(2);
  });

  it('skips escalated ACs in per-AC docker exec check', () => {
    const content = [
      '## AC 1: Version check',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
      '',
      '## AC 2: Integration test',
      '',
      '[ESCALATE] Requires real network service',
    ].join('\n');

    const result = checkBlackBoxEnforcement(content);
    expect(result.blackBoxPass).toBe(true);
    expect(result.acsMissingDockerExec).toEqual([]);
  });

  it('counts observability commands correctly', () => {
    const content = [
      '## AC 1: Check traces',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness init',
      '```',
      '',
      '```bash',
      "curl 'http://localhost:16686/api/traces?service=codeharness-verify'",
      '```',
      '',
      '```output',
      '{"traces":[]}',
      '```',
    ].join('\n');

    const result = checkBlackBoxEnforcement(content);
    expect(result.dockerExecCount).toBe(1);
    expect(result.observabilityCount).toBe(1);
  });

  it('returns blackBoxPass=true when no AC headers are present (no per-AC check)', () => {
    const content = [
      '# Proof',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
    ].join('\n');

    const result = checkBlackBoxEnforcement(content);
    expect(result.blackBoxPass).toBe(true);
  });
});

// ─── validateProofQuality with black-box fields ──────────────────────────────

describe('validateProofQuality — black-box enforcement', () => {
  it('returns ProofQuality with black-box fields', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Version check',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result).toHaveProperty('grepSrcCount');
    expect(result).toHaveProperty('dockerExecCount');
    expect(result).toHaveProperty('observabilityCount');
    expect(result).toHaveProperty('otherCount');
    expect(result).toHaveProperty('blackBoxPass');
    expect(result.dockerExecCount).toBe(1);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('rejects proofs where >50% of commands are grep against src/', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Check impl',
      '',
      '```bash',
      "grep -rn 'function' src/lib/verify.ts",
      '```',
      '',
      '```output',
      '42: function validateProofQuality() {',
      '```',
      '',
      '```bash',
      "grep -rn 'export' src/lib/output.ts",
      '```',
      '',
      '```output',
      '1: export function ok() {}',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.grepSrcCount).toBe(2);
    expect(result.blackBoxPass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('rejects proofs with zero docker exec per AC', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Check something',
      '',
      '```bash',
      'cat README.md',
      '```',
      '',
      '```output',
      '# Codeharness',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.dockerExecCount).toBe(0);
    expect(result.blackBoxPass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('passes proofs with adequate docker exec and observability evidence', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: CLI works',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
      '',
      '## AC 2: Traces emitted',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness init',
      '```',
      '',
      '```output',
      '[OK] Initialized',
      '```',
      '',
      '```bash',
      "curl 'http://localhost:16686/api/traces?service=codeharness-verify'",
      '```',
      '',
      '```output',
      '{"data":[{"traceID":"abc123"}]}',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.verified).toBe(2);
    expect(result.dockerExecCount).toBe(2);
    expect(result.observabilityCount).toBe(1);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('returns blackBoxPass=false in empty result for nonexistent file', () => {
    const result = validateProofQuality('/nonexistent/proof.md');
    expect(result.blackBoxPass).toBe(false);
    expect(result.grepSrcCount).toBe(0);
    expect(result.dockerExecCount).toBe(0);
  });

  it('allows exactly 50% grep src/ ratio (only >50% is rejected)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Mixed evidence',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
      '',
      '```bash',
      "grep -n 'something' src/lib/foo.ts",
      '```',
      '',
      '```output',
      '10: something',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.grepSrcCount).toBe(1);
    expect(result.dockerExecCount).toBe(1);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });
});

// ─── validateProofQuality — tier-based Docker enforcement ─────────────────────

describe('validateProofQuality — tier-based Docker enforcement', () => {
  it('AC1: test-provable tier skips Docker enforcement (blackBoxPass=true)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** test-provable',
      '',
      '## AC 1: Unit tests pass',
      '',
      '```bash',
      'npx vitest run --reporter=verbose',
      '```',
      '',
      '```output',
      'Tests: 12 passed',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('AC2: runtime-provable tier skips Docker enforcement (blackBoxPass=true)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** runtime-provable',
      '',
      '## AC 1: Server starts correctly',
      '',
      '```bash',
      'node dist/server.js &',
      '```',
      '',
      '```output',
      'Listening on port 3000',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('AC3: environment-provable tier runs Docker enforcement normally', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** environment-provable',
      '',
      '## AC 1: Container check',
      '',
      '```bash',
      'cat README.md',
      '```',
      '',
      '```output',
      '# Codeharness',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    // Docker enforcement runs — AC1 has no docker exec, so it fails
    expect(result.blackBoxPass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('AC3: environment-provable passes when docker exec evidence is present', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** environment-provable',
      '',
      '## AC 1: Container check',
      '',
      '```bash',
      'docker exec codeharness-verify codeharness --version',
      '```',
      '',
      '```output',
      '0.13.2',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('AC4: escalate tier skips Docker enforcement (blackBoxPass=true)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** escalate',
      '',
      '## AC 1: Manual verification needed',
      '',
      '```bash',
      'echo "Human judgment required"',
      '```',
      '',
      '```output',
      'Human judgment required',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('AC5: legacy unit-testable tier still skips Docker enforcement (backward compat)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** unit-testable',
      '',
      '## AC 1: Tests pass',
      '',
      '```bash',
      'npx vitest run',
      '```',
      '',
      '```output',
      'Tests: 5 passed',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('AC6: legacy black-box tier runs Docker enforcement (backward compat)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** black-box',
      '',
      '## AC 1: Container check',
      '',
      '```bash',
      'cat README.md',
      '```',
      '',
      '```output',
      '# Codeharness',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    // Docker enforcement runs — AC1 has no docker exec, so it fails
    expect(result.blackBoxPass).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('tier matching is case-insensitive', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** Test-Provable',
      '',
      '## AC 1: Tests pass',
      '',
      '```bash',
      'npx vitest run',
      '```',
      '',
      '```output',
      'Tests: 5 passed',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('no tier header defaults to running Docker enforcement', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '## AC 1: Container check',
      '',
      '```bash',
      'cat README.md',
      '```',
      '',
      '```output',
      '# Codeharness',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    // No tier → skipDockerEnforcement is false → enforcement runs → fails (no docker exec)
    expect(result.blackBoxPass).toBe(false);
  });

  it('unrecognized tier value defaults to running Docker enforcement', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** unknown-tier-value',
      '',
      '## AC 1: Container check',
      '',
      '```bash',
      'cat README.md',
      '```',
      '',
      '```output',
      '# Codeharness',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    // Unknown tier → regex won't match → enforcement runs → fails (no docker exec)
    expect(result.blackBoxPass).toBe(false);
  });

  it('skipped tiers still report command metrics (not zeroed)', () => {
    const path = join(testDir, 'proof.md');
    writeFileSync(path, [
      '**Tier:** test-provable',
      '',
      '## AC 1: Tests pass',
      '',
      '```bash',
      'npx vitest run',
      '```',
      '',
      '```output',
      'Tests: 5 passed',
      '```',
    ].join('\n'));

    const result = validateProofQuality(path);
    expect(result.blackBoxPass).toBe(true);
    // Metrics should still be computed even when Docker enforcement is skipped
    expect(result.otherCount).toBe(1); // npx vitest is classified as 'other'
  });
});
