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

    const r = generateDockerfileTemplate('/project', 'java');
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

// ─── Rust template ──────────────────────────────────────────────────────────

describe('generateDockerfileTemplate — rust', () => {
  it('returns stack: rust and correct path', () => {
    mockExistsSync.mockReturnValue(false);

    const r = generateDockerfileTemplate('/project', 'rust');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.path).toBe(join('/project', 'Dockerfile'));
      expect(r.data.stack).toBe('rust');
    }
  });

  it('contains FROM rust:1.82-slim AS builder and FROM debian:bookworm-slim', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM rust:1.82-slim AS builder');
    expect(written).toContain('FROM debian:bookworm-slim');
  });

  it('includes cargo build --release in builder stage', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('cargo build --release');
  });

  it('includes COPY --from=builder to copy compiled binary', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('COPY --from=builder');
  });

  it('includes curl and jq verification tools', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('curl');
    expect(written).toContain('jq');
  });

  it('includes USER nobody for non-root execution', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('USER nobody');
  });

  it('includes apt cache cleanup', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('rm -rf /var/lib/apt/lists/*');
  });

  it('includes inline section comments', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('# Build');
    expect(written).toContain('# System utilities');
    expect(written).toContain('# Install');
    expect(written).toContain('# Run as non-root');
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

  it('rust template passes all 6 rule categories', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');
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

// ─── Multi-stage Dockerfile generation ──────────────────────────────────────

import type { StackDetection } from '../../../lib/stacks/index.js';

describe('generateDockerfileTemplate — multi-stage (nodejs+rust)', () => {
  const detections: StackDetection[] = [
    { stack: 'nodejs', dir: '.' },
    { stack: 'rust', dir: 'services/backend' },
  ];

  it('produces FROM node:22-slim AS build-nodejs and FROM rust:1.82-slim AS build-rust', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(true);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM node:22-slim AS build-nodejs');
    expect(written).toContain('FROM rust:1.82-slim AS build-rust');
  });

  it('produces combined FROM debian:bookworm-slim runtime stage', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM debian:bookworm-slim');
  });

  it('contains COPY --from=build-nodejs and COPY --from=build-rust', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('COPY --from=build-nodejs');
    expect(written).toContain('COPY --from=build-rust');
  });

  it('runtime stage has curl, jq, USER nobody, WORKDIR /workspace', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('curl');
    expect(written).toContain('jq');
    expect(written).toContain('USER nobody');
    expect(written).toContain('WORKDIR /workspace');
  });

  it('returns stacks array with both stacks', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stacks).toEqual(['nodejs', 'rust']);
      expect(r.data.stack).toBe('nodejs');
    }
  });

  it('each build stage is named build-{stack}', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('AS build-nodejs');
    expect(written).toContain('AS build-rust');
  });

  it('includes section comments for build stages and runtime', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('# === Build stage: nodejs ===');
    expect(written).toContain('# === Build stage: rust ===');
    expect(written).toContain('# === Runtime stage ===');
  });
});

describe('generateDockerfileTemplate — multi-stage (3 stacks: nodejs+python+rust)', () => {
  const detections: StackDetection[] = [
    { stack: 'nodejs', dir: '.' },
    { stack: 'python', dir: 'services/ml' },
    { stack: 'rust', dir: 'services/core' },
  ];

  it('all 3 build stages present', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM node:22-slim AS build-nodejs');
    expect(written).toContain('FROM python:3.12-slim AS build-python');
    expect(written).toContain('FROM rust:1.82-slim AS build-rust');
  });

  it('runtime stage copies from all 3 build stages', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', detections);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('COPY --from=build-nodejs');
    expect(written).toContain('COPY --from=build-python');
    expect(written).toContain('COPY --from=build-rust');
  });

  it('returns stacks array with all 3', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stacks).toEqual(['nodejs', 'python', 'rust']);
    }
  });
});

describe('generateDockerfileTemplate — single-stack StackDetection[] backward compat', () => {
  it('single nodejs detection produces identical output to string arg', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'nodejs');
    const stringOutput = mockWriteFileSync.mock.calls[0][1] as string;

    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    const detections: StackDetection[] = [{ stack: 'nodejs', dir: '.' }];
    generateDockerfileTemplate('/project', detections);
    const arrayOutput = mockWriteFileSync.mock.calls[0][1] as string;

    expect(arrayOutput).toBe(stringOutput);
  });

  it('single rust detection produces identical output to string arg', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'rust');
    const stringOutput = mockWriteFileSync.mock.calls[0][1] as string;

    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    const detections: StackDetection[] = [{ stack: 'rust', dir: '.' }];
    generateDockerfileTemplate('/project', detections);
    const arrayOutput = mockWriteFileSync.mock.calls[0][1] as string;

    expect(arrayOutput).toBe(stringOutput);
  });

  it('single python detection produces identical output to string arg', () => {
    mockExistsSync.mockReturnValue(false);
    generateDockerfileTemplate('/project', 'python');
    const stringOutput = mockWriteFileSync.mock.calls[0][1] as string;

    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    const detections: StackDetection[] = [{ stack: 'python', dir: '.' }];
    generateDockerfileTemplate('/project', detections);
    const arrayOutput = mockWriteFileSync.mock.calls[0][1] as string;

    expect(arrayOutput).toBe(stringOutput);
  });
});

describe('generateDockerfileTemplate — backward-compat string argument', () => {
  it('string argument still works after signature change', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', 'nodejs');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stack).toBe('nodejs');
      expect(r.data.stacks).toEqual(['nodejs']);
    }
  });

  it('null argument still works after signature change', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', null);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stack).toBe('generic');
      expect(r.data.stacks).toEqual(['generic']);
    }
  });
});

describe('multi-stage Dockerfile passes validateDockerfile()', () => {
  it('nodejs+rust multi-stage passes all 6 rule categories', () => {
    mockExistsSync.mockReturnValue(false);
    const detections: StackDetection[] = [
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: 'services/backend' },
    ];
    generateDockerfileTemplate('/project', detections);
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

  it('nodejs+python+rust multi-stage passes all 6 rule categories', () => {
    mockExistsSync.mockReturnValue(false);
    const detections: StackDetection[] = [
      { stack: 'nodejs', dir: '.' },
      { stack: 'python', dir: 'services/ml' },
      { stack: 'rust', dir: 'services/core' },
    ];
    generateDockerfileTemplate('/project', detections);
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

describe('generateDockerfileTemplate — multi-stage error handling', () => {
  it('returns fail when writeFileSync throws on multi-stage', () => {
    mockExistsSync.mockReturnValue(false);
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const detections: StackDetection[] = [
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: 'services/backend' },
    ];
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('Failed to write Dockerfile');
    }
  });

  it('returns fail when Dockerfile already exists for multi-stage', () => {
    mockExistsSync.mockReturnValue(true);

    const detections: StackDetection[] = [
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: 'services/backend' },
    ];
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBe('Dockerfile already exists');
    }
  });

  it('empty StackDetection[] falls through to generic template', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', []);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stack).toBe('generic');
    }
  });

  it('multi-stage with all unknown stacks falls back to generic template', () => {
    mockExistsSync.mockReturnValue(false);
    const detections = [
      { stack: 'java' as StackDetection['stack'], dir: 'svc/a' },
      { stack: 'go' as StackDetection['stack'], dir: 'svc/b' },
    ];
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(true);
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    // Should fall back to generic template content
    expect(written).toContain('FROM node:22-slim');
    expect(written).toContain('placeholder');
  });

  it('multi-stage with mix of known and unknown stacks only generates known stages', () => {
    mockExistsSync.mockReturnValue(false);
    const detections = [
      { stack: 'nodejs' as StackDetection['stack'], dir: '.' },
      { stack: 'java' as StackDetection['stack'], dir: 'svc/api' },
      { stack: 'rust' as StackDetection['stack'], dir: 'svc/core' },
    ];
    const r = generateDockerfileTemplate('/project', detections);
    expect(r.success).toBe(true);
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('FROM node:22-slim AS build-nodejs');
    expect(written).toContain('FROM rust:1.82-slim AS build-rust');
    // No java build stage
    expect(written).not.toContain('build-java');
  });
});
