import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all I/O: filesystem, subprocess, HTTP
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../observability/index.js', () => ({
  analyze: vi.fn(),
  validateRuntime: vi.fn(),
}));

vi.mock('../../../lib/coverage/index.js', () => ({
  checkOnlyCoverage: vi.fn(),
}));

vi.mock('../../../lib/doc-health/index.js', () => ({
  scanDocHealth: vi.fn(),
}));

vi.mock('../../verify/index.js', () => ({
  parseProof: vi.fn(),
}));

vi.mock('../../infra/index.js', () => ({
  validateDockerfile: vi.fn(),
}));

import { existsSync, readdirSync } from 'node:fs';
import { analyze, validateRuntime } from '../../observability/index.js';
import { checkOnlyCoverage } from '../../../lib/coverage/index.js';
import { scanDocHealth } from '../../../lib/doc-health/index.js';
import { parseProof } from '../../verify/index.js';
import { validateDockerfile } from '../../infra/index.js';
import {
  checkObservability,
  checkTesting,
  checkDocumentation,
  checkVerification,
  checkInfrastructure,
} from '../dimensions.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockAnalyze = vi.mocked(analyze);
const mockValidateRuntime = vi.mocked(validateRuntime);
const mockCheckOnlyCoverage = vi.mocked(checkOnlyCoverage);
const mockScanDocHealth = vi.mocked(scanDocHealth);
const mockParseProof = vi.mocked(parseProof);
const mockValidateDockerfile = vi.mocked(validateDockerfile);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── checkObservability ─────────────────────────────────────────────────────

describe('checkObservability', () => {
  it('returns pass when static and runtime both pass', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [],
        summary: { totalFunctions: 10, functionsWithLogs: 10, errorHandlersWithoutLogs: 0, coveragePercent: 100, levelDistribution: {} },
      },
    });
    mockValidateRuntime.mockResolvedValue({
      success: true,
      data: {
        entries: [],
        totalModules: 5,
        modulesWithTelemetry: 5,
        coveragePercent: 100,
        skipped: false,
      },
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('observability');
      expect(result.data.status).toBe('pass');
      expect(result.data.gaps).toHaveLength(0);
    }
  });

  it('returns warn when Semgrep not installed (skipped)', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [],
        summary: { totalFunctions: 0, functionsWithLogs: 0, errorHandlersWithoutLogs: 0, coveragePercent: 0, levelDistribution: {} },
        skipped: true,
        skipReason: 'Semgrep not installed',
      },
    });
    mockValidateRuntime.mockResolvedValue({
      success: true,
      data: {
        entries: [],
        totalModules: 5,
        modulesWithTelemetry: 5,
        coveragePercent: 100,
        skipped: false,
      },
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.length).toBeGreaterThan(0);
      expect(result.data.gaps[0].description).toContain('Semgrep not installed');
    }
  });

  it('returns warn when backend unreachable (runtime skipped)', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [],
        summary: { totalFunctions: 10, functionsWithLogs: 10, errorHandlersWithoutLogs: 0, coveragePercent: 100, levelDistribution: {} },
      },
    });
    mockValidateRuntime.mockResolvedValue({
      success: true,
      data: {
        entries: [],
        totalModules: 5,
        modulesWithTelemetry: 0,
        coveragePercent: 0,
        skipped: true,
        skipReason: 'Backend unreachable',
      },
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.some(g => g.description.includes('Backend unreachable'))).toBe(true);
    }
  });

  it('returns warn when analyze fails', async () => {
    mockAnalyze.mockReturnValue({
      success: false,
      error: 'Semgrep binary not found',
    });
    mockValidateRuntime.mockResolvedValue({
      success: true,
      data: {
        entries: [],
        totalModules: 5,
        modulesWithTelemetry: 5,
        coveragePercent: 100,
        skipped: false,
      },
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.some(g => g.description.includes('Semgrep binary not found'))).toBe(true);
    }
  });

  it('returns warn when validateRuntime rejects', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [],
        summary: { totalFunctions: 10, functionsWithLogs: 10, errorHandlersWithoutLogs: 0, coveragePercent: 100, levelDistribution: {} },
      },
    });
    mockValidateRuntime.mockRejectedValue(new Error('Connection refused'));

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
    }
  });

  it('returns warn when runtime coverage is below 50%', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [],
        summary: { totalFunctions: 10, functionsWithLogs: 10, errorHandlersWithoutLogs: 0, coveragePercent: 100, levelDistribution: {} },
      },
    });
    mockValidateRuntime.mockResolvedValue({
      success: true,
      data: {
        entries: [],
        totalModules: 10,
        modulesWithTelemetry: 3,
        coveragePercent: 30,
        skipped: false,
      },
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.some(g => g.description.includes('Runtime coverage low: 30%'))).toBe(true);
    }
  });

  it('returns warn when validateRuntime returns failure result', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [],
        summary: { totalFunctions: 10, functionsWithLogs: 10, errorHandlersWithoutLogs: 0, coveragePercent: 100, levelDistribution: {} },
      },
    });
    mockValidateRuntime.mockResolvedValue({
      success: false,
      error: 'Backend query failed',
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.some(g => g.description.includes('Runtime validation failed: Backend query failed'))).toBe(true);
    }
  });

  it('returns warn when outer try/catch catches unexpected error', async () => {
    // Force the outer catch by making analyze throw synchronously
    mockAnalyze.mockImplementation(() => {
      throw new Error('Catastrophic failure');
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps[0].description).toContain('Catastrophic failure');
    }
  });

  it('returns warn with gaps when static analysis finds gaps', async () => {
    mockAnalyze.mockReturnValue({
      success: true,
      data: {
        tool: 'semgrep',
        gaps: [
          { file: 'src/app.ts', line: 10, description: 'Missing structured logging', type: 'obs-001', severity: 'warning' as const },
        ],
        summary: { totalFunctions: 10, functionsWithLogs: 9, errorHandlersWithoutLogs: 1, coveragePercent: 90, levelDistribution: {} },
      },
    });
    mockValidateRuntime.mockResolvedValue({
      success: true,
      data: {
        entries: [],
        totalModules: 5,
        modulesWithTelemetry: 5,
        coveragePercent: 100,
        skipped: false,
      },
    });

    const result = await checkObservability('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.length).toBeGreaterThan(0);
      expect(result.data.metric).toContain('1 gap');
    }
  });
});

// ─── checkTesting ───────────────────────────────────────────────────────────

describe('checkTesting', () => {
  it('returns pass with high coverage', () => {
    mockCheckOnlyCoverage.mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 50,
      failCount: 0,
      coveragePercent: 95,
      rawOutput: 'Check-only mode',
    });

    const result = checkTesting('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pass');
      expect(result.data.metric).toBe('95%');
      expect(result.data.gaps).toHaveLength(0);
    }
  });

  it('returns fail with critically low coverage', () => {
    mockCheckOnlyCoverage.mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 5,
      failCount: 0,
      coveragePercent: 30,
      rawOutput: '',
    });

    const result = checkTesting('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.metric).toBe('30%');
      expect(result.data.gaps.length).toBeGreaterThan(0);
    }
  });

  it('returns warn with medium coverage', () => {
    mockCheckOnlyCoverage.mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 20,
      failCount: 0,
      coveragePercent: 65,
      rawOutput: '',
    });

    const result = checkTesting('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.metric).toBe('65%');
    }
  });

  it('returns warn when no coverage tool detected', () => {
    mockCheckOnlyCoverage.mockReturnValue({
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: 'No coverage tool detected',
    });

    const result = checkTesting('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.metric).toBe('no coverage data');
    }
  });

  it('returns warn when checkOnlyCoverage throws', () => {
    mockCheckOnlyCoverage.mockImplementation(() => {
      throw new Error('state file missing');
    });

    const result = checkTesting('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps[0].description).toContain('state file missing');
    }
  });
});

// ─── checkDocumentation ─────────────────────────────────────────────────────

describe('checkDocumentation', () => {
  it('returns pass when all docs fresh', () => {
    mockScanDocHealth.mockReturnValue({
      documents: [
        { path: 'AGENTS.md', grade: 'fresh', lastModified: new Date(), codeLastModified: new Date(), reason: 'Up to date' },
      ],
      summary: { fresh: 1, stale: 0, missing: 0, total: 1 },
      passed: true,
      scanDurationMs: 50,
    });

    const result = checkDocumentation('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pass');
      expect(result.data.metric).toBe('1 fresh, 0 stale, 0 missing');
    }
  });

  it('returns fail when docs missing', () => {
    mockScanDocHealth.mockReturnValue({
      documents: [
        { path: 'AGENTS.md', grade: 'missing', lastModified: null, codeLastModified: null, reason: 'Root AGENTS.md not found' },
      ],
      summary: { fresh: 0, stale: 0, missing: 1, total: 1 },
      passed: false,
      scanDurationMs: 50,
    });

    const result = checkDocumentation('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.gaps.length).toBeGreaterThan(0);
    }
  });

  it('returns warn when docs stale', () => {
    mockScanDocHealth.mockReturnValue({
      documents: [
        { path: 'AGENTS.md', grade: 'stale', lastModified: new Date(), codeLastModified: new Date(), reason: 'Stale' },
      ],
      summary: { fresh: 0, stale: 1, missing: 0, total: 1 },
      passed: false,
      scanDurationMs: 50,
    });

    const result = checkDocumentation('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
    }
  });

  it('returns warn when scanDocHealth throws', () => {
    mockScanDocHealth.mockImplementation(() => {
      throw new Error('scan error');
    });

    const result = checkDocumentation('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
    }
  });
});

// ─── checkVerification ──────────────────────────────────────────────────────

describe('checkVerification', () => {
  it('returns warn when no sprint-status.yaml', () => {
    mockExistsSync.mockReturnValue(false);

    const result = checkVerification('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.metric).toBe('no sprint data');
    }
  });

  it('returns pass with all proofs passing', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-status.yaml')) return true;
      if (path.includes('verification')) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(['1-1-story-proof.md'] as unknown as ReturnType<typeof readdirSync>);
    mockParseProof.mockReturnValue({
      success: true,
      data: { verified: 3, pending: 0, escalated: 0, total: 3, passed: true, grepSrcCount: 0, dockerExecCount: 0, observabilityCount: 0, otherCount: 0, blackBoxPass: true },
    });

    const result = checkVerification('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pass');
      expect(result.data.metric).toBe('1/1 verified');
    }
  });

  it('returns warn when proofs fail', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-status.yaml')) return true;
      if (path.includes('verification')) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(['1-1-story-proof.md'] as unknown as ReturnType<typeof readdirSync>);
    mockParseProof.mockReturnValue({
      success: true,
      data: { verified: 1, pending: 2, escalated: 0, total: 3, passed: false, grepSrcCount: 0, dockerExecCount: 0, observabilityCount: 0, otherCount: 0, blackBoxPass: false },
    });

    const result = checkVerification('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.metric).toBe('0/1 verified');
      expect(result.data.gaps.length).toBeGreaterThan(0);
    }
  });

  it('handles readdirSync throwing in verification directory', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-status.yaml')) return true;
      if (path.includes('verification')) return true;
      return false;
    });
    mockReaddirSync.mockImplementation(() => {
      throw new Error('Directory read error');
    });

    const result = checkVerification('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      // readdirSafe returns [] on error, so totalChecked = 0
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.some(g => g.description.includes('No verification proofs'))).toBe(true);
    }
  });

  it('returns warn when checkVerification outer catch fires', () => {
    mockExistsSync.mockImplementation(() => {
      throw new Error('Filesystem error');
    });

    const result = checkVerification('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps[0].description).toContain('Filesystem error');
    }
  });

  it('returns warn when no proofs found', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('sprint-status.yaml')) return true;
      return false;
    });

    const result = checkVerification('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps.some(g => g.description.includes('No verification proofs'))).toBe(true);
    }
  });
});

// ─── checkInfrastructure ────────────────────────────────────────────────────

describe('checkInfrastructure', () => {
  it('returns fail when no Dockerfile', () => {
    mockValidateDockerfile.mockReturnValue({
      success: false,
      error: 'No Dockerfile found',
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.metric).toBe('no Dockerfile');
      expect(result.data.gaps[0].description).toBe('No Dockerfile found');
    }
  });

  it('returns pass when validateDockerfile reports no gaps', () => {
    mockValidateDockerfile.mockReturnValue({
      success: true,
      data: { passed: true, gaps: [], warnings: [] },
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pass');
      expect(result.data.metric).toBe('Dockerfile valid');
      expect(result.data.gaps).toHaveLength(0);
    }
  });

  it('propagates warnings from validateDockerfile as gaps', () => {
    mockValidateDockerfile.mockReturnValue({
      success: true,
      data: { passed: true, gaps: [], warnings: ['dockerfile-rules.md not found -- using defaults.'] },
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps).toHaveLength(1);
      expect(result.data.gaps[0].description).toBe('dockerfile-rules.md not found -- using defaults.');
    }
  });

  it('returns warn when validateDockerfile reports gaps from all 6 categories', () => {
    mockValidateDockerfile.mockReturnValue({
      success: true,
      data: {
        passed: false,
        gaps: [
          { rule: 'pinned-from', description: 'unpinned base image -- use specific version.', suggestedFix: 'Pin node:latest' },
          { rule: 'binary-on-path', description: 'project binary not installed.', suggestedFix: 'Add npm install -g' },
          { rule: 'verification-tools', description: 'verification tool missing: curl', suggestedFix: 'Install curl' },
          { rule: 'verification-tools', description: 'verification tool missing: jq', suggestedFix: 'Install jq' },
          { rule: 'no-source-copy', description: 'source code copied into container -- use build artifact instead.', suggestedFix: 'Use COPY dist/' },
          { rule: 'non-root-user', description: 'no non-root USER instruction found.', suggestedFix: 'Add USER node' },
          { rule: 'cache-cleanup', description: 'no cache cleanup detected.', suggestedFix: 'Add rm -rf /var/lib/apt/lists/*' },
        ],
        warnings: [],
      },
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps).toHaveLength(7);
      // All gaps should have dimension 'infrastructure'
      expect(result.data.gaps.every(g => g.dimension === 'infrastructure')).toBe(true);
    }
  });

  it('returns fail when Dockerfile has no FROM', () => {
    mockValidateDockerfile.mockReturnValue({
      success: false,
      error: 'Dockerfile has no FROM instruction',
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.metric).toBe('invalid Dockerfile');
    }
  });

  it('returns warn when Dockerfile is unreadable', () => {
    mockValidateDockerfile.mockReturnValue({
      success: false,
      error: 'Dockerfile exists but could not be read',
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.metric).toBe('Dockerfile unreadable');
      expect(result.data.gaps[0].description).toContain('could not be read');
    }
  });

  it('returns warn when checkInfrastructure outer catch fires', () => {
    mockValidateDockerfile.mockImplementation(() => {
      throw new Error('Disk error');
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('warn');
      expect(result.data.gaps[0].description).toContain('Disk error');
    }
  });

  it('returns pass with digest-pinned image and no gaps', () => {
    mockValidateDockerfile.mockReturnValue({
      success: true,
      data: { passed: true, gaps: [], warnings: [] },
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pass');
    }
  });

  it('returns fail when validateDockerfile returns failure Result', () => {
    mockValidateDockerfile.mockReturnValue({
      success: false,
      error: 'Dockerfile validation error',
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.metric).toBe('validation failed');
    }
  });

  it('backward compatibility: no Dockerfile still returns fail', () => {
    mockValidateDockerfile.mockReturnValue({
      success: false,
      error: 'No Dockerfile found',
    });

    const result = checkInfrastructure('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.gaps[0].description).toBe('No Dockerfile found');
    }
  });
});
