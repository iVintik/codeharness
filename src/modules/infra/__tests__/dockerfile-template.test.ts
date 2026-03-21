import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDockerfileTemplate } from '../dockerfile-template.js';
import { validateDockerfile } from '../dockerfile-validator.js';

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── Node.js template ───────────────────────────────────────────────────────

describe('generateDockerfileTemplate — nodejs', () => {
  it('generates Dockerfile with pinned FROM node:22-slim', () => {
    mockExistsSync.mockReturnValue(false);

    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.path).toBe(join('/project', 'Dockerfile'));
      expect(r.data.stack).toBe('nodejs');
    }

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM node:22-slim');
  });

  it('includes npm install -g for binary installation', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('npm install -g');
  });

  it('includes curl and jq verification tools', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('curl');
    expect(written).toContain('jq');
  });

  it('includes USER node for non-root execution', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('USER node');
  });

  it('includes cache cleanup', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('rm -rf /var/lib/apt/lists/*');
  });

  it('includes inline section comments', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('# Base image');
    expect(written).toContain('# System utilities');
    expect(written).toContain('# Install project');
    expect(written).toContain('# Run as non-root');
  });
});

// ─── Python template ────────────────────────────────────────────────────────

describe('generateDockerfileTemplate — python', () => {
  it('generates Dockerfile with pinned FROM python:3.12-slim', () => {
    mockExistsSync.mockReturnValue(false);

    const r = generateDockerfileTemplate('/project', 'python');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.path).toBe(join('/project', 'Dockerfile'));
      expect(r.data.stack).toBe('python');
    }

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM python:3.12-slim');
  });

  it('includes pip install for binary installation', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('pip install');
  });

  it('includes curl and jq verification tools', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('curl');
    expect(written).toContain('jq');
  });

  it('includes USER nobody for non-root execution', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('USER nobody');
  });

  it('includes cache cleanup (apt + pip)', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('rm -rf /var/lib/apt/lists/*');
    expect(written).toContain('pip cache purge');
  });

  it('includes inline section comments', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('# Base image');
    expect(written).toContain('# System utilities');
    expect(written).toContain('# Install project');
    expect(written).toContain('# Run as non-root');
  });
});

// ─── Generic template ───────────────────────────────────────────────────────

describe('generateDockerfileTemplate — generic/null', () => {
  it('generates generic Dockerfile when stack is null', () => {
    mockExistsSync.mockReturnValue(false);

    const r = generateDockerfileTemplate('/project', null);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stack).toBe('generic');
    }

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM node:22-slim');
    expect(written).toContain('bash');
    expect(written).toContain('git');
  });

  it('generates generic Dockerfile when stack is unknown', () => {
    mockExistsSync.mockReturnValue(false);

    const r = generateDockerfileTemplate('/project', 'rust');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stack).toBe('generic');
    }
  });

  it('includes curl and jq in generic template', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', null);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('curl');
    expect(written).toContain('jq');
  });
});

// ─── Existing Dockerfile ────────────────────────────────────────────────────

describe('generateDockerfileTemplate — existing Dockerfile', () => {
  it('returns fail when Dockerfile already exists', () => {
    mockExistsSync.mockReturnValue(true);

    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBe('Dockerfile already exists');
    }
  });

  it('does not write any file when Dockerfile exists', () => {
    mockExistsSync.mockReturnValue(true);

    generateDockerfileTemplate('/project', 'nodejs');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ─── Error handling ─────────────────────────────────────────────────────────

describe('generateDockerfileTemplate — error handling', () => {
  it('returns fail when projectDir is empty string', () => {
    const r = generateDockerfileTemplate('', 'nodejs');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBe('projectDir is required');
    }
  });

  it('returns fail when writeFileSync throws', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('Failed to write Dockerfile');
      expect(r.error).toContain('EACCES');
    }
  });

  it('returns fail with stringified error for non-Error throws', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw 'disk full';
    });

    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('disk full');
    }
  });
});

// ─── Result<T> return type ──────────────────────────────────────────────────

describe('generateDockerfileTemplate — Result type', () => {
  it('returns Ok with path and stack on success', () => {
    mockExistsSync.mockReturnValue(false);

    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toHaveProperty('path');
      expect(r.data).toHaveProperty('stack');
      expect(typeof r.data.path).toBe('string');
      expect(typeof r.data.stack).toBe('string');
    }
  });

  it('returns Fail with error string on failure', () => {
    mockExistsSync.mockReturnValue(true);

    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(typeof r.error).toBe('string');
    }
  });
});

// ─── Validation compliance ──────────────────────────────────────────────────

describe('generated Dockerfiles pass validateDockerfile()', () => {
  it('nodejs template passes all 6 rule categories', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');
    const content = mockWriteFileSync.mock.calls[0][1] as string;

    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('Dockerfile')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(content);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passed).toBe(true);
      expect(r.data.gaps).toHaveLength(0);
    }
  });

  it('python template passes all 6 rule categories', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');
    const content = mockWriteFileSync.mock.calls[0][1] as string;

    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('Dockerfile')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(content);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passed).toBe(true);
      expect(r.data.gaps).toHaveLength(0);
    }
  });

  it('generic template passes all 6 rule categories', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', null);
    const content = mockWriteFileSync.mock.calls[0][1] as string;

    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('Dockerfile')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(content);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passed).toBe(true);
      expect(r.data.gaps).toHaveLength(0);
    }
  });
});
