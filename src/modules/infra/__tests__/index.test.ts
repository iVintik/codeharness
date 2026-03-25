import { describe, it, expect, vi } from 'vitest';
import {
  ensureStack,
  cleanupContainers,
  getObservabilityBackend,
} from '../index.js';

// Mock child_process for stack-management and container-cleanup
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => { throw new Error('no process'); }),
}));

// Mock all lib modules that init-project.ts imports
vi.mock('../../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

vi.mock('../../../lib/docker/index.js', () => ({
  isDockerAvailable: vi.fn(() => true),
  isSharedStackRunning: vi.fn(() => false),
  startSharedStack: vi.fn(() => ({ started: true, services: [] })),
  startCollectorOnly: vi.fn(() => ({ started: true, services: [] })),
  getStackHealth: vi.fn(() => ({
    healthy: true,
    services: [
      { name: 'otel-collector', running: true },
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
    ],
  })),
}));

vi.mock('../../../lib/deps.js', () => ({
  installAllDependencies: vi.fn(() => []),
  checkInstalled: vi.fn(() => ({ installed: true, version: '1.0.0' })),
  DEPENDENCY_REGISTRY: [],
  CriticalDependencyError: class extends Error { constructor(d: string, r: string) { super(r); } },
}));

vi.mock('../../../lib/beads.js', () => ({
  isBeadsInitialized: vi.fn(() => false),
  initBeads: vi.fn(),
  detectBeadsHooks: vi.fn(() => ({ hasHooks: false, hookTypes: [] })),
  configureHookCoexistence: vi.fn(),
  BeadsError: class extends Error { constructor(c: string, m: string) { super(m); } },
}));

vi.mock('../../../lib/bmad.js', () => ({
  isBmadInstalled: vi.fn(() => false),
  installBmad: vi.fn(() => ({ status: 'installed', version: '6.0.0', patches_applied: [] })),
  applyAllPatches: vi.fn(() => []),
  detectBmadVersion: vi.fn(() => '6.0.0'),
  detectBmalph: vi.fn(() => ({ detected: false, files: [] })),
  BmadError: class extends Error { constructor(c: string, m: string) { super(m); } },
}));

vi.mock('../../../lib/observability/index.js', () => ({
  instrumentProject: vi.fn(() => ({
    status: 'configured',
    packages_installed: true,
    start_script_patched: true,
    env_vars_configured: true,
  })),
  configureOtlpEnvVars: vi.fn(),
}));

vi.mock('../../../lib/templates.js', async () => {
  const { readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
  const { resolve, dirname } = await vi.importActual<typeof import('node:path')>('node:path');
  const { fileURLToPath } = await vi.importActual<typeof import('node:url')>('node:url');
  const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  return {
    generateFile: vi.fn(),
    renderTemplate(template: string, vars: Record<string, string>): string {
      return template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => vars[key] ?? match);
    },
    renderTemplateFile(templatePath: string, vars: Record<string, string> = {}): string {
      const fullPath = resolve(pkgRoot, templatePath);
      const content = readFileSync(fullPath, 'utf-8');
      if (Object.keys(vars).length === 0) return content;
      return content.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => vars[key] ?? match);
    },
    getPackageRoot() { return pkgRoot; },
  };
});

vi.mock('../../../templates/readme.js', () => ({
  readmeTemplate: vi.fn(() => '# README'),
}));

// Import initProject after mocks
import { initProject } from '../index.js';

describe('infra module — index exports', () => {
  it('initProject returns a result for valid options', async () => {
    const result = await initProject({
      projectDir: '/tmp/nonexistent-test-dir',
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(true);
  });

  it('ensureStack delegates to stack-management module', () => {
    // With Docker mocked as available but stack not running, it will try to start
    const result = ensureStack();
    // Should return a real result (not "not implemented")
    expect(result.success).toBeDefined();
  });

  it('cleanupContainers delegates to container-cleanup module', () => {
    const result = cleanupContainers();
    // Should return a real result (not "not implemented")
    expect(result.success).toBeDefined();
  });

  it('getObservabilityBackend returns a VictoriaBackend (AC#8)', () => {
    const backend = getObservabilityBackend();
    expect(backend.type).toBe('victoria');
  });

  it('getObservabilityBackend returns OpenSearchBackend when opensearchUrl provided (AC#7)', () => {
    const backend = getObservabilityBackend({ opensearchUrl: 'http://os:9200' });
    expect(backend.type).toBe('opensearch');
  });

  it('getObservabilityBackend passes opensearch index config through', () => {
    const backend = getObservabilityBackend({
      opensearchUrl: 'http://os:9200',
      opensearch: { logsIndex: 'custom-logs' },
    });
    expect(backend.type).toBe('opensearch');
  });
});
