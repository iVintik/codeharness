import { describe, it, expect } from 'vitest';
import { readmeTemplate } from '../../templates/readme.js';
import type { ReadmeTemplateConfig } from '../../templates/readme.js';

// ─── readmeTemplate ─────────────────────────────────────────────────────────

describe('readmeTemplate', () => {
  const baseConfig: ReadmeTemplateConfig = {
    projectName: 'my-project',
    stack: 'nodejs',
    cliHelpOutput: 'Usage: codeharness [options] [command]\n\nCommands:\n  init    Initialize the harness\n  status  Show project status',
  };

  it('generates a valid README with all required sections', () => {
    const content = readmeTemplate(baseConfig);

    expect(content).toContain('# my-project');
    expect(content).toContain('## Quick Start');
    expect(content).toContain('## Installation');
    expect(content).toContain('## Usage');
    expect(content).toContain('## CLI Reference');
  });

  it('includes project name as h1 header', () => {
    const content = readmeTemplate({ ...baseConfig, projectName: 'codeharness' });
    expect(content).toMatch(/^# codeharness$/m);
  });

  it('includes install command in Quick Start for nodejs', () => {
    const content = readmeTemplate(baseConfig);
    expect(content).toContain('npm install -g codeharness');
  });

  it('includes install command in Quick Start for python', () => {
    const content = readmeTemplate({ ...baseConfig, stack: 'python' });
    expect(content).toContain('pip install codeharness');
  });

  it('defaults to npm install for null stack', () => {
    const content = readmeTemplate({ ...baseConfig, stack: null });
    expect(content).toContain('npm install -g codeharness');
  });

  it('includes first-run command (codeharness init) in Quick Start', () => {
    const content = readmeTemplate(baseConfig);
    expect(content).toContain('codeharness init');
  });

  it('includes example usage (codeharness status) in Quick Start', () => {
    const content = readmeTemplate(baseConfig);
    expect(content).toContain('codeharness status');
  });

  it('includes CLI help output in CLI Reference section', () => {
    const content = readmeTemplate(baseConfig);
    expect(content).toContain('Usage: codeharness [options] [command]');
    expect(content).toContain('init    Initialize the harness');
  });

  it('includes install command in Installation section', () => {
    const content = readmeTemplate(baseConfig);
    // Installation section has its own code block with install command
    const installSection = content.split('## Installation')[1].split('## Usage')[0];
    expect(installSection).toContain('npm install -g codeharness');
  });

  it('trims trailing whitespace from CLI help output', () => {
    const config: ReadmeTemplateConfig = {
      ...baseConfig,
      cliHelpOutput: 'Usage: codeharness [options]\n\n   \n',
    };
    const content = readmeTemplate(config);
    // Should not end with trailing whitespace inside the code block
    expect(content).toContain('Usage: codeharness [options]\n```');
  });
});
