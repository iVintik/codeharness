import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { validateDockerfile, loadRules } from '../dockerfile-validator.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: build a Dockerfile string that passes all rules
function goodDockerfile(): string {
  return [
    'FROM node:22-slim',
    'RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*',
    'RUN npm install -g codeharness',
    'COPY dist/ /app/dist/',
    'USER node',
    'CMD ["codeharness"]',
  ].join('\n');
}

// ─── Pinned FROM ────────────────────────────────────────────────────────────

describe('pinned FROM', () => {
  it('passes for node:22-slim', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const fromGaps = r.data.gaps.filter(g => g.rule === 'pinned-from');
      expect(fromGaps).toHaveLength(0);
    }
  });

  it('fails for node:latest', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      goodDockerfile().replace('FROM node:22-slim', 'FROM node:latest'),
    );

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const fromGaps = r.data.gaps.filter(g => g.rule === 'pinned-from');
      expect(fromGaps.length).toBeGreaterThan(0);
      expect(fromGaps[0].description).toContain('unpinned base image');
    }
  });

  it('passes for digest-pinned image', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      goodDockerfile().replace('FROM node:22-slim', 'FROM node@sha256:abc123def456'),
    );

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const fromGaps = r.data.gaps.filter(g => g.rule === 'pinned-from');
      expect(fromGaps).toHaveLength(0);
    }
  });

  it('fails for node (no tag)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      goodDockerfile().replace('FROM node:22-slim', 'FROM node'),
    );

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const fromGaps = r.data.gaps.filter(g => g.rule === 'pinned-from');
      expect(fromGaps.length).toBeGreaterThan(0);
      expect(fromGaps[0].description).toContain('unpinned base image');
    }
  });
});

// ─── Project binary on PATH ─────────────────────────────────────────────────

describe('project binary on PATH', () => {
  it('passes with npm install -g', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const binGaps = r.data.gaps.filter(g => g.rule === 'binary-on-path');
      expect(binGaps).toHaveLength(0);
    }
  });

  it('passes with pip install', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('RUN npm install -g codeharness', 'RUN pip install myapp');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const binGaps = r.data.gaps.filter(g => g.rule === 'binary-on-path');
      expect(binGaps).toHaveLength(0);
    }
  });

  it('passes with COPY --from (multi-stage)', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('RUN npm install -g codeharness', 'COPY --from=builder /app/dist/bin /usr/local/bin/myapp');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const binGaps = r.data.gaps.filter(g => g.rule === 'binary-on-path');
      expect(binGaps).toHaveLength(0);
    }
  });

  it('fails when no binary install pattern found', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('RUN npm install -g codeharness', 'RUN echo hello');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const binGaps = r.data.gaps.filter(g => g.rule === 'binary-on-path');
      expect(binGaps).toHaveLength(1);
      expect(binGaps[0].description).toContain('project binary not installed');
    }
  });
});

// ─── Verification tools ─────────────────────────────────────────────────────

describe('verification tools', () => {
  it('passes when curl and jq are installed', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const toolGaps = r.data.gaps.filter(g => g.rule === 'verification-tools');
      expect(toolGaps).toHaveLength(0);
    }
  });

  it('fails when curl is missing', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('curl jq', 'jq');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const toolGaps = r.data.gaps.filter(g => g.rule === 'verification-tools');
      expect(toolGaps.some(g => g.description.includes('curl'))).toBe(true);
    }
  });

  it('fails when jq is missing', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('curl jq', 'curl');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const toolGaps = r.data.gaps.filter(g => g.rule === 'verification-tools');
      expect(toolGaps.some(g => g.description.includes('jq'))).toBe(true);
    }
  });

  it('passes when tools installed via apk add', () => {
    mockExistsSync.mockReturnValue(true);
    const df = [
      'FROM node:22-alpine',
      'RUN apk add --no-cache curl jq && rm -rf /var/cache/apk/*',
      'RUN npm install -g codeharness',
      'COPY dist/ /app/dist/',
      'USER node',
      'CMD ["codeharness"]',
    ].join('\n');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const toolGaps = r.data.gaps.filter(g => g.rule === 'verification-tools');
      expect(toolGaps).toHaveLength(0);
    }
  });

  it('does not false-positive on tool substring in non-install line', () => {
    mockExistsSync.mockReturnValue(true);
    const df = [
      'FROM node:22-slim',
      'RUN apt-get update && apt-get install -y vim && rm -rf /var/lib/apt/lists/*',
      'RUN echo curl is great',
      'RUN npm install -g codeharness',
      'USER node',
    ].join('\n');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const toolGaps = r.data.gaps.filter(g => g.rule === 'verification-tools');
      expect(toolGaps.some(g => g.description.includes('curl'))).toBe(true);
      expect(toolGaps.some(g => g.description.includes('jq'))).toBe(true);
    }
  });

  it('does not false-positive on partial word match like curlpp', () => {
    mockExistsSync.mockReturnValue(true);
    const df = [
      'FROM node:22-slim',
      'RUN apt-get update && apt-get install -y curlpp && rm -rf /var/lib/apt/lists/*',
      'RUN npm install -g codeharness',
      'USER node',
    ].join('\n');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const toolGaps = r.data.gaps.filter(g => g.rule === 'verification-tools');
      expect(toolGaps.some(g => g.description.includes('curl'))).toBe(true);
    }
  });
});

// ─── No source code COPY ────────────────────────────────────────────────────

describe('no source code COPY', () => {
  it('passes when no source dirs copied', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const copyGaps = r.data.gaps.filter(g => g.rule === 'no-source-copy');
      expect(copyGaps).toHaveLength(0);
    }
  });

  it('fails for COPY src/', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile() + '\nCOPY src/ /app/src/';
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const copyGaps = r.data.gaps.filter(g => g.rule === 'no-source-copy');
      expect(copyGaps.length).toBeGreaterThan(0);
      expect(copyGaps[0].description).toContain('source code copied into container');
    }
  });

  it('fails for COPY lib/', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile() + '\nCOPY lib/ /app/lib/';
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const copyGaps = r.data.gaps.filter(g => g.rule === 'no-source-copy');
      expect(copyGaps.length).toBeGreaterThan(0);
    }
  });

  it('fails for COPY with --chown flag and src/', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile() + '\nCOPY --chown=node:node src/ /app/src/';
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const copyGaps = r.data.gaps.filter(g => g.rule === 'no-source-copy');
      expect(copyGaps.length).toBeGreaterThan(0);
      expect(copyGaps[0].description).toContain('source code copied into container');
    }
  });

  it('fails for COPY test/', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile() + '\nCOPY test/ /app/test/';
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const copyGaps = r.data.gaps.filter(g => g.rule === 'no-source-copy');
      expect(copyGaps.length).toBeGreaterThan(0);
    }
  });
});

// ─── Non-root USER ──────────────────────────────────────────────────────────

describe('non-root USER', () => {
  it('passes with USER node', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const userGaps = r.data.gaps.filter(g => g.rule === 'non-root-user');
      expect(userGaps).toHaveLength(0);
    }
  });

  it('fails when no USER instruction', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('USER node\n', '');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const userGaps = r.data.gaps.filter(g => g.rule === 'non-root-user');
      expect(userGaps).toHaveLength(1);
      expect(userGaps[0].description).toContain('no non-root USER instruction found');
    }
  });

  it('fails when only USER root', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('USER node', 'USER root');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const userGaps = r.data.gaps.filter(g => g.rule === 'non-root-user');
      expect(userGaps).toHaveLength(1);
    }
  });
});

// ─── Cache cleanup ──────────────────────────────────────────────────────────

describe('cache cleanup', () => {
  it('passes with apt cache cleanup', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const cacheGaps = r.data.gaps.filter(g => g.rule === 'cache-cleanup');
      expect(cacheGaps).toHaveLength(0);
    }
  });

  it('passes with npm cache clean', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('rm -rf /var/lib/apt/lists/*', 'npm cache clean --force');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const cacheGaps = r.data.gaps.filter(g => g.rule === 'cache-cleanup');
      expect(cacheGaps).toHaveLength(0);
    }
  });

  it('passes with pip cache purge', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('rm -rf /var/lib/apt/lists/*', 'pip cache purge');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const cacheGaps = r.data.gaps.filter(g => g.rule === 'cache-cleanup');
      expect(cacheGaps).toHaveLength(0);
    }
  });

  it('passes with apk cache cleanup', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace('rm -rf /var/lib/apt/lists/*', 'rm -rf /var/cache/apk/*');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const cacheGaps = r.data.gaps.filter(g => g.rule === 'cache-cleanup');
      expect(cacheGaps).toHaveLength(0);
    }
  });

  it('fails when no cache cleanup', () => {
    mockExistsSync.mockReturnValue(true);
    const df = goodDockerfile().replace(' && rm -rf /var/lib/apt/lists/*', '');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const cacheGaps = r.data.gaps.filter(g => g.rule === 'cache-cleanup');
      expect(cacheGaps).toHaveLength(1);
      expect(cacheGaps[0].description).toContain('no cache cleanup detected');
    }
  });
});

// ─── All-passing Dockerfile ─────────────────────────────────────────────────

describe('all-passing Dockerfile', () => {
  it('returns passed: true when all rules satisfied', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passed).toBe(true);
      expect(r.data.gaps).toHaveLength(0);
    }
  });
});

// ─── Missing rules file ────────────────────────────────────────────────────

describe('missing rules file', () => {
  it('uses defaults with warning when dockerfile-rules.md not found', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('dockerfile-rules.md')) return false;
      return true; // Dockerfile exists
    });
    mockReadFileSync.mockReturnValue(goodDockerfile());

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.warnings).toContain('dockerfile-rules.md not found -- using defaults.');
    }
  });

  it('loadRules returns defaults with warning when rules file missing', () => {
    mockExistsSync.mockReturnValue(false);

    const { rules, warnings } = loadRules('/project');
    expect(rules.requirePinnedFrom).toBe(true);
    expect(rules.verificationTools).toEqual(['curl', 'jq']);
    expect(warnings).toContain('dockerfile-rules.md not found -- using defaults.');
  });

  it('loadRules returns no warning when rules file exists', () => {
    mockExistsSync.mockReturnValue(true);

    const { warnings } = loadRules('/project');
    expect(warnings).toHaveLength(0);
  });
});

// ─── Missing Dockerfile ────────────────────────────────────────────────────

describe('missing Dockerfile', () => {
  it('returns fail result when no Dockerfile', () => {
    mockExistsSync.mockReturnValue(false);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('No Dockerfile found');
    }
  });
});

// ─── Unreadable Dockerfile ──────────────────────────────────────────────────

describe('unreadable Dockerfile', () => {
  it('returns fail result when Dockerfile cannot be read', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const r = validateDockerfile('/project');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('could not be read');
    }
  });
});

// ─── No FROM instruction ───────────────────────────────────────────────────

describe('no FROM instruction', () => {
  it('returns fail result', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('RUN echo hello\n');

    const r = validateDockerfile('/project');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain('no FROM instruction');
    }
  });
});

// ─── Line numbers ──────────────────────────────────────────────────────────

describe('line numbers', () => {
  it('includes line number for pinned FROM gap', () => {
    mockExistsSync.mockReturnValue(true);
    const df = [
      '# comment',
      'FROM node:latest',
      'RUN npm install -g codeharness',
      'RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*',
      'USER node',
    ].join('\n');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const fromGap = r.data.gaps.find(g => g.rule === 'pinned-from');
      expect(fromGap?.line).toBe(2);
    }
  });

  it('includes line number for source copy gap', () => {
    mockExistsSync.mockReturnValue(true);
    const df = [
      'FROM node:22-slim',
      'RUN npm install -g codeharness',
      'RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/*',
      'COPY src/ /app/src/',
      'USER node',
    ].join('\n');
    mockReadFileSync.mockReturnValue(df);

    const r = validateDockerfile('/project');
    expect(r.success).toBe(true);
    if (r.success) {
      const copyGap = r.data.gaps.find(g => g.rule === 'no-source-copy');
      expect(copyGap?.line).toBe(4);
    }
  });
});
