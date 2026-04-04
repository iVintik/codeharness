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


