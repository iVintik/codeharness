/**
 * Scan cache persistence for onboarding.
 *
 * Story 8.4: Saves/loads/validates scan results to `.harness/last-onboard-scan.json`
 * so that repeated onboard subcommands can reuse recent scan data.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanResult, CoverageGapReport, DocAuditResult } from './scanner.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScanCacheEntry {
  timestamp: string;       // ISO 8601 timestamp of when scan was performed
  scan: ScanResult;
  coverage?: CoverageGapReport | null;
  audit?: DocAuditResult | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_DIR = '.harness';
const CACHE_FILE = 'last-onboard-scan.json';
const DEFAULT_MAX_AGE_MS = 86_400_000; // 24 hours

// ─── Functions ──────────────────────────────────────────────────────────────

/**
 * Saves a scan cache entry to `.harness/last-onboard-scan.json`.
 * Creates the `.harness/` directory if it doesn't exist.
 */
export function saveScanCache(entry: ScanCacheEntry, dir?: string): void {
  try {
    const root = dir ?? process.cwd();
    const cacheDir = join(root, CACHE_DIR);
    mkdirSync(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, CACHE_FILE);
    writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {
    // Cache write is best-effort — fail silently rather than crashing
    // the command after a successful scan.
  }
}

/**
 * Loads the scan cache entry from `.harness/last-onboard-scan.json`.
 * Returns null if the file doesn't exist, is unreadable, or fails to parse.
 */
export function loadScanCache(dir?: string): ScanCacheEntry | null {
  const root = dir ?? process.cwd();
  const cachePath = join(root, CACHE_DIR, CACHE_FILE);
  if (!existsSync(cachePath)) {
    return null;
  }
  try {
    const raw = readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw) as ScanCacheEntry;
  } catch {
    return null;
  }
}

/**
 * Checks if a cache entry's timestamp is within the given max age.
 * Returns false if the timestamp is invalid or missing.
 */
export function isCacheValid(entry: ScanCacheEntry, maxAgeMs?: number): boolean {
  const max = maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!entry.timestamp) {
    return false;
  }
  const ts = new Date(entry.timestamp).getTime();
  if (isNaN(ts)) {
    return false;
  }
  return (Date.now() - ts) < max;
}

/**
 * Convenience function: loads and validates the scan cache in one call.
 * Returns null if forceScan is true, cache doesn't exist, or cache is expired.
 */
export function loadValidCache(
  dir?: string,
  opts?: { forceScan?: boolean; maxAgeMs?: number },
): ScanCacheEntry | null {
  if (opts?.forceScan) {
    return null;
  }
  const entry = loadScanCache(dir);
  if (!entry) {
    return null;
  }
  if (!isCacheValid(entry, opts?.maxAgeMs)) {
    return null;
  }
  return entry;
}
