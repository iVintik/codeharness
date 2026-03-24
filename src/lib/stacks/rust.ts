/**
 * Rust stack provider — encapsulates all Rust-specific behavior.
 * Implements every StackProvider method for the rust stack.
 *
 * Story 10-4: full implementation following NodejsProvider/PythonProvider patterns.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AppType,
  CoverageToolInfo,
  CoverageToolName,
  OtlpResult,
  StackProvider,
  TestCounts,
} from './types.js';
import { readTextSafe, getCargoDepsSection, hasCargoDep } from './utils.js';

/** Dependency names that signal an AI/agent project. */
const RUST_AGENT_DEPS = ['async-openai', 'anthropic', 'llm-chain'];

/** Dependency names that signal a web framework project. */
const RUST_WEB_FRAMEWORKS = ['actix-web', 'axum', 'rocket', 'tide', 'warp'];

/** OTLP packages required for Rust instrumentation. */
const RUST_OTLP_PACKAGES = [
  'opentelemetry',
  'opentelemetry-otlp',
  'tracing-opentelemetry',
  'tracing-subscriber',
];

export class RustProvider implements StackProvider {
  readonly name = 'rust' as const;
  readonly markers = ['Cargo.toml'];
  readonly displayName = 'Rust (Cargo.toml)';

  // ── Task 3: detectAppType ──────────────────────────────────────────────

  detectAppType(dir: string): AppType {
    const cargoContent = readTextSafe(join(dir, 'Cargo.toml'));
    if (!cargoContent) return 'generic';

    const depsSection = getCargoDepsSection(cargoContent);

    // Priority 1: Agent detection (only in [dependencies], not [dev-dependencies])
    if (RUST_AGENT_DEPS.some((d) => hasCargoDep(depsSection, d))) {
      return 'agent';
    }

    // Priority 2: Server detection (web framework in [dependencies])
    if (RUST_WEB_FRAMEWORKS.some((d) => hasCargoDep(depsSection, d))) {
      return 'server';
    }

    // Priority 3: CLI detection ([[bin]] section present)
    if (/^\[\[bin\]\]\s*$/m.test(cargoContent)) {
      return 'cli';
    }

    // Priority 4: Library detection ([lib] section present, no [[bin]])
    if (/^\[lib\]\s*$/m.test(cargoContent)) {
      return 'generic';
    }

    return 'generic';
  }

  // ── Task 4: getCoverageTool ────────────────────────────────────────────

  getCoverageTool(): CoverageToolName {
    return 'tarpaulin';
  }

  // ── Task 5: detectCoverageConfig ───────────────────────────────────────

  detectCoverageConfig(dir: string): CoverageToolInfo {
    const cargoPath = join(dir, 'Cargo.toml');
    if (!existsSync(cargoPath)) {
      return { tool: 'none' };
    }

    return { tool: 'tarpaulin', configFile: cargoPath };
  }

  // ── Task 6: getOtlpPackages ────────────────────────────────────────────

  getOtlpPackages(): string[] {
    return [...RUST_OTLP_PACKAGES];
  }

  // ── Task 7: installOtlp ───────────────────────────────────────────────

  installOtlp(dir: string): OtlpResult {
    try {
      execFileSync('cargo', ['add', ...RUST_OTLP_PACKAGES], {
        cwd: dir,
        stdio: 'pipe',
        timeout: 300_000,
      });
      return {
        success: true,
        packagesInstalled: [...RUST_OTLP_PACKAGES],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        packagesInstalled: [],
        error: `Failed to install Rust OTLP packages: ${message.length > 200 ? message.slice(0, 200) + '... (truncated)' : message}`,
      };
    }
  }

  // ── Task 8: getDockerfileTemplate ─────────────────────────────────────

  getDockerfileTemplate(): string {
    return `# === Builder stage ===
FROM rust:1.82-slim AS builder

WORKDIR /build

# Copy project files
COPY . .

# Build release binary
RUN cargo build --release

# === Runtime stage ===
FROM debian:bookworm-slim

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install compiled binary from builder (update 'myapp' to your binary name)
COPY --from=builder /build/target/release/myapp /usr/local/bin/myapp

# Run as non-root user
USER nobody

WORKDIR /workspace
`;
  }

  // ── Task 9: getDockerBuildStage ───────────────────────────────────────

  getDockerBuildStage(): string {
    return `# === Build stage: rust ===
FROM rust:1.82-slim AS build-rust
WORKDIR /build
COPY . .
RUN cargo build --release
`;
  }

  // ── Task 10: getRuntimeCopyDirectives ──────────────────────────────────

  getRuntimeCopyDirectives(): string {
    return 'COPY --from=build-rust /build/target/release/myapp /usr/local/bin/myapp';
  }

  // ── Task 11: getBuildCommands ──────────────────────────────────────────

  getBuildCommands(): string[] {
    return ['cargo build', 'cargo test'];
  }

  // ── Task 12: getTestCommands ──────────────────────────────────────────

  getTestCommands(): string[] {
    return ['cargo test'];
  }

  // ── Task 13: getSemgrepLanguages ──────────────────────────────────────

  getSemgrepLanguages(): string[] {
    return ['rust'];
  }

  // ── Task 14: parseTestOutput ──────────────────────────────────────────

  parseTestOutput(output: string): TestCounts {
    // Cargo test format: "test result: ok. N passed; M failed; K ignored"
    // Workspace projects emit multiple "test result:" lines — aggregate all.
    const pattern = /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed(?:;\s*(\d+)\s+ignored)?/g;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(output)) !== null) {
      passed += parseInt(match[1], 10);
      failed += parseInt(match[2], 10);
      skipped += match[3] ? parseInt(match[3], 10) : 0;
    }

    const total = passed + failed + skipped;
    return { passed, failed, skipped, total };
  }

  // ── Task 15: parseCoverageReport ──────────────────────────────────────

  parseCoverageReport(dir: string): number {
    const reportPath = join(dir, 'coverage', 'tarpaulin-report.json');
    if (!existsSync(reportPath)) return 0;

    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as { coverage?: number };
      return report.coverage ?? 0;
    } catch {
      return 0;
    }
  }

  // ── Task 16: getProjectName ───────────────────────────────────────────

  getProjectName(dir: string): string | null {
    const cargoContent = readTextSafe(join(dir, 'Cargo.toml'));
    if (!cargoContent) return null;

    // Extract the [package] section (up to the next section header or EOF)
    const packageIdx = cargoContent.search(/^\[package\]\s*$/m);
    if (packageIdx === -1) return null;

    const afterHeader = cargoContent.slice(
      packageIdx + cargoContent.slice(packageIdx).indexOf('\n') + 1,
    );
    // Find where next section starts (line beginning with '[')
    const nextSectionIdx = afterHeader.search(/^\[/m);
    const section = nextSectionIdx === -1 ? afterHeader : afterHeader.slice(0, nextSectionIdx);

    // Match name = "..." or name = '...' within the [package] section only
    const nameMatch = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(section);
    return nameMatch ? nameMatch[1] : null;
  }
}
