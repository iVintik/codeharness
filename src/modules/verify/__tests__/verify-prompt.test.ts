import { describe, it, expect } from 'vitest';
import { verifyPromptTemplate, projectTypeGuidance } from '../../../templates/verify-prompt.js';
import type { PromptProjectType } from '../../../templates/verify-prompt.js';

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

  it('instructs verifier that claude CLI is available in container', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('claude');
    expect(prompt).toContain('claude --print');
    expect(prompt).toContain('ANTHROPIC_API_KEY');
  });

  it('includes nested --allowedTools instruction for Docker exec scenarios', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('--allowedTools Bash Read Write Glob Grep Edit');
    expect(prompt).toContain('nested session');
  });

  it('instructs verifier to escalate narrowly, not blanket-escalate', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('escalate narrowly');
    expect(prompt).toContain('genuinely impossible to automate');
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

  // ─── Project-type-specific guidance (AC #5) ──────────────────────────────

  it('includes Node.js CLI guidance for nodejs project type', () => {
    const prompt = verifyPromptTemplate({ ...baseConfig, projectType: 'nodejs' });
    expect(prompt).toContain('Node.js CLI');
    expect(prompt).toContain('docker exec');
    expect(prompt).toContain('stdout/stderr');
  });

  it('includes Python CLI guidance for python project type', () => {
    const prompt = verifyPromptTemplate({ ...baseConfig, projectType: 'python' });
    expect(prompt).toContain('Python CLI');
    expect(prompt).toContain('docker exec');
  });

  it('includes plugin guidance for plugin project type', () => {
    const prompt = verifyPromptTemplate({ ...baseConfig, projectType: 'plugin' });
    expect(prompt).toContain('Claude Code Plugin');
    expect(prompt).toContain('claude --print');
    expect(prompt).toContain('slash commands');
  });

  it('includes generic guidance for generic project type', () => {
    const prompt = verifyPromptTemplate({ ...baseConfig, projectType: 'generic' });
    expect(prompt).toContain('Unknown / Generic');
    expect(prompt).toContain('Adapt');
    expect(prompt).toContain('do not refuse verification');
  });

  it('defaults to nodejs when no projectType provided', () => {
    const prompt = verifyPromptTemplate(baseConfig);
    expect(prompt).toContain('Node.js CLI');
  });

  it('never says project type is not supported', () => {
    const projectTypes: PromptProjectType[] = ['nodejs', 'python', 'plugin', 'generic'];
    for (const pt of projectTypes) {
      const prompt = verifyPromptTemplate({ ...baseConfig, projectType: pt });
      expect(prompt).not.toContain("isn't supported");
      expect(prompt).not.toContain('not supported');
      expect(prompt).not.toContain('Unsupported');
    }
  });
});

// ─── projectTypeGuidance ──────────────────────────────────────────────────

describe('projectTypeGuidance', () => {
  const container = 'test-container';

  it('returns docker exec guidance for nodejs', () => {
    const guidance = projectTypeGuidance('nodejs', container);
    expect(guidance).toContain('Node.js CLI');
    expect(guidance).toContain(`docker exec ${container}`);
    expect(guidance).toContain('installed globally');
  });

  it('returns docker exec guidance for python', () => {
    const guidance = projectTypeGuidance('python', container);
    expect(guidance).toContain('Python CLI');
    expect(guidance).toContain(`docker exec ${container}`);
  });

  it('returns claude --print guidance for plugin', () => {
    const guidance = projectTypeGuidance('plugin', container);
    expect(guidance).toContain('Claude Code Plugin');
    expect(guidance).toContain(`docker exec ${container} claude --print`);
  });

  it('returns adaptive guidance for generic', () => {
    const guidance = projectTypeGuidance('generic', container);
    expect(guidance).toContain('Unknown / Generic');
    expect(guidance).toContain('do not refuse verification');
  });
});
