import { renderTemplateFile } from '../lib/templates.js';

export interface RemoteOtelConfig {
  logsUrl: string;
  metricsUrl: string;
  tracesUrl: string;
}

export function otelCollectorRemoteTemplate(config: RemoteOtelConfig): string {
  // Strip trailing slashes to avoid double-slash in constructed URLs
  const logsUrl = config.logsUrl.replace(/\/+$/, '');
  const metricsUrl = config.metricsUrl.replace(/\/+$/, '');
  const tracesUrl = config.tracesUrl.replace(/\/+$/, '');

  return renderTemplateFile('templates/compose/otel-collector-remote.yaml', {
    LOGS_URL: logsUrl,
    METRICS_URL: metricsUrl,
    TRACES_URL: tracesUrl,
  });
}

export function otelCollectorConfigWithCors(): string {
  // Derive from the base template to avoid duplication drift.
  // Inject the CORS block into the HTTP receiver section.
  const base = otelCollectorConfigTemplate();
  const corsBlock = `        cors:
          allowed_origins:
            - "http://localhost:*"
            - "http://127.0.0.1:*"
          allowed_headers:
            - "*"`;

  // Insert CORS after the "endpoint: 0.0.0.0:4318" line in the http receiver
  return base.replace(
    /^( {8}endpoint: 0\.0\.0\.0:4318)$/m,
    `$1\n${corsBlock}`,
  );
}

export function otelCollectorConfigTemplate(): string {
  return renderTemplateFile('templates/compose/otel-collector-base.yaml');
}
