import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerNullTask,
  getNullTask,
  listNullTasks,
  clearNullTaskRegistry,
} from '../null-task-registry.js';
import type { TaskContext, NullTaskResult } from '../null-task-registry.js';

describe('null-task-registry', () => {
  // Note: 'telemetry' is registered at module load time as a built-in.

  describe('registerNullTask / getNullTask', () => {
    it('returns undefined for an unregistered handler', () => {
      expect(getNullTask('nonexistent-handler-xyz')).toBeUndefined();
    });

    it('returns the registered handler', () => {
      const handler = async (_ctx: TaskContext): Promise<NullTaskResult> => ({
        success: true,
        output: 'test',
      });
      registerNullTask('test-handler-unique', handler);
      expect(getNullTask('test-handler-unique')).toBe(handler);
    });

    it('overwrites a previously registered handler', () => {
      const handler1 = async () => ({ success: true });
      const handler2 = async () => ({ success: false });
      registerNullTask('overwrite-test', handler1);
      registerNullTask('overwrite-test', handler2);
      expect(getNullTask('overwrite-test')).toBe(handler2);
    });
  });

  describe('listNullTasks', () => {
    it('includes built-in telemetry handler', () => {
      const names = listNullTasks();
      expect(names).toContain('telemetry');
    });

    it('includes dynamically registered handlers', () => {
      registerNullTask('list-test-handler', async () => ({ success: true }));
      const names = listNullTasks();
      expect(names).toContain('list-test-handler');
    });
  });

  describe('built-in telemetry handler', () => {
    it('exists and returns success', async () => {
      const handler = getNullTask('telemetry');
      expect(handler).toBeDefined();

      const ctx: TaskContext = {
        storyKey: 'test-story',
        taskName: 'telemetry',
        cost: 0.5,
        durationMs: 1000,
        outputContract: null,
        projectDir: '/tmp/test',
      };
      const result = await handler!(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('completes in under 10ms (AC #6)', async () => {
      const handler = getNullTask('telemetry')!;
      const ctx: TaskContext = {
        storyKey: 'perf-test',
        taskName: 'telemetry',
        cost: 0,
        durationMs: 0,
        outputContract: null,
        projectDir: '/tmp/test',
      };
      const start = performance.now();
      await handler(ctx);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('clearNullTaskRegistry', () => {
    it('removes all handlers including built-ins', () => {
      registerNullTask('clear-test-handler', async () => ({ success: true }));
      expect(getNullTask('clear-test-handler')).toBeDefined();
      expect(getNullTask('telemetry')).toBeDefined();

      clearNullTaskRegistry();

      expect(getNullTask('clear-test-handler')).toBeUndefined();
      expect(getNullTask('telemetry')).toBeUndefined();
      expect(listNullTasks()).toHaveLength(0);

      // Re-register telemetry for subsequent tests
      registerNullTask('telemetry', async () => ({ success: true, output: 'telemetry: no-op placeholder' }));
    });
  });

  describe('TaskContext interface', () => {
    it('handler receives all expected fields', async () => {
      let receivedCtx: TaskContext | null = null;
      registerNullTask('ctx-capture', async (ctx) => {
        receivedCtx = ctx;
        return { success: true };
      });

      const mockContract = {
        version: 1,
        taskName: 'implement',
        storyId: 'story-1',
        driver: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        timestamp: '2026-04-03T00:00:00.000Z',
        cost_usd: 0.05,
        duration_ms: 5000,
        changedFiles: [],
        testResults: null,
        output: 'done',
        acceptanceCriteria: [],
      };

      const ctx: TaskContext = {
        storyKey: '16-2-test',
        taskName: 'ctx-capture',
        cost: 0.05,
        durationMs: 5000,
        outputContract: mockContract,
        projectDir: '/project',
      };

      await getNullTask('ctx-capture')!(ctx);

      expect(receivedCtx).not.toBeNull();
      expect(receivedCtx!.storyKey).toBe('16-2-test');
      expect(receivedCtx!.taskName).toBe('ctx-capture');
      expect(receivedCtx!.cost).toBe(0.05);
      expect(receivedCtx!.durationMs).toBe(5000);
      expect(receivedCtx!.outputContract).toBe(mockContract);
      expect(receivedCtx!.projectDir).toBe('/project');
    });
  });
});
