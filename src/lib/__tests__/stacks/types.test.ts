import { describe, it, expect } from 'vitest';
import type {
  StackProvider,
  StackName,
  AppType,
  CoverageToolName,
  CoverageToolInfo,
  OtlpResult,
  TestCounts,
} from '../../stacks/types.js';

describe('stacks/types — interface shape validation', () => {
  it('StackName accepts valid values', () => {
    const names: StackName[] = ['nodejs', 'python', 'rust'];
    expect(names).toHaveLength(3);
  });

  it('AppType accepts valid values', () => {
    const types: AppType[] = ['server', 'cli', 'web', 'agent', 'generic'];
    expect(types).toHaveLength(5);
  });

  it('CoverageToolName accepts valid values', () => {
    const tools: CoverageToolName[] = ['c8', 'nyc', 'istanbul', 'coverage-py', 'tarpaulin', 'llvm-cov', 'none'];
    expect(tools).toHaveLength(7);
  });

  it('CoverageToolInfo has expected shape', () => {
    const info: CoverageToolInfo = { tool: 'c8', configFile: '.c8rc.json' };
    expect(info.tool).toBe('c8');
    expect(info.configFile).toBe('.c8rc.json');
  });

  it('CoverageToolInfo configFile is optional', () => {
    const info: CoverageToolInfo = { tool: 'none' };
    expect(info.configFile).toBeUndefined();
  });

  it('OtlpResult has expected shape', () => {
    const result: OtlpResult = { success: true, packagesInstalled: ['@opentelemetry/sdk-node'] };
    expect(result.success).toBe(true);
    expect(result.packagesInstalled).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it('TestCounts has expected shape', () => {
    const counts: TestCounts = { passed: 10, failed: 2, skipped: 1, total: 13 };
    expect(counts.total).toBe(13);
  });

  it('StackProvider interface requires all expected properties and methods', () => {
    // This is a compile-time check. If StackProvider changes shape, this test will fail to compile.
    // We create a mock that satisfies the interface to prove the shape is correct.
    const mock: StackProvider = {
      name: 'nodejs',
      markers: ['package.json'],
      displayName: 'Node.js',
      detectAppType: () => 'generic',
      getCoverageTool: () => 'none',
      detectCoverageConfig: () => ({ tool: 'none' }),
      getOtlpPackages: () => [],
      installOtlp: () => ({ success: true, packagesInstalled: [] }),
      getDockerfileTemplate: () => '',
      getDockerBuildStage: () => '',
      getRuntimeCopyDirectives: () => '',
      getBuildCommands: () => [],
      getTestCommands: () => [],
      getSemgrepLanguages: () => [],
      parseTestOutput: () => ({ passed: 0, failed: 0, skipped: 0, total: 0 }),
      parseCoverageReport: () => 0,
      getProjectName: () => null,
    };

    expect(mock.name).toBe('nodejs');
    expect(mock.markers).toEqual(['package.json']);
    expect(typeof mock.detectAppType).toBe('function');
    expect(typeof mock.getCoverageTool).toBe('function');
    expect(typeof mock.detectCoverageConfig).toBe('function');
    expect(typeof mock.getOtlpPackages).toBe('function');
    expect(typeof mock.installOtlp).toBe('function');
    expect(typeof mock.getDockerfileTemplate).toBe('function');
    expect(typeof mock.getDockerBuildStage).toBe('function');
    expect(typeof mock.getRuntimeCopyDirectives).toBe('function');
    expect(typeof mock.getBuildCommands).toBe('function');
    expect(typeof mock.getTestCommands).toBe('function');
    expect(typeof mock.getSemgrepLanguages).toBe('function');
    expect(typeof mock.parseTestOutput).toBe('function');
    expect(typeof mock.parseCoverageReport).toBe('function');
    expect(typeof mock.getProjectName).toBe('function');
  });

  it('StackProvider patchStartScript is optional', () => {
    const mock: StackProvider = {
      name: 'nodejs',
      markers: ['package.json'],
      displayName: 'Node.js',
      detectAppType: () => 'generic',
      getCoverageTool: () => 'none',
      detectCoverageConfig: () => ({ tool: 'none' }),
      getOtlpPackages: () => [],
      installOtlp: () => ({ success: true, packagesInstalled: [] }),
      getDockerfileTemplate: () => '',
      getDockerBuildStage: () => '',
      getRuntimeCopyDirectives: () => '',
      getBuildCommands: () => [],
      getTestCommands: () => [],
      getSemgrepLanguages: () => [],
      parseTestOutput: () => ({ passed: 0, failed: 0, skipped: 0, total: 0 }),
      parseCoverageReport: () => 0,
      getProjectName: () => null,
    };
    // patchStartScript not provided — should be undefined
    expect(mock.patchStartScript).toBeUndefined();
  });
});
