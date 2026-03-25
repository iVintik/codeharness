import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { getComposeFilePath, getOtelConfigPath, ensureStackDir } from '../stack-path.js';
import { dockerComposeTemplate, dockerComposeCollectorOnlyTemplate } from '../../templates/docker-compose.js';
import { otelCollectorConfigTemplate, otelCollectorRemoteTemplate } from '../../templates/otel-config.js';
import type { DockerServiceStatus, DockerStartResult } from './health.js';

export function isStackRunning(composeFile: string): boolean {
  try {
    const output = execFileSync('docker', ['compose', '-f', composeFile, 'ps', '--format', 'json'], {
      stdio: 'pipe',
      timeout: 15_000,
    });
    const text = output.toString().trim();
    if (!text) return false;

    // docker compose ps --format json outputs one JSON object per line
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const svc = JSON.parse(line) as { State?: string };
      if (svc.State !== 'running') return false;
    }
    return lines.length > 0;
  } catch {
    // IGNORE: docker compose check failed, stack not running
    return false;
  }
}

export function isSharedStackRunning(): boolean {
  try {
    const composeFile = getComposeFilePath();
    const output = execFileSync('docker', ['compose', '-p', 'codeharness-shared', '-f', composeFile, 'ps', '--format', 'json'], {
      stdio: 'pipe',
      timeout: 15_000,
    });
    const text = output.toString().trim();
    if (!text) return false;

    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const svc = JSON.parse(line) as { State?: string };
      if (svc.State !== 'running') return false;
    }
    return lines.length > 0;
  } catch {
    // IGNORE: docker compose check failed, shared stack not running
    return false;
  }
}

export function startStack(composeFile: string): DockerStartResult {
  try {
    execFileSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
      stdio: 'pipe',
      timeout: 30_000,
    });

    const services = getRunningServices(composeFile);
    return {
      started: true,
      services,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      started: false,
      services: [],
      error: message,
    };
  }
}

export function startSharedStack(): DockerStartResult {
  try {
    ensureStackDir();

    const composeFile = getComposeFilePath();
    const otelConfigFile = getOtelConfigPath();

    const composeContent = dockerComposeTemplate({ shared: true });
    writeFileSync(composeFile, composeContent, 'utf-8');

    const otelContent = otelCollectorConfigTemplate();
    writeFileSync(otelConfigFile, otelContent, 'utf-8');

    execFileSync('docker', ['compose', '-p', 'codeharness-shared', '-f', composeFile, 'up', '-d'], {
      stdio: 'pipe',
      timeout: 30_000,
    });

    const services = getRunningServices(composeFile, 'codeharness-shared');
    return {
      started: true,
      services,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      started: false,
      services: [],
      error: message,
    };
  }
}

export function stopStack(composeFile: string): void {
  execFileSync('docker', ['compose', '-f', composeFile, 'down', '-v'], {
    stdio: 'pipe',
    timeout: 30_000,
  });
}

export function stopSharedStack(): void {
  const composeFile = getComposeFilePath();
  execFileSync('docker', ['compose', '-p', 'codeharness-shared', '-f', composeFile, 'down'], {
    stdio: 'pipe',
    timeout: 30_000,
  });
}

export function startCollectorOnly(logsUrl: string, metricsUrl: string, tracesUrl: string): DockerStartResult {
  try {
    ensureStackDir();

    const composeFile = getComposeFilePath();
    const otelConfigFile = getOtelConfigPath();

    const composeContent = dockerComposeCollectorOnlyTemplate();
    writeFileSync(composeFile, composeContent, 'utf-8');

    const otelContent = otelCollectorRemoteTemplate({ logsUrl, metricsUrl, tracesUrl });
    writeFileSync(otelConfigFile, otelContent, 'utf-8');

    execFileSync('docker', ['compose', '-p', 'codeharness-collector', '-f', composeFile, 'up', '-d'], {
      stdio: 'pipe',
      timeout: 30_000,
    });

    const services = getRunningServices(composeFile, 'codeharness-collector');
    return {
      started: true,
      services,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      started: false,
      services: [],
      error: message,
    };
  }
}

export function isCollectorRunning(): boolean {
  try {
    const composeFile = getComposeFilePath();
    const output = execFileSync('docker', ['compose', '-p', 'codeharness-collector', '-f', composeFile, 'ps', '--format', 'json'], {
      stdio: 'pipe',
      timeout: 15_000,
    });
    const text = output.toString().trim();
    if (!text) return false;

    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const svc = JSON.parse(line) as { State?: string };
      if (svc.State !== 'running') return false;
    }
    return lines.length > 0;
  } catch {
    // IGNORE: collector status check failed, not running
    return false;
  }
}

export function stopCollectorOnly(): void {
  const composeFile = getComposeFilePath();
  execFileSync('docker', ['compose', '-p', 'codeharness-collector', '-f', composeFile, 'down'], {
    stdio: 'pipe',
    timeout: 30_000,
  });
}

function getRunningServices(composeFile: string, projectName?: string): DockerServiceStatus[] {
  try {
    const args = projectName
      ? ['compose', '-p', projectName, '-f', composeFile, 'ps', '--format', 'json']
      : ['compose', '-f', composeFile, 'ps', '--format', 'json'];

    const output = execFileSync('docker', args, {
      stdio: 'pipe',
      timeout: 15_000,
    });
    const text = output.toString().trim();
    if (!text) return [];

    const lines = text.split('\n').filter(l => l.trim());
    const services: DockerServiceStatus[] = [];
    for (const line of lines) {
      const svc = JSON.parse(line) as { Service?: string; State?: string; Publishers?: Array<{ PublishedPort?: number }> };
      const ports = (svc.Publishers ?? [])
        .filter(p => p.PublishedPort && p.PublishedPort > 0)
        .map(p => String(p.PublishedPort));
      services.push({
        name: svc.Service ?? 'unknown',
        status: svc.State ?? 'unknown',
        port: ports.join(','),
      });
    }
    return services;
  } catch {
    // IGNORE: docker compose ps failed, return empty service list
    return [];
  }
}
