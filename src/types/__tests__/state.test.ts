import { describe, it, expect } from 'vitest';
import type {
  SprintState,
  SprintStateV1,
  SprintStateV2,
  SprintStateAny,
  StoryState,
  StoryStatus,
  AcResult,
  AcVerdict,
  ActionItem,
  ActionItemSource,
  EpicState,
  SessionState,
  ObservabilityState,
} from '../state.js';

describe('SprintState types', () => {
  describe('SprintStateV2', () => {
    it('accepts a valid v2 fixture matching the architecture schema', () => {
      const state: SprintStateV2 = {
        version: 2,
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
        retries: { '1-1-result-type': 2 },
        flagged: ['0-2-infra'],
        epics: {
          '1': { status: 'in-progress', storiesTotal: 3, storiesDone: 1 },
        },
        session: {
          active: true,
          startedAt: '2026-03-17T09:00:00Z',
          iteration: 3,
          elapsedSeconds: 3600,
        },
        observability: {
          statementCoverage: 85.2,
          branchCoverage: null,
          functionCoverage: 90.0,
          lineCoverage: null,
        },
        run: {
          active: true,
          startedAt: '2026-03-17T09:00:00Z',
          iteration: 3,
          cost: 1.25,
          completed: ['0-1-setup'],
          failed: ['0-2-infra'],
          currentStory: '1-1-result-type',
          currentPhase: 'dev',
          lastAction: 'Building',
          acProgress: '2/5',
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

      expect(state.version).toBe(2);
      expect(state.sprint.total).toBe(5);
      expect(state.retries['1-1-result-type']).toBe(2);
      expect(state.flagged).toContain('0-2-infra');
      expect(state.epics['1'].storiesTotal).toBe(3);
      expect(state.session.active).toBe(true);
      expect(state.session.elapsedSeconds).toBe(3600);
      expect(state.observability.statementCoverage).toBe(85.2);
      expect(state.run.currentStory).toBe('1-1-result-type');
    });

    it('SprintState is an alias for SprintStateV2', () => {
      const state: SprintState = {
        version: 2,
        sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {},
        retries: {},
        flagged: [],
        epics: {},
        session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
        observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
        run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
        actionItems: [],
      };
      // SprintState should be assignable to SprintStateV2
      const v2: SprintStateV2 = state;
      expect(v2.version).toBe(2);
    });
  });

  describe('SprintStateV1', () => {
    it('accepts a valid v1 fixture', () => {
      const state: SprintStateV1 = {
        version: 1,
        sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {},
        run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
        actionItems: [],
      };
      expect(state.version).toBe(1);
    });
  });

  describe('SprintStateAny', () => {
    it('union accepts both v1 and v2', () => {
      const v1: SprintStateAny = {
        version: 1,
        sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {},
        run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
        actionItems: [],
      };
      const v2: SprintStateAny = {
        version: 2,
        sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {},
        retries: {},
        flagged: [],
        epics: {},
        session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
        observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
        run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
        actionItems: [],
      };
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
    });
  });

  describe('EpicState', () => {
    it('has required fields', () => {
      const epic: EpicState = { status: 'in-progress', storiesTotal: 5, storiesDone: 2 };
      expect(epic.status).toBe('in-progress');
      expect(epic.storiesTotal).toBe(5);
      expect(epic.storiesDone).toBe(2);
    });
  });

  describe('SessionState', () => {
    it('has required fields', () => {
      const session: SessionState = { active: true, startedAt: '2026-01-01', iteration: 3, elapsedSeconds: 1200 };
      expect(session.active).toBe(true);
      expect(session.elapsedSeconds).toBe(1200);
    });
  });

  describe('ObservabilityState', () => {
    it('has required fields with nullable coverage', () => {
      const obs: ObservabilityState = { statementCoverage: 90.1, branchCoverage: null, functionCoverage: 80.0, lineCoverage: null };
      expect(obs.statementCoverage).toBe(90.1);
      expect(obs.branchCoverage).toBeNull();
    });
  });

  describe('StoryState', () => {
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
