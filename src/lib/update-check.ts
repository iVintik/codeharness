/**
 * Non-blocking update check for the codeharness CLI.
 *
 * On first command each day (24h cache) we hit the npm registry for the
 * latest published version and compare against the running binary. When a
 * newer version exists we print a yellow banner to stderr with the upgrade
 * command. The check is skipped in JSON mode, when NO_UPDATE_CHECK is set,
 * when CI is set, and when the network is unreachable (fail silent).
 *
 * Design:
 * - Never blocks startup: HTTP fetch runs behind a 1.5s timeout.
 * - Cached in ~/.codeharness/version-check.json with a 24h TTL so we don't
 *   ping the registry on every command.
 * - Fail-silent everywhere: if anything throws, we return false and print nothing.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;
const REGISTRY_URL = 'https://registry.npmjs.org/codeharness/latest';
const PACKAGE_NAME = 'codeharness';

interface VersionCacheEntry {
  latest: string;
  checkedAt: number;
}

function getCachePath(): string {
  return join(homedir(), '.codeharness', 'version-check.json');
}

/** Parse a semver string into a comparable number tuple. Loose: ignores pre-release. */
function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Returns true when `latest` is strictly newer than `current`. */
export function isNewer(current: string, latest: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

function readCache(): VersionCacheEntry | null {
  try {
    const path = getCachePath();
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as VersionCacheEntry;
    if (typeof parsed.latest !== 'string' || typeof parsed.checkedAt !== 'number') return null;
    return parsed;
  } catch {
    // IGNORE: corrupt cache, refetch
    return null;
  }
}

function writeCache(entry: VersionCacheEntry): void {
  try {
    const path = getCachePath();
    mkdirSync(join(homedir(), '.codeharness'), { recursive: true });
    writeFileSync(path, JSON.stringify(entry), 'utf-8');
  } catch {
    // IGNORE: cache is best-effort, don't fail startup
  }
}

/** Hit the npm registry with a short timeout. Returns null on any failure. */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(REGISTRY_URL, {
        signal: controller.signal,
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      });
      if (!response.ok) return null;
      const body = await response.json() as { version?: unknown };
      if (typeof body.version !== 'string') return null;
      return body.version;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // IGNORE: network failure, DNS, timeout — fail silent
    return null;
  }
}

export interface UpdateCheckOptions {
  currentVersion: string;
  /** Override cache read/write (tests). */
  now?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Decide whether to warn and emit the banner to stderr. Non-blocking:
 * uses cached data when fresh, fetches in background when stale, prints
 * nothing on the first stale run (result lands in cache for next time).
 */
export async function checkForUpdate(opts: UpdateCheckOptions): Promise<void> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();

  // Opt-outs
  if (env.NO_UPDATE_CHECK === '1' || env.CI === 'true' || env.CI === '1') return;
  // Honor --json at the argv level — we can't easily import Commander state here.
  if (process.argv.includes('--json')) return;

  const cached = readCache();
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    // Cache fresh — warn if stale and return immediately (no fetch).
    if (isNewer(opts.currentVersion, cached.latest)) {
      printBanner(opts.currentVersion, cached.latest);
    }
    return;
  }

  // Cache stale or missing — fetch in background, don't block the user.
  fetchLatestVersion().then((latest) => {
    if (latest) {
      writeCache({ latest, checkedAt: now });
      if (isNewer(opts.currentVersion, latest)) {
        printBanner(opts.currentVersion, latest);
      }
    }
  }).catch(() => {
    // IGNORE: never let an update check crash the CLI
  });
}

function printBanner(current: string, latest: string): void {
  const yellow = '\u001B[33m';
  const reset = '\u001B[0m';
  const line1 = `${yellow}⚠ ${PACKAGE_NAME} ${latest} is available (you have ${current})${reset}`;
  const line2 = `  Upgrade: npx --yes ${PACKAGE_NAME}@latest <command>`;
  const line3 = `  Or set NO_UPDATE_CHECK=1 to silence this notice.`;
  process.stderr.write(`${line1}\n${line2}\n${line3}\n`);
}
