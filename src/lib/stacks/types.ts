/**
 * Stack provider types — the canonical location for all stack-related type definitions.
 *
 * All consumers import from `src/lib/stacks/index.ts`. The legacy `stack-detect.ts`
 * module was deleted in story 10-5.
 */

/** Supported language stacks. */
export type StackName = 'nodejs' | 'python' | 'rust';

/** Application archetype detected from project structure and dependencies. */
export type AppType = 'server' | 'cli' | 'web' | 'agent' | 'generic';

/** Coverage tool identifiers. */
export type CoverageToolName = 'c8' | 'nyc' | 'istanbul' | 'coverage-py' | 'tarpaulin' | 'llvm-cov' | 'none';

/** Coverage tool configuration detected in a project. */
export interface CoverageToolInfo {
  tool: CoverageToolName;
  configFile?: string;
}

/** Result of an OTLP instrumentation installation. */
export interface OtlpResult {
  success: boolean;
  packagesInstalled: string[];
  error?: string;
}

/** Parsed test execution counts. */
export interface TestCounts {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

/**
 * The StackProvider interface encapsulates all language-specific behavior.
 * Adding a new language requires only implementing this interface in a single file.
 */
export interface StackProvider {
  /** Canonical stack identifier. */
  readonly name: StackName;

  /** Marker files whose presence indicates this stack (e.g. `['package.json']`). */
  readonly markers: string[];

  /** Human-readable label (e.g. `'Node.js (package.json)'`). */
  readonly displayName: string;

  /** Detect the application archetype for a project directory. */
  detectAppType(dir: string): AppType;

  /** Return the preferred coverage tool for this stack. */
  getCoverageTool(): CoverageToolName;

  /** Detect existing coverage configuration in a directory. */
  detectCoverageConfig(dir: string): CoverageToolInfo;

  /** Return the list of OTLP packages to install. */
  getOtlpPackages(): string[];

  /** Install OTLP instrumentation into a project directory. */
  installOtlp(dir: string): OtlpResult;

  /** Optional: patch the start script for OTLP instrumentation. */
  patchStartScript?(dir: string): boolean;

  /** Return the Dockerfile template name for this stack. */
  getDockerfileTemplate(): string;

  /** Return the Docker build stage snippet. */
  getDockerBuildStage(): string;

  /** Return the runtime COPY directives for Dockerfile. */
  getRuntimeCopyDirectives(): string;

  /** Return build commands for this stack. */
  getBuildCommands(): string[];

  /** Return test commands for this stack. */
  getTestCommands(): string[];

  /** Return Semgrep language identifiers for this stack. */
  getSemgrepLanguages(): string[];

  /** Parse test runner output into counts. */
  parseTestOutput(output: string): TestCounts;

  /** Parse a coverage report and return the coverage percentage. */
  parseCoverageReport(dir: string): number;

  /** Extract the project name from the project directory, or null if undetermined. */
  getProjectName(dir: string): string | null;
}
