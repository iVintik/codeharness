import { Command } from 'commander';
import { jsonOutput } from '../lib/output.js';
import { initProject } from '../modules/infra/index.js';
import type { AgentRuntime } from '../modules/infra/index.js';
import { isOk } from '../types/result.js';

// Re-export helpers for backward compatibility (used by existing tests)
export {
  generateAgentsMdContent,
  generateDocsIndexContent,
  getCoverageTool,
  getStackLabel,
  getProjectName,
} from '../modules/infra/index.js';

interface CommandInitOptions {
  agentRuntime?: AgentRuntime;
  opencode?: boolean;
  frontend: boolean;
  database: boolean;
  api: boolean;
  observability: boolean;
  force: boolean;
  observabilityBackend?: string;
  otelEndpoint?: string;
  opensearchUrl?: string;
  logsUrl?: string;
  metricsUrl?: string;
  tracesUrl?: string;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize the harness in a project')
    .option('--agent-runtime <runtime>', 'Agent runtime: claude-code or opencode')
    .option('--opencode', 'Shortcut for --agent-runtime opencode', false)
    .option('--no-frontend', 'Disable frontend enforcement')
    .option('--no-database', 'Disable database enforcement')
    .option('--no-api', 'Disable API enforcement')
    .option('--no-observability', 'Skip OTLP package installation')
    .option('--force', 'Overwrite existing generated files', false)
    .option('--observability-backend <type>', 'Observability backend: victoria, elk, or none (default: victoria)')
    .option('--otel-endpoint <url>', 'Remote OTLP endpoint (skips local Docker stack)')
    .option('--opensearch-url <url>', 'Remote OpenSearch URL (skips local Docker stack)')
    .option('--logs-url <url>', 'Remote VictoriaLogs URL')
    .option('--metrics-url <url>', 'Remote VictoriaMetrics URL')
    .option('--traces-url <url>', 'Remote Jaeger/VictoriaTraces URL')
    .action(async (options: CommandInitOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;
      const agentRuntime = options.opencode ? 'opencode' : options.agentRuntime;

      const result = await initProject({
        projectDir: process.cwd(),
        agentRuntime,
        frontend: options.frontend,
        database: options.database,
        api: options.api,
        observability: options.observability,
        force: options.force,
        observabilityBackend: options.observabilityBackend as 'victoria' | 'elk' | 'none' | undefined,
        otelEndpoint: options.otelEndpoint,
        opensearchUrl: options.opensearchUrl,
        logsUrl: options.logsUrl,
        metricsUrl: options.metricsUrl,
        tracesUrl: options.tracesUrl,
        json: isJson,
      });

      if (!isOk(result)) {
        if (isJson) {
          jsonOutput({ status: 'fail', error: result.error });
        }
        process.exitCode = 1;
      }
    });
}
