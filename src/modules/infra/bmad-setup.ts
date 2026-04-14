/**
 * BMAD installation, version detection, patch application, and bmalph detection.
 */

import {
  isBmadInstalled,
  installBmad,
  applyAllPatches,
  detectBmadVersion,
  detectBmalph,
  type PatchResult,
} from '../../lib/bmad.js';
import { ok as okOutput, fail as failOutput, info, warn } from '../../lib/output.js';
import { basename } from 'node:path';
import type { Result } from '../../types/result.js';
import { ok } from '../../types/result.js';
import type { AgentRuntime, InitBmadResult, PatchStatus } from './types.js';

/** Convert raw PatchResult[] from the engine into PatchStatus[] for JSON output. */
function buildPatchStatuses(raw: PatchResult[], projectDir: string): PatchStatus[] {
  return raw.map((r) => {
    // Trim the projectDir prefix so the target reads as a _bmad-relative path.
    const target = r.targetFile.startsWith(projectDir)
      ? r.targetFile.slice(projectDir.length + 1)
      : r.targetFile;
    const status: PatchStatus = {
      name: r.patchName,
      target,
      applied: r.applied,
      updated: r.updated,
    };
    if (r.error) (status as { error?: string }).error = r.error;
    return status;
  });
}

/** Emit a WARN line for each failed patch so users see which targets were missing. */
function warnOnFailedPatches(patches: PatchStatus[], isJson: boolean): void {
  if (isJson) return;
  const failed = patches.filter((p) => !p.applied);
  if (failed.length === 0) return;
  warn(`BMAD: ${failed.length}/${patches.length} harness patches could NOT be applied:`);
  for (const f of failed) {
    warn(`  - ${f.name} → ${f.target}: ${f.error ?? 'unknown error'}`);
  }
  warn('  Common cause: BMAD install is missing the target workflow files.');
  warn('  Fix: reinstall BMAD with `npx bmad-method install --yes --directory . --modules bmm --tools claude-code`');
  warn('  Then re-run `codeharness init`.');
  // Silence unused import warning in non-json mode
  void basename;
}

interface BmadSetupOptions {
  readonly projectDir: string;
  readonly isJson: boolean;
  readonly agentRuntime?: AgentRuntime;
}

/**
 * Install or verify BMAD, apply patches, detect bmalph.
 * Non-critical: returns ok even on BmadError (with status 'failed').
 */
export function setupBmad(opts: BmadSetupOptions): Result<InitBmadResult> {
  try {
    const agentRuntime = opts.agentRuntime ?? 'claude-code';
    const bmadAlreadyInstalled = isBmadInstalled(opts.projectDir);
    let bmadResult: InitBmadResult;

    if (bmadAlreadyInstalled) {
      const version = detectBmadVersion(opts.projectDir);
      const patchResults = applyAllPatches(opts.projectDir, { silent: opts.isJson });
      const patches = buildPatchStatuses(patchResults, opts.projectDir);
      const patchNames = patches.filter(p => p.applied).map(p => p.name);
      const patchesFailed = patches.filter(p => !p.applied);

      bmadResult = {
        status: 'already-installed',
        version,
        patches_applied: patchNames,
        patches,
        patches_failed: patchesFailed,
        bmalph_detected: false,
      };

      if (!opts.isJson) {
        info(`BMAD: already installed, ${patchNames.length}/${patches.length} patches applied`);
        warnOnFailedPatches(patches, opts.isJson);
      }
    } else {
      const installResult = installBmad(opts.projectDir, agentRuntime);
      const patchResults = applyAllPatches(opts.projectDir, { silent: opts.isJson });
      const patches = buildPatchStatuses(patchResults, opts.projectDir);
      const patchNames = patches.filter(p => p.applied).map(p => p.name);
      const patchesFailed = patches.filter(p => !p.applied);

      bmadResult = {
        status: installResult.status,
        version: installResult.version,
        patches_applied: patchNames,
        patches,
        patches_failed: patchesFailed,
        bmalph_detected: false,
      };

      if (!opts.isJson) {
        okOutput(`BMAD: installed (v${installResult.version ?? 'unknown'}), ${patchNames.length}/${patches.length} harness patches applied`);
        warnOnFailedPatches(patches, opts.isJson);
      }
    }

    // bmalph detection
    const bmalpHDetection = detectBmalph(opts.projectDir);
    if (bmalpHDetection.detected) {
      bmadResult = { ...bmadResult, bmalph_detected: true };
      if (!opts.isJson) {
        warn('bmalph detected — superseded files noted for cleanup');
      }
    }

    return ok(bmadResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const bmadResult: InitBmadResult = {
      status: 'failed',
      version: null,
      patches_applied: [],
      patches: [],
      patches_failed: [],
      bmalph_detected: false,
      error: message,
    };
    if (!opts.isJson) {
      failOutput(`BMAD install failed: ${message}`);
    }
    // BMAD is NOT critical — return ok with failed status
    return ok(bmadResult);
  }
}

/**
 * Verify BMAD patches on re-run path.
 * Non-critical: catches errors silently.
 */
export function verifyBmadOnRerun(projectDir: string, isJson: boolean): InitBmadResult | undefined {
  if (!isBmadInstalled(projectDir)) {
    return undefined;
  }
  try {
    const patchResults = applyAllPatches(projectDir, { silent: isJson });
    const patches = buildPatchStatuses(patchResults, projectDir);
    const patchNames = patches.filter(p => p.applied).map(p => p.name);
    const patchesFailed = patches.filter(p => !p.applied);
    const version = detectBmadVersion(projectDir);
    const bmalpHDetection = detectBmalph(projectDir);
    const result: InitBmadResult = {
      status: 'already-installed',
      version,
      patches_applied: patchNames,
      patches,
      patches_failed: patchesFailed,
      bmalph_detected: bmalpHDetection.detected,
    };
    if (!isJson) {
      info(`BMAD: already installed, ${patchNames.length}/${patches.length} patches applied`);
      warnOnFailedPatches(patches, isJson);
      if (bmalpHDetection.detected) {
        warn('bmalph detected — superseded files noted for cleanup');
      }
    }
    return result;
  } catch {
    // IGNORE: BMAD verification is non-critical during re-run
    return undefined;
  }
}
