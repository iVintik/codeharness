import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { getComposeFilePath, getOtelConfigPath, ensureStackDir } from './stack-path.js';
import { dockerComposeTemplate, dockerComposeCollectorOnlyTemplate } from '../templates/docker-compose.js';
import { otelCollectorConfigTemplate, otelCollectorRemoteTemplate } from '../templates/otel-config.js';

export interface DockerServiceStatus {
  name: string;
  status: string;
  port: string;
}

export interface DockerStartResult {
  started: boolean;
  services: DockerServiceStatus[];
  error?: string;
}

export interface DockerHealthService {
  name: string;
  running: boolean;
}

export interface DockerHealthResult {
  healthy: boolean;
  services: DockerHealthService[];
  remedy?: string;
}

export function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['--version'], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export function isDockerComposeAvailable(): boolean {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

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

export interface RemoteEndpointCheckResult {
  reachable: boolean;
  error?: string;
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

export function getCollectorHealth(composeFile: string): DockerHealthResult {
  const expectedServices = ['otel-collector'];

  try {
    const output = execFileSync('docker', ['compose', '-p', 'codeharness-collector', '-f', composeFile, 'ps', '--format', 'json'], {
      stdio: 'pipe',
      timeout: 15_000,
    });
    const text = output.toString().trim();
    const runningNames = new Set<string>();

    if (text) {
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const svc = JSON.parse(line) as { Service?: string; State?: string };
        if (svc.State === 'running' && svc.Service) {
          runningNames.add(svc.Service);
        }
      }
    }

    const services: DockerHealthService[] = expectedServices.map(name => ({
      name,
      running: runningNames.has(name),
    }));

    const healthy = services.every(s => s.running);

    return {
      healthy,
      services,
      remedy: healthy ? undefined : `Restart: docker compose -p codeharness-collector -f ${composeFile} up -d`,
    };
  } catch {
    const services: DockerHealthService[] = expectedServices.map(name => ({
      name,
      running: false,
    }));

    return {
      healthy: false,
      services,
      remedy: `Restart: docker compose -p codeharness-collector -f ${composeFile} up -d`,
    };
  }
}

export async function checkRemoteEndpoint(url: string): Promise<RemoteEndpointCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(url, { signal: controller.signal });
      return { reachable: true };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, error: message };
  }
}

export function getStackHealth(composeFile: string, projectName?: string): DockerHealthResult {
  const expectedServices = ['victoria-logs', 'victoria-metrics', 'victoria-traces', 'otel-collector'];

  try {
    const args = projectName
      ? ['compose', '-p', projectName, '-f', composeFile, 'ps', '--format', 'json']
      : ['compose', '-f', composeFile, 'ps', '--format', 'json'];

    const output = execFileSync('docker', args, {
      stdio: 'pipe',
      timeout: 15_000,
    });
    const text = output.toString().trim();
    const runningNames = new Set<string>();

    if (text) {
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const svc = JSON.parse(line) as { Service?: string; State?: string };
        if (svc.State === 'running' && svc.Service) {
          runningNames.add(svc.Service);
        }
      }
    }

    const services: DockerHealthService[] = expectedServices.map(name => ({
      name,
      running: runningNames.has(name),
    }));

    const healthy = services.every(s => s.running);
    const remedyCmd = projectName
      ? `docker compose -p ${projectName} -f ${composeFile} up -d`
      : `docker compose -f ${composeFile} up -d`;

    return {
      healthy,
      services,
      remedy: healthy ? undefined : `Restart: ${remedyCmd}`,
    };
  } catch {
    const remedyCmd = projectName
      ? `docker compose -p ${projectName} -f ${composeFile} up -d`
      : `docker compose -f ${composeFile} up -d`;

    const services: DockerHealthService[] = expectedServices.map(name => ({
      name,
      running: false,
    }));

    return {
      healthy: false,
      services,
      remedy: `Restart: ${remedyCmd}`,
    };
  }
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
    return [];
  }
}
