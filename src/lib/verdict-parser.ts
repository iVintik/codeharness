/**
 * Verdict Parser — XML tag based, consistent across all agents.
 *
 * Every agent outputs: <verdict>pass</verdict> or <verdict>fail</verdict>
 * Optionally: <issues>...</issues> for details on failures
 * Optionally: <evidence ac="N" status="pass|fail|unknown">...</evidence> per AC
 * Optionally: <metrics tests-passed="N" tests-failed="N" lint-warnings="N" issues="N" />
 *
 * One format. No JSON. No fallbacks.
 * No verdict tag = fail.
 */

// --- Interfaces ---

/** Structured metrics from check/review agents for progress tracking. */
export interface VerdictMetrics {
  testsPassed: number;
  testsFailed: number;
  lintWarnings: number;
  issues: number;
}

export interface EvaluatorVerdict {
  verdict: 'pass' | 'fail';
  score: {
    passed: number;
    failed: number;
    unknown: number;
    total: number;
  };
  findings: Array<{
    ac: number;
    description: string;
    status: 'pass' | 'fail' | 'unknown';
    evidence: {
      commands_run: string[];
      output_observed: string;
      reasoning: string;
    };
  }>;
  /** Structured metrics for progress tracking. Null if agent didn't output <metrics>. */
  metrics: VerdictMetrics | null;
}

// --- Functions ---

/**
 * Parse verdict from agent output.
 *
 * Looks for <verdict>pass</verdict> or <verdict>fail</verdict>.
 * If found, also parses <evidence> and <issues> tags.
 * No verdict tag → verdict is 'fail'.
 */
export function parseVerdict(output: string): EvaluatorVerdict {
  const verdictMatch = /<verdict>(pass|fail)<\/verdict>/i.exec(output);
  const verdictValue: 'pass' | 'fail' = verdictMatch
    ? verdictMatch[1].toLowerCase() as 'pass' | 'fail'
    : 'fail';

  // Parse <evidence ac="N" status="pass|fail|unknown">...</evidence> tags
  const findings: EvaluatorVerdict['findings'] = [];
  const evidenceRegex = /<evidence\s+ac="(\d+)"\s+status="(pass|fail|unknown)">([\s\S]*?)<\/evidence>/gi;
  let evidenceMatch;
  while ((evidenceMatch = evidenceRegex.exec(output)) !== null) {
    findings.push({
      ac: parseInt(evidenceMatch[1], 10),
      description: `AC #${evidenceMatch[1]}`,
      status: evidenceMatch[2].toLowerCase() as 'pass' | 'fail' | 'unknown',
      evidence: {
        commands_run: [],
        output_observed: evidenceMatch[3].trim(),
        reasoning: evidenceMatch[3].trim(),
      },
    });
  }

  // Parse <issues>...</issues> if present and no evidence tags found
  if (findings.length === 0) {
    const issuesMatch = /<issues>([\s\S]*?)<\/issues>/i.exec(output);
    if (issuesMatch && verdictValue === 'fail') {
      findings.push({
        ac: 1,
        description: 'Issues found',
        status: 'fail',
        evidence: {
          commands_run: [],
          output_observed: issuesMatch[1].trim(),
          reasoning: issuesMatch[1].trim(),
        },
      });
    }
  }

  // Calculate score from findings
  let passed = 0;
  let failed = 0;
  let unknown = 0;
  for (const f of findings) {
    if (f.status === 'pass') passed++;
    else if (f.status === 'fail') failed++;
    else unknown++;
  }
  const total = findings.length || 1;

  // If no findings but verdict is pass/fail, set score from verdict
  if (findings.length === 0) {
    if (verdictValue === 'pass') { passed = 1; }
    else { failed = 1; }
  }

  // Parse <metrics tests-passed="N" tests-failed="N" lint-warnings="N" issues="N" />
  const metrics = parseMetrics(output);

  return {
    verdict: verdictValue,
    score: { passed, failed, unknown, total },
    findings,
    metrics,
  };
}

/**
 * Parse structured metrics from agent output.
 * Format: <metrics tests-passed="N" tests-failed="N" lint-warnings="N" issues="N" />
 * All attributes optional. Returns null if no <metrics> tag found.
 */
export function parseMetrics(output: string): VerdictMetrics | null {
  const match = /<metrics\s+([^>]*)\/?>/i.exec(output);
  if (!match) return null;

  const attrs = match[1];
  const getAttr = (name: string): number => {
    const m = new RegExp(`${name}="(\\d+)"`, 'i').exec(attrs);
    return m ? parseInt(m[1], 10) : 0;
  };

  return {
    testsPassed: getAttr('tests-passed'),
    testsFailed: getAttr('tests-failed'),
    lintWarnings: getAttr('lint-warnings'),
    issues: getAttr('issues'),
  };
}

/**
 * Extract content from an XML tag in agent output.
 */
export function extractTag(output: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = pattern.exec(output);
  return match ? match[1].trim() : null;
}
