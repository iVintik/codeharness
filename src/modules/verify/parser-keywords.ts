/**
 * Keyword arrays for AC classification in the story parser.
 * Extracted from parser.ts to stay under the 300-line file limit.
 */

// ─── AC Type Classification Keywords ────────────────────────────────────────

export const UI_KEYWORDS = [
  'agent-browser',
  'screenshot',
  'navigate',
  'click',
  'form',
  'ui verification',
  'ui acceptance',
];

export const API_KEYWORDS = [
  'http',
  'api',
  'endpoint',
  'curl',
  'rest',
  'response bod',
];

export const DB_KEYWORDS = [
  'database',
  'db state',
  'db mcp',
  'query',
  'sql',
  'table',
];

// ─── Legacy Classification Keywords ─────────────────────────────────────────

export const INTEGRATION_KEYWORDS = [
  'external system',
  'real infrastructure',
  'manual verification',
];

/** Keywords that indicate true escalation (cannot be automated at all) */
export const ESCALATE_KEYWORDS = [
  'physical hardware',
  'manual human',
  'visual inspection by human',
  'paid external service',
];

// ─── Tier Classification Keywords ────────────────────────────────────────────

export const TEST_PROVABLE_KEYWORDS = [
  'file exists', 'export', 'type', 'interface', 'test passes',
  'line count', 'coverage', 'refactor', 'rename', 'documentation',
  'function', 'when inspected', 'config',
];

export const RUNTIME_PROVABLE_KEYWORDS = [
  'cli command', 'api endpoint', 'http', 'server', 'output shows',
  'exit code', 'binary', 'runs and produces', 'cli outputs', 'when run',
];

export const ENVIRONMENT_PROVABLE_KEYWORDS = [
  'docker', 'container', 'observability', 'telemetry', 'database',
  'queue', 'distributed', 'multi-service', 'end-to-end', 'victorialogs',
];

export const ESCALATE_TIER_KEYWORDS = [
  'physical hardware', 'human visual', 'paid service', 'gpu',
  'manual inspection', 'physical display',
];
