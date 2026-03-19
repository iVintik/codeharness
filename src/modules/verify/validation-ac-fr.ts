/**
 * Validation AC data — FR ACs (1-40).
 * One AC per functional requirement.
 */

import type { ValidationAC } from './validation-ac-types.js';

export const FR_ACS: readonly ValidationAC[] = [
  {
    id: 1, frRef: 'FR1', category: 'FR', verificationMethod: 'cli',
    description: 'src/commands/init.ts exists and is a thin wrapper (<100 lines) delegating to infra.initProject()',
    command: 'wc -l src/commands/init.ts',
  },
  {
    id: 2, frRef: 'FR2', category: 'FR', verificationMethod: 'integration',
    description: 'infra.detectSharedStack() returns detected stack info without port conflicts',
  },
  {
    id: 3, frRef: 'FR3', category: 'FR', verificationMethod: 'integration',
    description: '--opensearch-url passed to init records opensearch backend type in sprint-state',
  },
  {
    id: 4, frRef: 'FR4', category: 'FR', verificationMethod: 'integration',
    description: 'BMAD not installed triggers npx bmad-method install --yes --tools claude-code non-interactively',
  },
  {
    id: 5, frRef: 'FR5', category: 'FR', verificationMethod: 'integration',
    description: 'Stale Docker verification containers removed before new verification',
  },
  {
    id: 6, frRef: 'FR6', category: 'FR', verificationMethod: 'integration',
    description: '--opensearch-url pointing to remote endpoint skips local Docker stack',
  },
  {
    id: 7, frRef: 'FR7', category: 'FR', verificationMethod: 'cli',
    description: 'getNextStory() returns story with highest priority tier (proof-exists > in-progress > verifying > backlog)',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/selector.test.ts',
  },
  {
    id: 8, frRef: 'FR8', category: 'FR', verificationMethod: 'cli',
    description: 'getSprintState() returns Result<SprintState> from single sprint-state.json',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/state.test.ts',
  },
  {
    id: 9, frRef: 'FR9', category: 'FR', verificationMethod: 'integration',
    description: 'ralph running 8+ hours with no crashes, memory leaks, or unrecoverable state',
  },
  {
    id: 10, frRef: 'FR10', category: 'FR', verificationMethod: 'cli',
    description: 'Attempt counts in sprint-state.json persist across ralph session restarts',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/state.test.ts',
  },
  {
    id: 11, frRef: 'FR11', category: 'FR', verificationMethod: 'cli',
    description: 'Story with attempts >= 10 skipped by getNextStory() with reason retry-exhausted',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/selector.test.ts',
  },
  {
    id: 12, frRef: 'FR12', category: 'FR', verificationMethod: 'cli',
    description: 'Any iteration (success, failure, timeout) produces a report file with non-zero content',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/timeout.test.ts',
  },
  {
    id: 13, frRef: 'FR13', category: 'FR', verificationMethod: 'integration',
    description: 'verifyStory(key) spawns verifier in isolated Docker container via docker exec',
  },
  {
    id: 14, frRef: 'FR14', category: 'FR', verificationMethod: 'integration',
    description: 'Verifier running in Docker captures stdout/stderr as proof evidence',
  },
  {
    id: 15, frRef: 'FR15', category: 'FR', verificationMethod: 'integration',
    description: 'Observability backend configured verifier queries endpoints and includes results in proof',
  },
  {
    id: 16, frRef: 'FR16', category: 'FR', verificationMethod: 'integration',
    description: 'Web project UI ACs trigger agent-browser verification with screenshot capture',
  },
  {
    id: 17, frRef: 'FR17', category: 'FR', verificationMethod: 'cli',
    description: 'parseProof() detects and counts [FAIL] verdicts outside code blocks',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
  {
    id: 18, frRef: 'FR18', category: 'FR', verificationMethod: 'cli',
    description: 'parseProof() detects and counts [ESCALATE] separately from [FAIL]',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify.test.ts',
  },
  {
    id: 19, frRef: 'FR19', category: 'FR', verificationMethod: 'integration',
    description: 'Verification never refuses any project type — adapts approach based on type',
  },
  {
    id: 20, frRef: 'FR20', category: 'FR', verificationMethod: 'cli',
    description: 'Verifier spawns claude --print with --allowedTools flag',
    command: 'npx vitest run --reporter=verbose src/modules/verify/__tests__/verify-prompt.test.ts',
  },
  {
    id: 21, frRef: 'FR21', category: 'FR', verificationMethod: 'integration',
    description: 'reviewStory(key) orchestrates BMAD code-review workflow and returns Result<ReviewResult>',
  },
  {
    id: 22, frRef: 'FR22', category: 'FR', verificationMethod: 'integration',
    description: 'Review returning story to in-progress re-triggers dev module with review findings',
  },
  {
    id: 23, frRef: 'FR23', category: 'FR', verificationMethod: 'cli',
    description: 'Review module throws or fails returns Result error and sprint execution continues',
    command: 'npx vitest run --reporter=verbose src/modules/review/__tests__/index.test.ts',
  },
  {
    id: 24, frRef: 'FR24', category: 'FR', verificationMethod: 'integration',
    description: 'developStory(key) orchestrates BMAD dev-story workflow and returns Result<DevResult>',
  },
  {
    id: 25, frRef: 'FR25', category: 'FR', verificationMethod: 'integration',
    description: 'Verification finding code bugs returns story to dev with failing AC details',
  },
  {
    id: 26, frRef: 'FR26', category: 'FR', verificationMethod: 'cli',
    description: 'Dev module throws or fails returns Result error and sprint execution continues',
    command: 'npx vitest run --reporter=verbose src/modules/dev/__tests__/index.test.ts',
  },
  {
    id: 27, frRef: 'FR27', category: 'FR', verificationMethod: 'cli',
    description: 'codeharness status returns in <3 seconds',
    command: 'time node dist/index.js status 2>&1',
  },
  {
    id: 28, frRef: 'FR28', category: 'FR', verificationMethod: 'cli',
    description: 'codeharness status shows done/failed/blocked/in-progress counts with per-story detail',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 29, frRef: 'FR29', category: 'FR', verificationMethod: 'cli',
    description: 'Failed story in status shows story ID, AC number, one-line error, suggested fix',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 30, frRef: 'FR30', category: 'FR', verificationMethod: 'cli',
    description: 'codeharness status --story <id> shows each AC with PASS/FAIL/ESCALATE and attempt history',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 31, frRef: 'FR31', category: 'FR', verificationMethod: 'cli',
    description: 'Completed run status includes cost, duration, and iteration count',
    command: 'npx vitest run --reporter=verbose src/modules/sprint/__tests__/reporter.test.ts',
  },
  {
    id: 32, frRef: 'FR32', category: 'FR', verificationMethod: 'integration',
    description: 'OpenSearch backend queryLogs() queries OpenSearch _search API and returns results',
  },
  {
    id: 33, frRef: 'FR33', category: 'FR', verificationMethod: 'cli',
    description: 'applyAllPatches() applies patches encoding real operational learnings per module role',
    command: 'ls patches/dev/ patches/review/ patches/verify/ patches/sprint/ patches/retro/',
  },
  {
    id: 34, frRef: 'FR34', category: 'FR', verificationMethod: 'cli',
    description: 'All patches in patches/{role}/ are markdown files — no hardcoded strings',
    command: 'find patches/ -type f ! -name "*.md"',
  },
  {
    id: 35, frRef: 'FR35', category: 'FR', verificationMethod: 'cli',
    description: 'Patch loader loads from role-specific patches/{dev,review,verify,sprint,retro}/ subdirectory',
    command: 'ls -d patches/dev patches/review patches/verify patches/sprint patches/retro',
  },
  {
    id: 36, frRef: 'FR36', category: 'FR', verificationMethod: 'cli',
    description: 'Each patch file includes ## WHY section with architectural reasoning',
    command: 'grep -l "## WHY" patches/**/*.md',
  },
  {
    id: 37, frRef: 'FR37', category: 'FR', verificationMethod: 'cli',
    description: 'Any module function (infra, sprint, verify, dev, review) returns Result with error — never throws uncaught',
    command: 'npx vitest run --reporter=verbose',
  },
  {
    id: 38, frRef: 'FR38', category: 'FR', verificationMethod: 'cli',
    description: 'Each module index.ts exports typed functions — no any types',
    command: 'npx tsc --noEmit',
  },
  {
    id: 39, frRef: 'FR39', category: 'FR', verificationMethod: 'cli',
    description: 'Each module owns its own state — does not read/write another modules state files',
    command: 'npx vitest run --reporter=verbose src/modules/__tests__/import-boundaries.test.ts',
  },
  {
    id: 40, frRef: 'FR40', category: 'FR', verificationMethod: 'cli',
    description: 'CLI command files in src/commands/ are each <100 lines (thin wrappers)',
    command: 'wc -l src/commands/*.ts',
  },
];
