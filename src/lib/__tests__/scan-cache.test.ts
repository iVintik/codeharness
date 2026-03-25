import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  saveScanCache,
  loadScanCache,
  isCacheValid,
  loadValidCache,
} from '../scan-cache.js';
import type { ScanCacheEntry } from '../scan-cache.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-scan-cache-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function makeCacheEntry(overrides: Partial<ScanCacheEntry> = {}): ScanCacheEntry {
  return {
    timestamp: new Date().toISOString(),
    scan: {
      modules: [{ path: 'src/lib', sourceFiles: 5, testFiles: 3 }],
      totalSourceFiles: 10,
      artifacts: { hasBmad: false, bmadPath: null },
    },
    coverage: null,
    audit: null,
    ...overrides,
  };
}

// ─── saveScanCache ──────────────────────────────────────────────────────────

describe('saveScanCache', () => {
  it('writes JSON file to .harness/last-onboard-scan.json', () => {
    const entry = makeCacheEntry();
    saveScanCache(entry, testDir);

    const cachePath = join(testDir, '.harness', 'last-onboard-scan.json');
    expect(existsSync(cachePath)).toBe(true);

    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(parsed.timestamp).toBe(entry.timestamp);
    expect(parsed.scan.totalSourceFiles).toBe(10);
  });

  it('creates .harness/ directory if missing', () => {
    expect(existsSync(join(testDir, '.harness'))).toBe(false);

    saveScanCache(makeCacheEntry(), testDir);

    expect(existsSync(join(testDir, '.harness'))).toBe(true);
  });

  it('does not throw when write fails (e.g. read-only directory)', () => {
    // Use a path that cannot be created to trigger a write failure
    const badDir = '/dev/null/impossible-path';
    expect(() => saveScanCache(makeCacheEntry(), badDir)).not.toThrow();
  });

  it('overwrites existing cache file', () => {
    saveScanCache(makeCacheEntry({ timestamp: '2026-01-01T00:00:00.000Z' }), testDir);
    saveScanCache(makeCacheEntry({ timestamp: '2026-02-01T00:00:00.000Z' }), testDir);

    const cachePath = join(testDir, '.harness', 'last-onboard-scan.json');
    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(parsed.timestamp).toBe('2026-02-01T00:00:00.000Z');
  });
});

// ─── loadScanCache ──────────────────────────────────────────────────────────

describe('loadScanCache', () => {
  it('reads and parses cache file', () => {
    const entry = makeCacheEntry();
    saveScanCache(entry, testDir);

    const loaded = loadScanCache(testDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.timestamp).toBe(entry.timestamp);
    expect(loaded!.scan.totalSourceFiles).toBe(10);
  });

  it('returns null when file is missing', () => {
    const loaded = loadScanCache(testDir);
    expect(loaded).toBeNull();
  });

  it('returns null when file is malformed JSON', () => {
    mkdirSync(join(testDir, '.harness'), { recursive: true });
    writeFileSync(join(testDir, '.harness', 'last-onboard-scan.json'), 'not valid json', 'utf-8');

    const loaded = loadScanCache(testDir);
    expect(loaded).toBeNull();
  });
});

// ─── isCacheValid ───────────────────────────────────────────────────────────

describe('isCacheValid', () => {
  it('returns true for a recent timestamp', () => {
    const entry = makeCacheEntry({ timestamp: new Date().toISOString() });
    expect(isCacheValid(entry)).toBe(true);
  });

  it('returns false for an old timestamp (beyond default 24h)', () => {
    const old = new Date(Date.now() - 86_400_001).toISOString();
    const entry = makeCacheEntry({ timestamp: old });
    expect(isCacheValid(entry)).toBe(false);
  });

  it('returns false for an invalid timestamp', () => {
    const entry = makeCacheEntry({ timestamp: 'not-a-date' });
    expect(isCacheValid(entry)).toBe(false);
  });

  it('returns false when timestamp is empty', () => {
    const entry = makeCacheEntry({ timestamp: '' });
    expect(isCacheValid(entry)).toBe(false);
  });

  it('respects custom maxAgeMs', () => {
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
    const entry = makeCacheEntry({ timestamp: tenMinutesAgo });

    // Within 1 hour
    expect(isCacheValid(entry, 3_600_000)).toBe(true);
    // Beyond 5 minutes
    expect(isCacheValid(entry, 300_000)).toBe(false);
  });
});

// ─── loadValidCache ─────────────────────────────────────────────────────────

describe('loadValidCache', () => {
  it('returns null when forceScan is true', () => {
    saveScanCache(makeCacheEntry(), testDir);

    const result = loadValidCache(testDir, { forceScan: true });
    expect(result).toBeNull();
  });

  it('returns null when no cache file exists', () => {
    const result = loadValidCache(testDir);
    expect(result).toBeNull();
  });

  it('returns null when cache is expired', () => {
    const old = new Date(Date.now() - 86_400_001).toISOString();
    saveScanCache(makeCacheEntry({ timestamp: old }), testDir);

    const result = loadValidCache(testDir);
    expect(result).toBeNull();
  });

  it('returns entry when cache is valid', () => {
    const entry = makeCacheEntry();
    saveScanCache(entry, testDir);

    const result = loadValidCache(testDir);
    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(entry.timestamp);
  });

  it('returns null when forceScan is false but cache is expired', () => {
    const old = new Date(Date.now() - 86_400_001).toISOString();
    saveScanCache(makeCacheEntry({ timestamp: old }), testDir);

    const result = loadValidCache(testDir, { forceScan: false });
    expect(result).toBeNull();
  });
});
