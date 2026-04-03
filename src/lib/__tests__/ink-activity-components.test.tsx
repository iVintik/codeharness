import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ActiveTool, CompletedTool, DriverCostSummary } from '../ink-activity-components.js';
import type { CompletedToolEntry } from '../ink-components.js';

// --- ActiveTool tests ---

describe('ActiveTool component', () => {
  it('renders driver name when provided', () => {
    const { lastFrame } = render(<ActiveTool name="Bash" driverName="claude-code" />);
    const frame = lastFrame()!;
    expect(frame).toContain('Bash');
    expect(frame).toContain('(claude-code)');
  });

  it('renders without driver name (backward compat)', () => {
    const { lastFrame } = render(<ActiveTool name="Bash" />);
    const frame = lastFrame()!;
    expect(frame).toContain('Bash');
    expect(frame).not.toContain('(');
  });

  it('renders without driver name when null', () => {
    const { lastFrame } = render(<ActiveTool name="Read" driverName={null} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Read');
    expect(frame).not.toContain('(');
  });
});

// --- CompletedTool tests ---

describe('CompletedTool component', () => {
  it('renders driver name from entry', () => {
    const entry: CompletedToolEntry = { name: 'Edit', args: 'src/foo.ts', driver: 'codex' };
    const { lastFrame } = render(<CompletedTool entry={entry} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Edit');
    expect(frame).toContain('src/foo.ts');
    expect(frame).toContain('(codex)');
  });

  it('renders without driver name (backward compat)', () => {
    const entry: CompletedToolEntry = { name: 'Edit', args: 'src/foo.ts' };
    const { lastFrame } = render(<CompletedTool entry={entry} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Edit');
    expect(frame).toContain('src/foo.ts');
    expect(frame).not.toContain('(');
  });

  it('renders driver name after truncated long args', () => {
    const longArgs = 'a'.repeat(80);
    const entry: CompletedToolEntry = { name: 'Bash', args: longArgs, driver: 'opencode' };
    const { lastFrame } = render(<CompletedTool entry={entry} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Bash');
    // Args truncated to 60 chars + ellipsis
    expect(frame).toContain('…');
    expect(frame).toContain('(opencode)');
  });
});

// --- DriverCostSummary tests ---

describe('DriverCostSummary component', () => {
  it('renders nothing when driverCosts is empty', () => {
    const { lastFrame } = render(<DriverCostSummary driverCosts={{}} />);
    expect(lastFrame()).toBe('');
  });

  it('renders nothing when driverCosts is null-ish', () => {
    // Defensive: even though type says Record, runtime might get undefined
    const { lastFrame } = render(<DriverCostSummary driverCosts={undefined as unknown as Record<string, number>} />);
    expect(lastFrame()).toBe('');
  });

  it('renders single driver cost', () => {
    const { lastFrame } = render(<DriverCostSummary driverCosts={{ 'claude-code': 1.5 }} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Cost: claude-code $1.50');
  });

  it('renders multi-driver costs sorted alphabetically', () => {
    const { lastFrame } = render(
      <DriverCostSummary driverCosts={{ codex: 0.45, 'claude-code': 1.23 }} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Cost: claude-code $1.23, codex $0.45');
  });

  it('formats cost as $X.XX with two decimal places', () => {
    const { lastFrame } = render(<DriverCostSummary driverCosts={{ opencode: 3 }} />);
    const frame = lastFrame()!;
    expect(frame).toContain('$3.00');
  });
});
