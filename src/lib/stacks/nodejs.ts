/**
 * Minimal Node.js stack provider stub.
 * Full method implementations will be added in story 10-2.
 */

import type {
  AppType,
  CoverageToolInfo,
  CoverageToolName,
  OtlpResult,
  StackProvider,
  TestCounts,
} from './types.js';

export class NodejsProvider implements StackProvider {
  readonly name = 'nodejs' as const;
  readonly markers = ['package.json'];
  readonly displayName = 'Node.js (package.json)';

  detectAppType(_dir: string): AppType {
    throw new Error('NodejsProvider.detectAppType not yet implemented (story 10-2)');
  }

  getCoverageTool(): CoverageToolName {
    throw new Error('NodejsProvider.getCoverageTool not yet implemented (story 10-2)');
  }

  detectCoverageConfig(_dir: string): CoverageToolInfo {
    throw new Error('NodejsProvider.detectCoverageConfig not yet implemented (story 10-2)');
  }

  getOtlpPackages(): string[] {
    throw new Error('NodejsProvider.getOtlpPackages not yet implemented (story 10-2)');
  }

  installOtlp(_dir: string): OtlpResult {
    throw new Error('NodejsProvider.installOtlp not yet implemented (story 10-2)');
  }

  getDockerfileTemplate(): string {
    throw new Error('NodejsProvider.getDockerfileTemplate not yet implemented (story 10-2)');
  }

  getDockerBuildStage(): string {
    throw new Error('NodejsProvider.getDockerBuildStage not yet implemented (story 10-2)');
  }

  getRuntimeCopyDirectives(): string {
    throw new Error('NodejsProvider.getRuntimeCopyDirectives not yet implemented (story 10-2)');
  }

  getBuildCommands(): string[] {
    throw new Error('NodejsProvider.getBuildCommands not yet implemented (story 10-2)');
  }

  getTestCommands(): string[] {
    throw new Error('NodejsProvider.getTestCommands not yet implemented (story 10-2)');
  }

  getSemgrepLanguages(): string[] {
    throw new Error('NodejsProvider.getSemgrepLanguages not yet implemented (story 10-2)');
  }

  parseTestOutput(_output: string): TestCounts {
    throw new Error('NodejsProvider.parseTestOutput not yet implemented (story 10-2)');
  }

  parseCoverageReport(_dir: string): number {
    throw new Error('NodejsProvider.parseCoverageReport not yet implemented (story 10-2)');
  }

  getProjectName(_dir: string): string | null {
    throw new Error('NodejsProvider.getProjectName not yet implemented (story 10-2)');
  }
}
