/**
 * Beads initialization for project setup.
 */

import { ok as okOutput, info, warn } from '../../lib/output.js';
import { isBeadsInitialized, initBeads, detectBeadsHooks, configureHookCoexistence } from '../../lib/beads.js';
import type { InitBeadsResult } from './types.js';

/**
 * Initialize beads or detect existing state.
 * Non-critical: catches BeadsError and returns a failed result.
 * Re-throws other errors.
 */
export function initializeBeads(projectDir: string, isJson: boolean): InitBeadsResult {
  try {
    let beadsResult: InitBeadsResult;
    if (isBeadsInitialized(projectDir)) {
      beadsResult = { status: 'already-initialized', hooks_detected: false };
      if (!isJson) {
        info('Beads: .beads/ already exists');
      }
    } else {
      initBeads(projectDir);
      beadsResult = { status: 'initialized', hooks_detected: false };
      if (!isJson) {
        okOutput('Beads: initialized (.beads/ created)');
      }
    }

    const hookDetection = detectBeadsHooks(projectDir);
    beadsResult = { ...beadsResult, hooks_detected: hookDetection.hasHooks };
    if (hookDetection.hasHooks) {
      configureHookCoexistence(projectDir);
      if (!isJson) {
        info('Beads hooks detected — coexistence configured');
      }
    }

    return beadsResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const beadsResult: InitBeadsResult = {
      status: 'failed',
      hooks_detected: false,
      error: message,
    };
    if (!isJson) {
      warn(`Beads init failed: ${message}`);
      info('Beads is optional — continuing without it');
    }
    return beadsResult;
  }
}
