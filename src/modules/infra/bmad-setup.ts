/**
 * BMAD installation, version detection, patch application, and bmalph detection.
 */

import {
  isBmadInstalled,
  installBmad,
  applyAllPatches,
  detectBmadVersion,
  detectBmalph,
} from '../../lib/bmad.js';
import { ok as okOutput, fail as failOutput, info, warn } from '../../lib/output.js';
import type { Result } from '../../types/result.js';
import { ok } from '../../types/result.js';
import type { AgentRuntime, InitBmadResult } from './types.js';

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
      const patchNames = patchResults.filter(r => r.applied).map(r => r.patchName);

      bmadResult = {
        status: 'already-installed',
        version,
        patches_applied: patchNames,
        bmalph_detected: false,
      };

      if (!opts.isJson) {
        info('BMAD: already installed, patches verified');
      }
    } else {
      const installResult = installBmad(opts.projectDir, agentRuntime);
      const patchResults = applyAllPatches(opts.projectDir, { silent: opts.isJson });
      const patchNames = patchResults.filter(r => r.applied).map(r => r.patchName);

      bmadResult = {
        status: installResult.status,
        version: installResult.version,
        patches_applied: patchNames,
        bmalph_detected: false,
      };

      if (!opts.isJson) {
        okOutput(`BMAD: installed (v${installResult.version ?? 'unknown'}), harness patches applied`);
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
    const patchNames = patchResults.filter(r => r.applied).map(r => r.patchName);
    const version = detectBmadVersion(projectDir);
    const bmalpHDetection = detectBmalph(projectDir);
    const result: InitBmadResult = {
      status: 'already-installed',
      version,
      patches_applied: patchNames,
      bmalph_detected: bmalpHDetection.detected,
    };
    if (!isJson) {
      info('BMAD: already installed, patches verified');
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
