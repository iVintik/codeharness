/**
 * Showboat proof document template generation.
 * Creates canonical proof documents with executable evidence blocks
 * for verification via `showboat verify`.
 *
 * Architecture Decision 8: CLI orchestrates verification.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  type: 'exec' | 'image';
  content: string;
  path?: string;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  verified: boolean;
  evidence: EvidenceItem[];
}

export interface ShowboatProofConfig {
  storyId: string;
  storyTitle: string;
  acceptanceCriteria: AcceptanceCriterion[];
}

// ─── Template Functions ─────────────────────────────────────────────────────

/**
 * Generates the verification summary block with AC counts and pass/fail status.
 */
export function verificationSummaryBlock(criteria: AcceptanceCriterion[]): string {
  const total = criteria.length;
  const verified = criteria.filter(ac => ac.verified).length;
  const failed = total - verified;
  const status = failed === 0 && total > 0 ? 'PASS' : 'FAIL';

  const lines: string[] = [
    '## Verification Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total ACs | ${total} |`,
    `| Verified | ${verified} |`,
    `| Failed | ${failed} |`,
    `| Showboat Verify | ${status} |`,
  ];

  return lines.join('\n');
}

/**
 * Renders evidence items for a single AC section.
 */
function renderEvidence(evidence: EvidenceItem[]): string {
  if (evidence.length === 0) {
    return '<!-- No evidence captured yet -->';
  }

  const blocks: string[] = [];
  for (const item of evidence) {
    if (item.type === 'exec') {
      blocks.push(`<!-- showboat exec: ${item.content} -->`);
      blocks.push('```');
      blocks.push('<!-- output will be captured here -->');
      blocks.push('```');
      blocks.push('<!-- /showboat exec -->');
    } else if (item.type === 'image') {
      const imgPath = item.path ?? item.content;
      blocks.push(`<!-- showboat image: ${imgPath} -->`);
    }
  }

  return blocks.join('\n');
}

/**
 * Generates the canonical Showboat proof document from a config.
 * Structure: story header, per-AC sections with showboat blocks, verification summary.
 */
export function showboatProofTemplate(config: ShowboatProofConfig): string {
  const sections: string[] = [];

  // Story header
  sections.push(`# Proof: ${config.storyId}`);
  sections.push('');
  sections.push(`**Story:** ${config.storyTitle}`);
  sections.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
  sections.push('');

  // Per-AC sections
  for (const ac of config.acceptanceCriteria) {
    const statusIcon = ac.verified ? 'PASS' : 'PENDING';
    sections.push(`## AC ${ac.id}: ${statusIcon}`);
    sections.push('');
    sections.push(`> ${ac.description}`);
    sections.push('');
    sections.push(renderEvidence(ac.evidence));
    sections.push('');
  }

  // Verification summary
  sections.push(verificationSummaryBlock(config.acceptanceCriteria));
  sections.push('');

  return sections.join('\n');
}
