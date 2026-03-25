import { renderTemplateFile } from '../lib/templates.js';

export interface DockerComposeConfig {
  shared: boolean;
}

export function dockerComposeCollectorOnlyTemplate(): string {
  return renderTemplateFile('templates/compose/collector-only.yml');
}

export function dockerComposeTemplate(_config: DockerComposeConfig): string {
  return renderTemplateFile('templates/compose/victoria.yml');
}
