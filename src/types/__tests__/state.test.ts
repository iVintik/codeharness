import { describe, it, expect } from 'vitest';
import type {
  SprintState,
  StoryState,
  StoryStatus,
  AcResult,
  AcVerdict,
  ActionItem,
  ActionItemSource,
} from '../state.js';

describe('SprintState types', () => {
  describe('SprintState', () => {
    it('accepts a valid fixture matching the architecture schema', () => {
      const state: SprintState = {
        version: 1,
        sprint: {
          total: 5,
          done: 2,
          failed: 1,
          blocked: 0,
          inProgress: '1-1-result-type',
        },
        stories: {
          '1-1-result-type': {
            status: 'in-progress',
            attempts: 1,
            lastAttempt: '2026-03-17T10:00:00Z',
            lastError: null,
            proofPath: null,
            acResults: [
              { id: 'ac-1', verdict: 'pass' },
              { id: 'ac-2', verdict: 'pending' },
            ],
          },
        },
        run: {
          active: true,
          startedAt: '2026-03-17T09:00:00Z',
          iteration: 3,
          cost: 1.25,
          completed: ['0-1-setup'],
          failed: ['0-2-infra'],
        },
        actionItems: [
          {
            id: 'ai-1',
            story: '0-2-infra',
            description: 'Fix Docker networking',
            source: 'verification',
            resolved: false,
          },
        ],
      };

      // Verify structure is correct by checking key fields
      expect(state.version).toBe(1);
      expect(state.sprint.total).toBe(5);
      expect(state.sprint.inProgress).toBe('1-1-result-type');
      expect(state.stories['1-1-result-type'].status).toBe('in-progress');
      expect(state.stories['1-1-result-type'].acResults).toHaveLength(2);
      expect(state.run.active).toBe(true);
      expect(state.actionItems).toHaveLength(1);
    });

    it('accepts null values for nullable fields', () => {
      const story: StoryState = {
        status: 'backlog',
        attempts: 0,
        lastAttempt: null,
        lastError: null,
        proofPath: null,
        acResults: null,
      };

      expect(story.lastAttempt).toBeNull();
      expect(story.lastError).toBeNull();
      expect(story.proofPath).toBeNull();
      expect(story.acResults).toBeNull();
    });
  });

  describe('StoryStatus', () => {
    it('covers all expected values', () => {
      const allStatuses: StoryStatus[] = [
        'backlog',
        'ready',
        'in-progress',
        'review',
        'verifying',
        'done',
        'failed',
        'blocked',
      ];

      expect(allStatuses).toHaveLength(8);
      // Verify each is a valid StoryStatus by assigning (compile-time check)
      for (const status of allStatuses) {
        expect(typeof status).toBe('string');
      }
    });
  });

  describe('AcResult', () => {
    it('supports all verdict values', () => {
      const verdicts: AcVerdict[] = ['pass', 'fail', 'escalate', 'pending'];
      expect(verdicts).toHaveLength(4);

      const result: AcResult = { id: 'ac-1', verdict: 'pass' };
      expect(result.id).toBe('ac-1');
      expect(result.verdict).toBe('pass');
    });
  });

  describe('ActionItem', () => {
    it('supports all source values', () => {
      const sources: ActionItemSource[] = ['verification', 'retro', 'manual'];
      expect(sources).toHaveLength(3);

      const item: ActionItem = {
        id: 'ai-1',
        story: 'story-1',
        description: 'Fix the thing',
        source: 'manual',
        resolved: false,
      };
      expect(item.resolved).toBe(false);
    });
  });
});
