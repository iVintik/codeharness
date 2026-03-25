import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodejsProvider } from '../nodejs.js';
import { PythonProvider } from '../python.js';
import { RustProvider } from '../rust.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-verify-section-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('NodejsProvider.getVerifyDockerfileSection', () => {
  const provider = new NodejsProvider();

  it('returns Node.js 20 install via nodesource', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('nodesource');
    expect(section).toContain('setup_20.x');
    expect(section).toContain('nodejs');
  });

  it('installs showboat and claude-code', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('showboat');
    expect(section).toContain('claude-code');
  });
});

describe('PythonProvider.getVerifyDockerfileSection', () => {
  const provider = new PythonProvider();

  it('installs python3-pip and python3-venv', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('python3-pip');
    expect(section).toContain('python3-venv');
  });

  it('installs coverage and pytest', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('coverage');
    expect(section).toContain('pytest');
  });
});

describe('RustProvider.getVerifyDockerfileSection', () => {
  const provider = new RustProvider();

  it('installs rust toolchain via rustup', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('rustup.rs');
    expect(section).toContain('--default-toolchain stable');
  });

  it('sets PATH for cargo binaries', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('ENV PATH="/root/.cargo/bin:$PATH"');
  });

  it('installs clippy and cargo-tarpaulin', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('rustup component add clippy');
    expect(section).toContain('cargo install cargo-tarpaulin');
  });

  it('includes Bevy system libs when bevy is in Cargo.toml dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[package]\nname = "game"\nversion = "0.1.0"\n\n[dependencies]\nbevy = "0.12"\nserde = "1.0"\n',
    );
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('libudev-dev');
    expect(section).toContain('libasound2-dev');
    expect(section).toContain('libwayland-dev');
    expect(section).toContain('libxkbcommon-dev');
    expect(section).toContain('libfontconfig1-dev');
    expect(section).toContain('libx11-dev');
  });

  it('does NOT include Bevy libs when bevy is not in dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[package]\nname = "myapp"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\ntokio = "1.0"\n',
    );
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).toContain('rustup');
    expect(section).not.toContain('libudev-dev');
    expect(section).not.toContain('libasound2-dev');
  });

  it('does NOT include Bevy libs when no Cargo.toml exists', () => {
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).not.toContain('libudev-dev');
  });

  it('does NOT include Bevy libs when bevy is only in dev-dependencies', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      '[package]\nname = "myapp"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n\n[dev-dependencies]\nbevy = "0.12"\n',
    );
    const section = provider.getVerifyDockerfileSection(testDir);
    expect(section).not.toContain('libudev-dev');
  });
});
