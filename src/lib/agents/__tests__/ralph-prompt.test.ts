import { describe, it, expect } from 'vitest';
import { generateRalphPrompt } from '../ralph-prompt.js';

describe('ralph-prompt', () => {
  const config = {
    projectDir: '/home/user/myproject',
    sprintStatusPath: '/home/user/myproject/_bmad-output/implementation-artifacts/sprint-status.yaml',
  };

  describe('generateRalphPrompt', () => {
    it('returns a non-empty string', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toBeTruthy();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('contains /harness-run instruction', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain('/harness-run');
    });

    it('contains the sprint-status.yaml path', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain(config.sprintStatusPath);
    });

    it('contains the project directory', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain(config.projectDir);
    });

    it('contains BMAD workflow instructions', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain('BMAD');
    });

    it('references sprint-status.yaml but does NOT instruct subagents to write it (AC 6)', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain('sprint-status.yaml');
      // Orchestrator owns all status writes — subagents must not write state files
      expect(prompt).toContain('Do NOT write to sprint-state.json or sprint-status.yaml');
    });

    it('mentions verification gates', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain('verification');
    });

    it('contains codeharness verify instruction', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).toContain('codeharness verify');
    });

    it('interpolates different config values correctly', () => {
      const altConfig = {
        projectDir: '/tmp/other-project',
        sprintStatusPath: '/tmp/other-project/sprint-status.yaml',
      };
      const prompt = generateRalphPrompt(altConfig);
      expect(prompt).toContain('/tmp/other-project');
      expect(prompt).toContain('/tmp/other-project/sprint-status.yaml');
      expect(prompt).not.toContain('{{projectDir}}');
      expect(prompt).not.toContain('{{sprintStatusPath}}');
    });

    it('does not contain unresolved template variables', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    });
  });

  describe('retry context', () => {
    it('does not include retry section when retryCount is 0', () => {
      const prompt = generateRalphPrompt({ ...config, retryCount: 0, currentStoryKey: '5-1-test' });
      expect(prompt).not.toContain('Retry Context');
    });

    it('does not include retry section when retryCount is undefined', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).not.toContain('Retry Context');
    });

    it('includes retry section when retryCount > 0 with currentStoryKey', () => {
      const prompt = generateRalphPrompt({
        ...config,
        retryCount: 2,
        currentStoryKey: '5-2-verification-gates',
      });
      expect(prompt).toContain('Retry Context');
      expect(prompt).toContain('retry attempt **2**');
      expect(prompt).toContain('5-2-verification-gates');
    });

    it('does not include retry section when retryCount > 0 but no currentStoryKey', () => {
      const prompt = generateRalphPrompt({
        ...config,
        retryCount: 2,
      });
      expect(prompt).not.toContain('Retry Context');
    });
  });

  describe('flagged stories', () => {
    it('does not include flagged section when flaggedStories is empty', () => {
      const prompt = generateRalphPrompt({ ...config, flaggedStories: [] });
      expect(prompt).not.toContain('Flagged Stories');
    });

    it('does not include flagged section when flaggedStories is undefined', () => {
      const prompt = generateRalphPrompt(config);
      expect(prompt).not.toContain('Flagged Stories');
    });

    it('includes flagged section when flaggedStories has entries', () => {
      const prompt = generateRalphPrompt({
        ...config,
        flaggedStories: ['5-1-broken-story', '5-3-another-broken'],
      });
      expect(prompt).toContain('Flagged Stories');
      expect(prompt).toContain('5-1-broken-story');
      expect(prompt).toContain('5-3-another-broken');
      expect(prompt).toContain('exceeded the retry limit');
    });

    it('lists each flagged story on its own line', () => {
      const prompt = generateRalphPrompt({
        ...config,
        flaggedStories: ['5-1-a', '5-2-b'],
      });
      expect(prompt).toContain('- `5-1-a`');
      expect(prompt).toContain('- `5-2-b`');
    });
  });
});
