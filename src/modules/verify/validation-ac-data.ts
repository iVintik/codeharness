/**
 * Validation AC data — NFR, UX, Regression, and ActionItem ACs (41-79).
 * FR ACs live in validation-ac-fr.ts. Split to comply with NFR18 (300-line limit).
 */

import type { ValidationAC } from './validation-ac-types.js';

// Re-export FR ACs from separate file
export { FR_ACS } from './validation-ac-fr.js';

// ─── NFR ACs (41-48) ────────────────────────────────────────────────────────

export const NFR_ACS: readonly ValidationAC[] = [
  {
    id: 41, frRef: 'NFR1', category: 'NFR', verificationMethod: 'cli',
    description: 'Any module function returns structured Result on error — no uncaught exceptions crash the system',
    command: 'npx vitest run --reporter=verbose',
  },
  {
    id: 42, frRef: 'NFR2', category: 'NFR', verificationMethod: 'integration',
    description: '8+ hour ralph run with no crashes, memory leaks, or unrecoverable state',
  },
  {
    id: 43, frRef: 'NFR3', category: 'NFR', verificationMethod: 'cli',
    description: 'Any ralph iteration including timeout produces report file with non-zero bytes',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/timeout.test.ts',
  },
  {
    id: 44, frRef: 'NFR4', category: 'NFR', verificationMethod: 'cli',
    description: 'updateStoryStatus() writing sprint-state.json uses atomic write pattern (temp file + rename)',
    command: 'grep -n "renameSync" src/modules/sprint/state.ts',
  },
  {
    id: 45, frRef: 'NFR5', category: 'NFR', verificationMethod: 'cli',
    description: 'All bash scripts in the project do not use set -e',
    command: 'grep -r "set -e" ralph/ --include="*.sh" || true',
  },
  {
    id: 46, frRef: 'NFR7', category: 'NFR', verificationMethod: 'cli',
    description: 'codeharness status returns in <3 seconds',
    command: 'time node dist/index.js status 2>&1',
  },
  {
    id: 47, frRef: 'NFR18', category: 'NFR', verificationMethod: 'cli',
    description: 'No source file in src/ exceeds 300 lines',
    command: 'wc -l src/**/*.ts',
  },
  {
    id: 48, frRef: 'NFR19', category: 'NFR', verificationMethod: 'cli',
    description: 'Module interfaces in src/types/ documented with TypeScript types — no any',
    command: 'grep -n "any" src/types/*.ts || true',
  },
];

// ─── UX ACs (49-51) ─────────────────────────────────────────────────────────

export const UX_ACS: readonly ValidationAC[] = [
  {
    id: 49, frRef: 'UX-status-format', category: 'UX', verificationMethod: 'cli',
    description: 'codeharness status shows current story, phase, AC progress, iteration, cost, elapsed in one screen',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 50, frRef: 'UX-error-detail', category: 'UX', verificationMethod: 'cli',
    description: 'Failed story in status includes AC number, command that failed, and output',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 51, frRef: 'UX-drill-down', category: 'UX', verificationMethod: 'cli',
    description: 'codeharness status --story <id> shows drill-down with per-AC PASS/FAIL/ESCALATE and attempt history',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
];

// ─── Regression ACs (52-71) ─────────────────────────────────────────────────

export const REGRESSION_ACS: readonly ValidationAC[] = [
  {
    id: 52, frRef: 'Regression: 1-1', category: 'Regression', verificationMethod: 'cli',
    description: 'src/types/result.ts exports Result<T>, ok(data), fail(error, context?)',
    command: 'npx tsc --noEmit',
  },
  {
    id: 53, frRef: 'Regression: 1-2', category: 'Regression', verificationMethod: 'cli',
    description: 'Each module index.ts exports typed function stubs or implementations returning Result<T>',
    command: 'npx tsc --noEmit',
  },
  {
    id: 54, frRef: 'Regression: 1-3', category: 'Regression', verificationMethod: 'cli',
    description: 'Verify-related tests exist in src/modules/verify/__tests__/',
    command: 'ls src/modules/verify/__tests__/',
  },
  {
    id: 55, frRef: 'Regression: 2-1', category: 'Regression', verificationMethod: 'cli',
    description: 'getSprintState() with old-format files auto-migrates to sprint-state.json',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/migration.test.ts',
  },
  {
    id: 56, frRef: 'Regression: 2-2', category: 'Regression', verificationMethod: 'cli',
    description: 'getNextStory() with retry-exhausted story skips with reason retry-exhausted',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/selector.test.ts',
  },
  {
    id: 57, frRef: 'Regression: 2-3', category: 'Regression', verificationMethod: 'cli',
    description: 'codeharness status in complete run shows done/failed/blocked/skipped counts',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 58, frRef: 'Regression: 3-1', category: 'Regression', verificationMethod: 'cli',
    description: 'Timeout (exit 124) captures git diff, state delta, partial stderr in timeout report',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/timeout.test.ts',
  },
  {
    id: 59, frRef: 'Regression: 3-2', category: 'Regression', verificationMethod: 'cli',
    description: 'developStory(key) with failing workflow returns fail(error) — never throws',
    command: 'npx vitest run --reporter=verbose src/modules/dev/__tests__/index.test.ts',
  },
  {
    id: 60, frRef: 'Regression: 3-3', category: 'Regression', verificationMethod: 'integration',
    description: 'Failing ACs from verification set story status to in-progress with failing AC details',
  },
  {
    id: 61, frRef: 'Regression: 4-1', category: 'Regression', verificationMethod: 'cli',
    description: 'verifyStory(key) returns Result<VerifyResult> including AC-level results',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/index.test.ts',
  },
  {
    id: 62, frRef: 'Regression: 4-2', category: 'Regression', verificationMethod: 'integration',
    description: 'Verification adapts approach by project type — CLI uses docker exec, plugin uses claude --print',
  },
  {
    id: 63, frRef: 'Regression: 4-3', category: 'Regression', verificationMethod: 'integration',
    description: 'Stale verification containers cleaned up before new verification',
  },
  {
    id: 64, frRef: 'Regression: 5-1', category: 'Regression', verificationMethod: 'cli',
    description: 'reviewStory(key) failing returns Result error and sprint continues',
    command: 'npx vitest run --reporter=verbose src/modules/review/__tests__/index.test.ts',
  },
  {
    id: 65, frRef: 'Regression: 6-1', category: 'Regression', verificationMethod: 'cli',
    description: 'src/commands/init.ts is <100 lines',
    command: 'wc -l src/commands/init.ts',
  },
  {
    id: 66, frRef: 'Regression: 6-2', category: 'Regression', verificationMethod: 'integration',
    description: 'Shared stack running detected by init and reused without port conflicts',
  },
  {
    id: 67, frRef: 'Regression: 6-3', category: 'Regression', verificationMethod: 'integration',
    description: 'BMAD installed triggers skip install and applies patches',
  },
  {
    id: 68, frRef: 'Regression: 7-1', category: 'Regression', verificationMethod: 'cli',
    description: 'No OpenSearch config returns VictoriaBackend from getObservabilityBackend()',
    command: 'npx vitest run --reporter=verbose src/modules/infra/__tests__/observability.test.ts',
  },
  {
    id: 69, frRef: 'Regression: 7-2', category: 'Regression', verificationMethod: 'integration',
    description: '--opensearch-url passed to init records opensearch backend in state',
  },
  {
    id: 70, frRef: 'Regression: 8-1', category: 'Regression', verificationMethod: 'integration',
    description: 'Browser verification module uses agent-browser via docker exec for UI ACs',
  },
  {
    id: 71, frRef: 'Regression: 9-1', category: 'Regression', verificationMethod: 'cli',
    description: 'Patch loader loads from role-specific patches/{role}/ subdirectory not flat patches/*.md',
    command: 'ls -d patches/dev patches/review patches/verify patches/sprint patches/retro',
  },
];

// ─── Action Item ACs (72-79) ────────────────────────────────────────────────

export const ACTION_ITEM_ACS: readonly ValidationAC[] = [
  {
    id: 72, frRef: 'Action: session-retro-2026-03-18 A1', category: 'ActionItem', verificationMethod: 'cli',
    description: 'validateProofQuality() skips checkBlackBoxEnforcement() for unit-testable stories',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
  {
    id: 73, frRef: 'Action: session-retro-2026-03-18 A3', category: 'ActionItem', verificationMethod: 'cli',
    description: 'import-boundaries.test.ts fails (not silently skips) when COMMANDS_DIR is missing',
    command: 'npx vitest run --reporter=verbose src/modules/__tests__/import-boundaries.test.ts',
  },
  {
    id: 74, frRef: 'Action: session-retro-2026-03-18 A4', category: 'ActionItem', verificationMethod: 'cli',
    description: 'getObservabilityBackend() return type consistent with Result<T> convention or documented exception',
    command: 'npx tsc --noEmit',
  },
  {
    id: 75, frRef: 'Action: session-retro-2026-03-18 A5', category: 'ActionItem', verificationMethod: 'cli',
    description: 'Types-only files excluded from coverage or have documented exception — no false 0% alarms',
    command: 'npx vitest run --coverage --reporter=verbose',
  },
  {
    id: 76, frRef: 'Action: session-retro-2026-03-16 B1', category: 'ActionItem', verificationMethod: 'cli',
    description: 'validateProofQuality() regex recognizes both ## AC 1: and ## AC1: header formats',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
  {
    id: 77, frRef: 'Action: session-retro-2026-03-16 B2', category: 'ActionItem', verificationMethod: 'cli',
    description: 'validateProofQuality() recognizes both HTML comment markers and bash+output block format',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
  {
    id: 78, frRef: 'Action: session-retro-2026-03-16 B3', category: 'ActionItem', verificationMethod: 'cli',
    description: 'createProofDocument() does not overwrite existing proof — preserves captured evidence',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
  {
    id: 79, frRef: 'Action: session-retro-2026-03-16 B4', category: 'ActionItem', verificationMethod: 'cli',
    description: 'Escalation detection scoped to AC status lines only — no false positives from evidence content',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
];
