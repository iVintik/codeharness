import { describe, it, expect } from 'vitest';
import {
  showboatProofTemplate,
  verificationSummaryBlock,
} from '../showboat-template.js';
import type {
  ShowboatProofConfig,
  AcceptanceCriterion,
  EvidenceItem,
} from '../showboat-template.js';

// ─── verificationSummaryBlock ───────────────────────────────────────────────

describe('verificationSummaryBlock', () => {
  it('calculates correct counts for all verified', () => {
    const criteria: AcceptanceCriterion[] = [
      { id: '1', description: 'AC one', verified: true, evidence: [] },
      { id: '2', description: 'AC two', verified: true, evidence: [] },
    ];
    const block = verificationSummaryBlock(criteria);
    expect(block).toContain('Total ACs | 2');
    expect(block).toContain('Verified | 2');
    expect(block).toContain('Failed | 0');
    expect(block).toContain('Showboat Verify | PASS');
  });

  it('calculates correct counts with failures', () => {
    const criteria: AcceptanceCriterion[] = [
      { id: '1', description: 'AC one', verified: true, evidence: [] },
      { id: '2', description: 'AC two', verified: false, evidence: [] },
      { id: '3', description: 'AC three', verified: false, evidence: [] },
    ];
    const block = verificationSummaryBlock(criteria);
    expect(block).toContain('Total ACs | 3');
    expect(block).toContain('Verified | 1');
    expect(block).toContain('Failed | 2');
    expect(block).toContain('Showboat Verify | FAIL');
  });

  it('returns FAIL for zero ACs', () => {
    const block = verificationSummaryBlock([]);
    expect(block).toContain('Total ACs | 0');
    expect(block).toContain('Verified | 0');
    expect(block).toContain('Failed | 0');
    expect(block).toContain('Showboat Verify | FAIL');
  });

  it('contains summary heading', () => {
    const block = verificationSummaryBlock([]);
    expect(block).toContain('## Verification Summary');
  });
});

// ─── showboatProofTemplate ──────────────────────────────────────────────────

describe('showboatProofTemplate', () => {
  it('generates correct markdown structure with story header', () => {
    const config: ShowboatProofConfig = {
      storyId: '4-1-test',
      storyTitle: 'Story 4.1: Test Story',
      acceptanceCriteria: [
        { id: '1', description: 'First AC', verified: false, evidence: [] },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('# Proof: 4-1-test');
    expect(result).toContain('**Story:** Story 4.1: Test Story');
    expect(result).toContain('**Generated:**');
  });

  it('includes AC sections with correct IDs', () => {
    const config: ShowboatProofConfig = {
      storyId: '1-1-test',
      storyTitle: 'Test',
      acceptanceCriteria: [
        { id: '1', description: 'First', verified: true, evidence: [] },
        { id: '2', description: 'Second', verified: false, evidence: [] },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('## AC 1: PASS');
    expect(result).toContain('## AC 2: PENDING');
    expect(result).toContain('> First');
    expect(result).toContain('> Second');
  });

  it('includes showboat exec blocks for exec evidence', () => {
    const evidence: EvidenceItem[] = [
      { type: 'exec', content: 'curl http://localhost:3000/health' },
    ];
    const config: ShowboatProofConfig = {
      storyId: 'test',
      storyTitle: 'Test',
      acceptanceCriteria: [
        { id: '1', description: 'Health check', verified: true, evidence },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('<!-- showboat exec: curl http://localhost:3000/health -->');
    expect(result).toContain('<!-- /showboat exec -->');
  });

  it('includes showboat image blocks for image evidence', () => {
    const evidence: EvidenceItem[] = [
      { type: 'image', content: 'screenshot desc', path: 'verification/screenshots/1-1-ac1-home.png' },
    ];
    const config: ShowboatProofConfig = {
      storyId: 'test',
      storyTitle: 'Test',
      acceptanceCriteria: [
        { id: '1', description: 'UI check', verified: true, evidence },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('<!-- showboat image: verification/screenshots/1-1-ac1-home.png -->');
  });

  it('uses content as path for image evidence without explicit path', () => {
    const evidence: EvidenceItem[] = [
      { type: 'image', content: 'screenshots/test.png' },
    ];
    const config: ShowboatProofConfig = {
      storyId: 'test',
      storyTitle: 'Test',
      acceptanceCriteria: [
        { id: '1', description: 'UI check', verified: true, evidence },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('<!-- showboat image: screenshots/test.png -->');
  });

  it('includes verification summary section', () => {
    const config: ShowboatProofConfig = {
      storyId: 'test',
      storyTitle: 'Test',
      acceptanceCriteria: [
        { id: '1', description: 'First', verified: true, evidence: [] },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('## Verification Summary');
    expect(result).toContain('Total ACs | 1');
    expect(result).toContain('Verified | 1');
    expect(result).toContain('Showboat Verify | PASS');
  });

  it('handles zero ACs', () => {
    const config: ShowboatProofConfig = {
      storyId: 'empty',
      storyTitle: 'Empty Story',
      acceptanceCriteria: [],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('# Proof: empty');
    expect(result).toContain('## Verification Summary');
    expect(result).toContain('Total ACs | 0');
  });

  it('handles single AC', () => {
    const config: ShowboatProofConfig = {
      storyId: 'single',
      storyTitle: 'Single',
      acceptanceCriteria: [
        { id: '1', description: 'Only one', verified: true, evidence: [] },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('## AC 1: PASS');
    expect(result).toContain('Total ACs | 1');
  });

  it('handles many ACs', () => {
    const criteria: AcceptanceCriterion[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      description: `AC number ${i + 1}`,
      verified: i % 2 === 0,
      evidence: [],
    }));
    const config: ShowboatProofConfig = {
      storyId: 'many',
      storyTitle: 'Many ACs',
      acceptanceCriteria: criteria,
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('Total ACs | 10');
    expect(result).toContain('Verified | 5');
    expect(result).toContain('Failed | 5');
    for (let i = 1; i <= 10; i++) {
      expect(result).toContain(`## AC ${i}:`);
    }
  });

  it('shows no evidence comment when AC has empty evidence', () => {
    const config: ShowboatProofConfig = {
      storyId: 'test',
      storyTitle: 'Test',
      acceptanceCriteria: [
        { id: '1', description: 'No evidence', verified: false, evidence: [] },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('<!-- No evidence captured yet -->');
  });

  it('handles mixed exec and image evidence', () => {
    const evidence: EvidenceItem[] = [
      { type: 'exec', content: 'npm test' },
      { type: 'image', content: 'test.png', path: 'screenshots/test.png' },
    ];
    const config: ShowboatProofConfig = {
      storyId: 'mixed',
      storyTitle: 'Mixed',
      acceptanceCriteria: [
        { id: '1', description: 'Mixed evidence', verified: true, evidence },
      ],
    };
    const result = showboatProofTemplate(config);
    expect(result).toContain('<!-- showboat exec: npm test -->');
    expect(result).toContain('<!-- /showboat exec -->');
    expect(result).toContain('<!-- showboat image: screenshots/test.png -->');
  });
});
