import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';

export function getStackDir(): string {
  const xdgDataHome = process.env['XDG_DATA_HOME'];
  if (xdgDataHome && xdgDataHome.trim() !== '' && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, 'codeharness', 'stack');
  }
  return join(homedir(), '.codeharness', 'stack');
}

export function getComposeFilePath(): string {
  return join(getStackDir(), 'docker-compose.harness.yml');
}

export function getElkComposeFilePath(): string {
  return join(getStackDir(), 'docker-compose.elk.yml');
}

export function getOtelConfigPath(): string {
  return join(getStackDir(), 'otel-collector-config.yaml');
}

export function ensureStackDir(): void {
  mkdirSync(getStackDir(), { recursive: true });
}
