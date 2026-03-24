import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RustProvider } from '../../stacks/rust.js';
import {
  CARGO_TOML_MINIMAL,
  CARGO_TOML_ACTIX_WEB,
  CARGO_TOML_AXUM,
  CARGO_TOML_ASYNC_OPENAI,
  CARGO_TOML_WORKSPACE,
  CARGO_TOML_BINARY,
  CARGO_TOML_LIBRARY,
  CARGO_TOML_GENERIC,
} from '../helpers.js';

let testDir: string;
let provider: RustProvider;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-rust-provider-'));
  provider = new RustProvider();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ── Static properties ────────────────────────────────────────────────────────

describe('RustProvider — static properties', () => {
  it('has correct name', () => {
    expect(provider.name).toBe('rust');
  });

  it('has correct markers', () => {
    expect(provider.markers).toEqual(['Cargo.toml']);
  });

  it('has correct displayName', () => {
    expect(provider.displayName).toBe('Rust (Cargo.toml)');
  });
});

// ── detectAppType (AC2–AC8) ──────────────────────────────────────────────────

describe('RustProvider.detectAppType', () => {
  it('returns "agent" when async-openai is in dependencies (AC2)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_ASYNC_OPENAI);
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for anthropic dep', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nanthropic = "0.1"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "agent" for llm-chain dep', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nllm-chain = "0.13"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('returns "server" when actix-web is in dependencies (AC3)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_ACTIX_WEB);
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" when axum is in dependencies (AC4)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_AXUM);
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" when rocket is in dependencies (AC5)', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nrocket = "0.5"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" for tide dep', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\ntide = "0.16"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" for warp dep', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nwarp = "0.3"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "server" for axum with table-style dependency', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\naxum = { version = "0.7", features = ["macros"] }\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('server');
  });

  it('returns "cli" when [[bin]] section is present and no web framework deps (AC6)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_BINARY);
    expect(provider.detectAppType(testDir)).toBe('cli');
  });

  it('returns "generic" when [lib] section is present and no [[bin]] section (AC7)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_LIBRARY);
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('returns "generic" for minimal Cargo.toml with no [[bin]], [lib], or framework deps (AC8)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_MINIMAL);
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('returns "generic" when no Cargo.toml exists', () => {
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('agent deps take priority over web framework deps', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nasync-openai = "0.18"\nactix-web = "4"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('agent');
  });

  it('does not match deps in [dev-dependencies] for agent detection', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nserde = "1"\n\n[dev-dependencies]\nasync-openai = "0.18"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('does not false-positive on prefix crate names (axum-extra should not match axum)', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\naxum-extra = "0.9"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('generic');
  });

  it('does not false-positive on suffix crate names (my-axum should not match axum)', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "myapp"\n\n[dependencies]\nmy-axum = "0.1"\n`,
    );
    expect(provider.detectAppType(testDir)).toBe('generic');
  });
});

// ── getCoverageTool (AC9) ────────────────────────────────────────────────────

describe('RustProvider.getCoverageTool', () => {
  it('returns "tarpaulin" (AC9)', () => {
    expect(provider.getCoverageTool()).toBe('tarpaulin');
  });
});

// ── detectCoverageConfig (AC10–AC12) ──────────────────────────────────────────

describe('RustProvider.detectCoverageConfig', () => {
  it('returns tarpaulin with configFile for standard Cargo.toml (AC10)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_GENERIC);
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('tarpaulin');
    expect(result.configFile).toBeDefined();
    expect(result.configFile).toContain('Cargo.toml');
  });

  it('returns tarpaulin with configFile for workspace Cargo.toml (AC11)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_WORKSPACE);
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('tarpaulin');
    expect(result.configFile).toBeDefined();
    expect(result.configFile).toContain('Cargo.toml');
  });

  it('returns none when no Cargo.toml exists (AC12)', () => {
    const result = provider.detectCoverageConfig(testDir);
    expect(result.tool).toBe('none');
  });
});

// ── getOtlpPackages (AC13) ───────────────────────────────────────────────────

describe('RustProvider.getOtlpPackages', () => {
  it('returns exact OTLP packages (AC13)', () => {
    expect(provider.getOtlpPackages()).toEqual([
      'opentelemetry',
      'opentelemetry-otlp',
      'tracing-opentelemetry',
      'tracing-subscriber',
    ]);
  });

  it('returns a new array each time (not shared reference)', () => {
    const a = provider.getOtlpPackages();
    const b = provider.getOtlpPackages();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── getDockerfileTemplate (AC14) ──────────────────────────────────────────────

describe('RustProvider.getDockerfileTemplate', () => {
  it('contains FROM rust:1.82-slim AS builder (AC14)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('FROM rust:1.82-slim AS builder');
  });

  it('contains cargo build --release (AC14)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('cargo build --release');
  });

  it('contains FROM debian:bookworm-slim (AC14)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('FROM debian:bookworm-slim');
  });

  it('contains USER nobody (AC14)', () => {
    const template = provider.getDockerfileTemplate();
    expect(template).toContain('USER nobody');
  });
});

// ── getDockerBuildStage (AC15) ───────────────────────────────────────────────

describe('RustProvider.getDockerBuildStage', () => {
  it('contains FROM rust:1.82-slim AS build-rust (AC15)', () => {
    const stage = provider.getDockerBuildStage();
    expect(stage).toContain('FROM rust:1.82-slim AS build-rust');
  });

  it('contains cargo build --release (AC15)', () => {
    const stage = provider.getDockerBuildStage();
    expect(stage).toContain('cargo build --release');
  });
});

// ── getRuntimeCopyDirectives (AC16) ──────────────────────────────────────────

describe('RustProvider.getRuntimeCopyDirectives', () => {
  it('contains COPY --from=build-rust (AC16)', () => {
    const directives = provider.getRuntimeCopyDirectives();
    expect(directives).toContain('COPY --from=build-rust');
  });
});

// ── parseTestOutput (AC17–AC19) ──────────────────────────────────────────────

describe('RustProvider.parseTestOutput', () => {
  it('parses single crate output: "test result: ok. 42 passed; 3 failed; 1 ignored" (AC17)', () => {
    const result = provider.parseTestOutput('test result: ok. 42 passed; 3 failed; 1 ignored');
    expect(result).toEqual({ passed: 42, failed: 3, skipped: 1, total: 46 });
  });

  it('aggregates workspace output with two test result lines (AC18)', () => {
    const output = `
running 10 tests
test result: ok. 10 passed; 0 failed; 0 ignored

running 7 tests
test result: ok. 5 passed; 2 failed; 0 ignored
`;
    const result = provider.parseTestOutput(output);
    expect(result).toEqual({ passed: 15, failed: 2, skipped: 0, total: 17 });
  });

  it('returns zeros for unrecognized output (AC19)', () => {
    const result = provider.parseTestOutput('some random output');
    expect(result).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });

  it('returns zeros for empty string', () => {
    const result = provider.parseTestOutput('');
    expect(result).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });

  it('parses output without ignored count', () => {
    const result = provider.parseTestOutput('test result: ok. 5 passed; 0 failed');
    expect(result).toEqual({ passed: 5, failed: 0, skipped: 0, total: 5 });
  });

  it('aggregates three crates in workspace', () => {
    const output = `
test result: ok. 10 passed; 0 failed; 2 ignored
test result: FAILED. 3 passed; 1 failed; 0 ignored
test result: ok. 7 passed; 0 failed; 1 ignored
`;
    const result = provider.parseTestOutput(output);
    expect(result).toEqual({ passed: 20, failed: 1, skipped: 3, total: 24 });
  });

  it('parses output embedded in larger cargo text', () => {
    const output = `
   Compiling myapp v0.1.0
    Finished test [unoptimized + debuginfo] target(s) in 2.34s
     Running unittests src/lib.rs

running 42 tests
test tests::foo ... ok
test result: ok. 42 passed; 3 failed; 1 ignored; 0 measured; 0 filtered out
`;
    const result = provider.parseTestOutput(output);
    expect(result).toEqual({ passed: 42, failed: 3, skipped: 1, total: 46 });
  });
});

// ── parseCoverageReport (AC20–AC21) ──────────────────────────────────────────

describe('RustProvider.parseCoverageReport', () => {
  it('parses tarpaulin-report.json with coverage field (AC20)', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(
      join(testDir, 'coverage', 'tarpaulin-report.json'),
      JSON.stringify({ coverage: 78.5 }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(78.5);
  });

  it('returns 0 when tarpaulin-report.json does not exist (AC21)', () => {
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 for malformed JSON', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(join(testDir, 'coverage', 'tarpaulin-report.json'), 'not-json');
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });

  it('returns 0 when coverage field is missing', () => {
    mkdirSync(join(testDir, 'coverage'));
    writeFileSync(
      join(testDir, 'coverage', 'tarpaulin-report.json'),
      JSON.stringify({ files: [] }),
    );
    expect(provider.parseCoverageReport(testDir)).toBe(0);
  });
});

// ── getProjectName (AC22–AC23) ───────────────────────────────────────────────

describe('RustProvider.getProjectName', () => {
  it('returns name from [package] section (AC22)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_GENERIC.replace('myapp', 'my-rust-app'));
    expect(provider.getProjectName(testDir)).toBe('my-rust-app');
  });

  it('returns null when no Cargo.toml exists (AC23)', () => {
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('returns null when no name field in [package]', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nversion = "0.1.0"\n`,
    );
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('returns null when no [package] section', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), CARGO_TOML_WORKSPACE);
    expect(provider.getProjectName(testDir)).toBeNull();
  });

  it('extracts name only from [package] section, not from other sections', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = "correct-name"\nversion = "0.1.0"\n\n[[bin]]\nname = "wrong-name"\npath = "src/main.rs"\n`,
    );
    expect(provider.getProjectName(testDir)).toBe('correct-name');
  });

  it('handles single-quoted name', () => {
    writeFileSync(
      join(testDir, 'Cargo.toml'),
      `[package]\nname = 'my-app'\nversion = "0.1.0"\n`,
    );
    expect(provider.getProjectName(testDir)).toBe('my-app');
  });
});

// ── getSemgrepLanguages (AC24) ───────────────────────────────────────────────

describe('RustProvider.getSemgrepLanguages', () => {
  it('returns ["rust"] (AC24)', () => {
    expect(provider.getSemgrepLanguages()).toEqual(['rust']);
  });
});

// ── getBuildCommands / getTestCommands (AC25) ────────────────────────────────

describe('RustProvider.getBuildCommands and getTestCommands', () => {
  it('getBuildCommands returns ["cargo build", "cargo test"] (AC25)', () => {
    expect(provider.getBuildCommands()).toEqual(['cargo build', 'cargo test']);
  });

  it('getTestCommands returns ["cargo test"] (AC25)', () => {
    expect(provider.getTestCommands()).toEqual(['cargo test']);
  });
});

// ── Registration (AC26) ──────────────────────────────────────────────────────

describe('RustProvider — registration in stacks/index.ts', () => {
  it('getStackProvider("rust") returns a RustProvider instance (AC26)', async () => {
    // Dynamic import to trigger auto-registration
    const { getStackProvider } = await import('../../stacks/index.js');
    const rustProvider = getStackProvider('rust');
    expect(rustProvider).toBeDefined();
    expect(rustProvider!.name).toBe('rust');
  });
});

// ── installOtlp ──────────────────────────────────────────────────────────────

describe('RustProvider.installOtlp', () => {
  it('returns failure result for non-existent directory', () => {
    const result = provider.installOtlp(join(testDir, 'nonexistent'));
    expect(result.success).toBe(false);
    expect(result.packagesInstalled).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

// ── StackProvider interface compliance ───────────────────────────────────────

describe('RustProvider — StackProvider interface compliance', () => {
  it('implements all required StackProvider methods', () => {
    expect(typeof provider.detectAppType).toBe('function');
    expect(typeof provider.getCoverageTool).toBe('function');
    expect(typeof provider.detectCoverageConfig).toBe('function');
    expect(typeof provider.getOtlpPackages).toBe('function');
    expect(typeof provider.installOtlp).toBe('function');
    expect(typeof provider.getDockerfileTemplate).toBe('function');
    expect(typeof provider.getDockerBuildStage).toBe('function');
    expect(typeof provider.getRuntimeCopyDirectives).toBe('function');
    expect(typeof provider.getBuildCommands).toBe('function');
    expect(typeof provider.getTestCommands).toBe('function');
    expect(typeof provider.getSemgrepLanguages).toBe('function');
    expect(typeof provider.parseTestOutput).toBe('function');
    expect(typeof provider.parseCoverageReport).toBe('function');
    expect(typeof provider.getProjectName).toBe('function');
  });

  it('does not implement patchStartScript (Rust uses env vars)', () => {
    expect((provider as unknown as Record<string, unknown>).patchStartScript).toBeUndefined();
  });
});
