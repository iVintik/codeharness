import { describe, it, expect } from 'vitest';
import { NodejsProvider } from '../../stacks/nodejs.js';

describe('NodejsProvider — stub validation', () => {
  const provider = new NodejsProvider();

  it('has correct name', () => {
    expect(provider.name).toBe('nodejs');
  });

  it('has correct markers', () => {
    expect(provider.markers).toEqual(['package.json']);
  });

  it('has correct displayName', () => {
    expect(provider.displayName).toBe('Node.js (package.json)');
  });

  it('detectAppType throws not-yet-implemented', () => {
    expect(() => provider.detectAppType('/tmp')).toThrow('not yet implemented');
  });

  it('getCoverageTool throws not-yet-implemented', () => {
    expect(() => provider.getCoverageTool()).toThrow('not yet implemented');
  });

  it('detectCoverageConfig throws not-yet-implemented', () => {
    expect(() => provider.detectCoverageConfig('/tmp')).toThrow('not yet implemented');
  });

  it('getOtlpPackages throws not-yet-implemented', () => {
    expect(() => provider.getOtlpPackages()).toThrow('not yet implemented');
  });

  it('installOtlp throws not-yet-implemented', () => {
    expect(() => provider.installOtlp('/tmp')).toThrow('not yet implemented');
  });

  it('getDockerfileTemplate throws not-yet-implemented', () => {
    expect(() => provider.getDockerfileTemplate()).toThrow('not yet implemented');
  });

  it('getDockerBuildStage throws not-yet-implemented', () => {
    expect(() => provider.getDockerBuildStage()).toThrow('not yet implemented');
  });

  it('getRuntimeCopyDirectives throws not-yet-implemented', () => {
    expect(() => provider.getRuntimeCopyDirectives()).toThrow('not yet implemented');
  });

  it('getBuildCommands throws not-yet-implemented', () => {
    expect(() => provider.getBuildCommands()).toThrow('not yet implemented');
  });

  it('getTestCommands throws not-yet-implemented', () => {
    expect(() => provider.getTestCommands()).toThrow('not yet implemented');
  });

  it('getSemgrepLanguages throws not-yet-implemented', () => {
    expect(() => provider.getSemgrepLanguages()).toThrow('not yet implemented');
  });

  it('parseTestOutput throws not-yet-implemented', () => {
    expect(() => provider.parseTestOutput('output')).toThrow('not yet implemented');
  });

  it('parseCoverageReport throws not-yet-implemented', () => {
    expect(() => provider.parseCoverageReport('/tmp')).toThrow('not yet implemented');
  });

  it('getProjectName throws not-yet-implemented', () => {
    expect(() => provider.getProjectName('/tmp')).toThrow('not yet implemented');
  });

  it('does not implement patchStartScript (optional method)', () => {
    expect(provider.patchStartScript).toBeUndefined();
  });

  it('implements StackProvider interface correctly', () => {
    // Verify all required properties exist
    expect(provider).toHaveProperty('name');
    expect(provider).toHaveProperty('markers');
    expect(provider).toHaveProperty('displayName');
    expect(provider).toHaveProperty('detectAppType');
    expect(provider).toHaveProperty('getCoverageTool');
    expect(provider).toHaveProperty('detectCoverageConfig');
    expect(provider).toHaveProperty('getOtlpPackages');
    expect(provider).toHaveProperty('installOtlp');
    expect(provider).toHaveProperty('getDockerfileTemplate');
    expect(provider).toHaveProperty('getDockerBuildStage');
    expect(provider).toHaveProperty('getRuntimeCopyDirectives');
    expect(provider).toHaveProperty('getBuildCommands');
    expect(provider).toHaveProperty('getTestCommands');
    expect(provider).toHaveProperty('getSemgrepLanguages');
    expect(provider).toHaveProperty('parseTestOutput');
    expect(provider).toHaveProperty('parseCoverageReport');
    expect(provider).toHaveProperty('getProjectName');
  });
});
