import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock stacks module — control which stacks are "detected"
vi.mock('../../../lib/stacks/index.js', async () => {
  const { NodejsProvider } = await vi.importActual<typeof import('../../../lib/stacks/nodejs.js')>(
    '../../../lib/stacks/nodejs.js',
  );
  const { PythonProvider } = await vi.importActual<typeof import('../../../lib/stacks/python.js')>(
    '../../../lib/stacks/python.js',
  );
  const { RustProvider } = await vi.importActual<typeof import('../../../lib/stacks/rust.js')>(
    '../../../lib/stacks/rust.js',
  );

  const providerMap: Record<string, unknown> = {
    nodejs: new NodejsProvider(),
    python: new PythonProvider(),
    rust: new RustProvider(),
  };

  return {
    detectStacks: vi.fn(() => []),
    getStackProvider: vi.fn((name: string) => providerMap[name] ?? undefined),
  };
});

import { detectStacks } from '../../../lib/stacks/index.js';
import { generateVerifyDockerfile } from '../dockerfile-generator.js';

const mockDetectStacks = vi.mocked(detectStacks);

let testDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-dockerfile-gen-'));
});

import { afterEach } from 'vitest';
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('generateVerifyDockerfile', () => {
  it('includes base image and common tools for any project', () => {
    mockDetectStacks.mockReturnValue([]);
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('FROM ubuntu:22.04');
    expect(result).toContain('curl jq git python3 pipx');
    expect(result).toContain('pipx install semgrep');
    expect(result).toContain('WORKDIR /workspace');
  });

  it('includes OTLP env vars', () => {
    mockDetectStacks.mockReturnValue([]);
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('OTEL_EXPORTER_OTLP_ENDPOINT');
    expect(result).toContain('OTEL_SERVICE_NAME');
    expect(result).toContain('OTEL_TRACES_EXPORTER');
    expect(result).toContain('OTEL_METRICS_EXPORTER');
  });

  it('includes Node.js section for nodejs stack', () => {
    mockDetectStacks.mockReturnValue([{ stack: 'nodejs', dir: '.' }]);
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('nodesource');
    expect(result).toContain('nodejs');
    expect(result).toContain('showboat');
  });

  it('includes Python section for python stack', () => {
    mockDetectStacks.mockReturnValue([{ stack: 'python', dir: '.' }]);
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('python3-pip');
    expect(result).toContain('coverage');
    expect(result).toContain('pytest');
  });

  it('includes Rust section for rust stack without bevy', () => {
    mockDetectStacks.mockReturnValue([{ stack: 'rust', dir: '.' }]);
    // No Cargo.toml -> no bevy detection
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('rustup');
    expect(result).toContain('clippy');
    expect(result).toContain('cargo-tarpaulin');
    expect(result).toContain('ENV PATH="/root/.cargo/bin:$PATH"');
    expect(result).not.toContain('libudev-dev');
  });

  it('includes Bevy system libs for rust project with bevy dep', () => {
    mockDetectStacks.mockReturnValue([{ stack: 'rust', dir: '.' }]);
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[package]\nname = "myapp"\nversion = "0.1.0"\n\n[dependencies]\nbevy = "0.12"\n',
    );
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('libudev-dev');
    expect(result).toContain('libasound2-dev');
    expect(result).toContain('libwayland-dev');
    expect(result).toContain('libxkbcommon-dev');
    expect(result).toContain('libfontconfig1-dev');
    expect(result).toContain('libx11-dev');
  });

  it('does NOT include Bevy libs for rust project without bevy', () => {
    mockDetectStacks.mockReturnValue([{ stack: 'rust', dir: '.' }]);
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[package]\nname = "myapp"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n',
    );
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('rustup');
    expect(result).not.toContain('libudev-dev');
  });

  it('includes sections for ALL stacks in a multi-stack project', () => {
    mockDetectStacks.mockReturnValue([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: '.' },
    ]);
    const result = generateVerifyDockerfile(testDir);
    // Node.js section
    expect(result).toContain('nodesource');
    expect(result).toContain('showboat');
    // Rust section
    expect(result).toContain('rustup');
    expect(result).toContain('cargo-tarpaulin');
  });

  it('produces only base + common tools for generic/plugin project (no stacks)', () => {
    mockDetectStacks.mockReturnValue([]);
    const result = generateVerifyDockerfile(testDir);
    expect(result).toContain('FROM ubuntu:22.04');
    expect(result).toContain('curl jq git python3 pipx');
    // No stack-specific sections
    expect(result).not.toContain('nodesource');
    expect(result).not.toContain('rustup');
    expect(result).not.toContain('python3-pip');
  });
});
