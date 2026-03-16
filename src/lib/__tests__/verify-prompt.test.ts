import { describe, it, expect } from 'vitest';
import { verifyPromptTemplate } from '../../templates/verify-prompt.js';

describe('verifyPromptTemplate', () => {
  const baseConfig = {
    storyKey: '13-3-black-box-verifier-agent',
    storyContent: '# Story 13.3\n\n## Acceptance Criteria\n\n1. AC one\n2. AC two',
  };

  it('includes story acceptance criteria from storyContent', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('# Story 13.3');
    expect(prompt).toContain('AC one');
    expect(prompt).toContain('AC two');
  });

  it('includes default container name (codeharness-verify)', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('codeharness-verify');
    expect(prompt).toContain('docker exec codeharness-verify');
  });

  it('uses custom container name when provided', () => {
    const prompt = verifyPromptTemplate({
      ...baseConfig,
      containerName: 'my-custom-container',
    });
    expect(prompt).toContain('docker exec my-custom-container');
    expect(prompt).toContain('Container name: `my-custom-container`');
  });

  it('includes default observability endpoints', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('localhost:9428');
    expect(prompt).toContain('localhost:8428');
    expect(prompt).toContain('localhost:16686');
  });

  it('uses custom observability endpoints when provided', () => {
    const prompt = verifyPromptTemplate({
      ...baseConfig,
      observabilityEndpoints: {
        victoriaLogs: 'http://custom-logs:9999',
        victoriaMetrics: 'http://custom-metrics:8888',
        victoriaTraces: 'http://custom-traces:7777',
      },
    });
    expect(prompt).toContain('http://custom-logs:9999');
    expect(prompt).toContain('http://custom-metrics:8888');
    expect(prompt).toContain('http://custom-traces:7777');
  });

  it('includes README.md reading instruction', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('README.md');
    expect(prompt).toMatch(/[Rr]ead.*README\.md/);
  });

  it('includes docker exec usage instructions', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('ALL commands MUST use `docker exec');
    expect(prompt).toContain('ALL CLI commands MUST run via');
  });

  it('includes proof output path', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain(`verification/${baseConfig.storyKey}-proof.md`);
  });

  it('instructs verifier to report REAL failures', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('REAL failure');
    expect(prompt).toMatch(/[Dd]o NOT fabricate/);
  });

  it('explains no source code is available', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('NO source code');
    expect(prompt).toContain('src/');
    expect(prompt).toContain('does not exist');
  });

  it('includes observability curl examples', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('curl');
    expect(prompt).toContain('logsql/query');
    expect(prompt).toContain('api/v1/query');
    expect(prompt).toContain('api/traces');
  });

  it('includes [ESCALATE] instruction', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('[ESCALATE]');
  });

  it('merges partial observability endpoint overrides with defaults', () => {
    const prompt = verifyPromptTemplate({
      ...baseConfig,
      observabilityEndpoints: {
        victoriaLogs: 'http://custom-logs:9999',
        // victoriaMetrics and victoriaTraces should use defaults
      },
    });
    expect(prompt).toContain('http://custom-logs:9999');
    expect(prompt).toContain('localhost:8428'); // default
    expect(prompt).toContain('localhost:16686'); // default
  });
});
