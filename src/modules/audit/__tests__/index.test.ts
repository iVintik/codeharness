import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dimension checkers
vi.mock('../dimensions.js', () => ({
  checkObservability: vi.fn(),
  checkTesting: vi.fn(),
  checkDocumentation: vi.fn(),
  checkVerification: vi.fn(),
  checkInfrastructure: vi.fn(),
}));

import {
  checkObservability,
  checkTesting,
  checkDocumentation,
  checkVerification,
  checkInfrastructure,
} from '../dimensions.js';
import { runAudit } from '../index.js';
import type { DimensionResult } from '../types.js';

const mockCheckObservability = vi.mocked(checkObservability);
const mockCheckTesting = vi.mocked(checkTesting);
const mockCheckDocumentation = vi.mocked(checkDocumentation);
const mockCheckVerification = vi.mocked(checkVerification);
const mockCheckInfrastructure = vi.mocked(checkInfrastructure);

function makeDimResult(name: string, status: 'pass' | 'fail' | 'warn', gapCount = 0): DimensionResult {
  const gaps = Array.from({ length: gapCount }, (_, i) => ({
    dimension: name,
    description: `Gap ${i + 1}`,
    suggestedFix: `Fix ${i + 1}`,
  }));
  return { name, status, metric: `${status} metric`, gaps };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runAudit', () => {
  it('calls all 5 dimension checkers', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'pass') });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'pass') });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    expect(mockCheckObservability).toHaveBeenCalledWith('/project');
    expect(mockCheckTesting).toHaveBeenCalledWith('/project');
    expect(mockCheckDocumentation).toHaveBeenCalledWith('/project');
    expect(mockCheckVerification).toHaveBeenCalledWith('/project');
    expect(mockCheckInfrastructure).toHaveBeenCalledWith('/project');
  });

  it('overallStatus = fail when any dimension fails', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'pass') });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'fail', 1) });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overallStatus).toBe('fail');
    }
  });

  it('overallStatus = warn when any dimension warns and none fail', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'warn', 1) });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'pass') });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overallStatus).toBe('warn');
    }
  });

  it('overallStatus = pass when all pass', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'pass') });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'pass') });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overallStatus).toBe('pass');
    }
  });

  it('aggregates gap count from all dimensions', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'warn', 2) });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'fail', 3) });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass', 0) });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'warn', 1) });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass', 0) });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gapCount).toBe(6);
    }
  });

  it('durationMs is populated', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'pass') });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'pass') });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.durationMs).toBe('number');
      expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles dimension checker returning failure result gracefully', async () => {
    mockCheckObservability.mockResolvedValue({ success: false, error: 'unexpected' });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'pass') });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      // Failed dimension is excluded from results
      expect(Object.keys(result.data.dimensions)).toHaveLength(4);
      expect(result.data.dimensions).not.toHaveProperty('observability');
    }
  });

  it('includes all 5 dimensions in results', async () => {
    mockCheckObservability.mockResolvedValue({ success: true, data: makeDimResult('observability', 'pass') });
    mockCheckTesting.mockReturnValue({ success: true, data: makeDimResult('testing', 'pass') });
    mockCheckDocumentation.mockReturnValue({ success: true, data: makeDimResult('documentation', 'pass') });
    mockCheckVerification.mockReturnValue({ success: true, data: makeDimResult('verification', 'pass') });
    mockCheckInfrastructure.mockReturnValue({ success: true, data: makeDimResult('infrastructure', 'pass') });

    const result = await runAudit('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.dimensions)).toHaveLength(5);
      expect(result.data.dimensions).toHaveProperty('observability');
      expect(result.data.dimensions).toHaveProperty('testing');
      expect(result.data.dimensions).toHaveProperty('documentation');
      expect(result.data.dimensions).toHaveProperty('verification');
      expect(result.data.dimensions).toHaveProperty('infrastructure');
    }
  });
});
