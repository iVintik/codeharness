import { execFileSync } from 'node:child_process';

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

export interface RemoteEndpointCheckResult {
  reachable: boolean;
  error?: string;
}

export function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['--version'], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    // IGNORE: docker CLI not available
    return false;
  }
}

export function isDockerComposeAvailable(): boolean {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    // IGNORE: docker compose not available
    return false;
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
    // IGNORE: docker compose ps failed, report all services as down
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
    // IGNORE: collector health check failed, report as unhealthy
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
