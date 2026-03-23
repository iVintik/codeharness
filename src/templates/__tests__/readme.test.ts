import { describe, it, expect } from 'vitest';
import { readmeTemplate, getInstallCommand } from '../readme.js';

describe('getInstallCommand', () => {
  it('returns npm install for nodejs', () => {
    expect(getInstallCommand('nodejs')).toBe('npm install -g codeharness');
  });

  it('returns pip install for python', () => {
    expect(getInstallCommand('python')).toBe('pip install codeharness');
  });

  it('returns cargo install for rust', () => {
    expect(getInstallCommand('rust')).toBe('cargo install codeharness');
  });

  it('returns npm install for null', () => {
    expect(getInstallCommand(null)).toBe('npm install -g codeharness');
  });

  it('returns multi-stack install commands for array', () => {
    const result = getInstallCommand(['nodejs', 'rust']);
    expect(result).toContain('npm install -g codeharness');
    expect(result).toContain('cargo install codeharness');
    // Should be on separate lines
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('returns single command for single-element array', () => {
    expect(getInstallCommand(['python'])).toBe('pip install codeharness');
  });

  it('deduplicates identical commands for same-stack array', () => {
    const result = getInstallCommand(['nodejs', 'nodejs']);
    expect(result).toBe('npm install -g codeharness');
  });

  it('existing single-stack output unchanged for string', () => {
    expect(getInstallCommand('python')).toBe('pip install codeharness');
  });
});

describe('readmeTemplate', () => {
  it('generates readme with multi-stack install commands', () => {
    const result = readmeTemplate({
      projectName: 'my-app',
      stack: ['nodejs', 'rust'],
      cliHelpOutput: 'Usage: codeharness [options]',
    });
    expect(result).toContain('npm install -g codeharness');
    expect(result).toContain('cargo install codeharness');
    expect(result).toContain('# my-app');
  });

  it('generates readme with single-stack string', () => {
    const result = readmeTemplate({
      projectName: 'my-app',
      stack: 'nodejs',
      cliHelpOutput: 'Usage: codeharness [options]',
    });
    expect(result).toContain('npm install -g codeharness');
    expect(result).not.toContain('cargo install codeharness');
  });

  it('generates readme with null stack', () => {
    const result = readmeTemplate({
      projectName: 'my-app',
      stack: null,
      cliHelpOutput: 'Usage: codeharness [options]',
    });
    expect(result).toContain('npm install -g codeharness');
  });
});
