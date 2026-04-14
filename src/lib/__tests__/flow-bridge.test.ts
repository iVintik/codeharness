import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFlowWorkflow, type FlowBridgeOptions } from '../flow-bridge.js';
import type { GeneratedWorkflow } from '../workflow-generator.js';

// Mock lilflow's executeWorkflow and parseWorkflowContent to avoid real process spawning
vi.mock('lilflow/src/run-workflow.js', () => ({
  executeWorkflow: vi.fn(async () => {}),
  parseWorkflowContent: vi.fn((_yaml: string, _label: string) => ({
    name: 'mocked',
    version: '1.0',
    parameters: [],
    steps: [{ name: 'echo', stepType: 'run', run: 'echo hello' }],
  })),
}));

// @ts-expect-error — mocked module
import { executeWorkflow as mockFlowExecute, parseWorkflowContent as mockParse } from 'lilflow/src/run-workflow.js';

beforeEach(() => {
  vi.mocked(mockFlowExecute).mockReset();
  vi.mocked(mockFlowExecute).mockResolvedValue(undefined);
  vi.mocked(mockParse).mockReset();
  vi.mocked(mockParse).mockImplementation((_yaml: string, _label: string) => ({
    name: 'mocked',
    version: '1.0',
    parameters: [],
    steps: [{ name: 'echo', stepType: 'run', run: 'echo hello' }],
  }));
});

function makeWorkflow(steps: GeneratedWorkflow['steps'] = []): GeneratedWorkflow {
  return {
    name: 'test-workflow',
    version: '1.0',
    steps: steps.length > 0 ? steps : [{ name: 'echo', run: 'echo hello' }],
  };
}

describe('flow-bridge', () => {
  describe('runFlowWorkflow', () => {
    it('returns success when executeWorkflow completes without error', async () => {
      vi.mocked(mockFlowExecute).mockResolvedValue(undefined);

      const result = await runFlowWorkflow({
        workflow: makeWorkflow(),
        cwd: '/tmp/test',
      });

      expect(result.success).toBe(true);
      expect(result.finalPhase).toBe('completed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns failure when executeWorkflow throws', async () => {
      vi.mocked(mockFlowExecute).mockRejectedValue(new Error('step failed'));

      const result = await runFlowWorkflow({
        workflow: makeWorkflow(),
        cwd: '/tmp/test',
      });

      expect(result.success).toBe(false);
      expect(result.finalPhase).toBe('failed');
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].code).toBe('FLOW_ERROR');
      expect(result.errors[0].message).toContain('step failed');
    });

    it('serializes workflow to YAML and parses via flow parser', async () => {
      vi.mocked(mockFlowExecute).mockResolvedValue(undefined);

      const workflow = makeWorkflow([
        { name: 'step-a', run: 'echo a' },
        { name: 'step-b', run: 'echo b', retry: 3, retry_delay: '2s' },
      ]);

      await runFlowWorkflow({ workflow, cwd: '/tmp/test' });

      // parseWorkflowContent should have been called with a YAML string
      const parseArgs = vi.mocked(mockParse).mock.calls[0];
      expect(parseArgs[0]).toContain('step-a');
      expect(parseArgs[0]).toContain('step-b');
      expect(parseArgs[0]).toContain('retry: 3');
      expect(parseArgs[0]).toContain('retry_delay: 2s');
    });

    it('passes cwd and env to flow', async () => {
      vi.mocked(mockFlowExecute).mockResolvedValue(undefined);

      await runFlowWorkflow({
        workflow: makeWorkflow(),
        cwd: '/my/project',
        env: { FOO: 'bar' },
      });

      const callArgs = vi.mocked(mockFlowExecute).mock.calls[0][0];
      expect(callArgs.cwd).toBe('/my/project');
      expect(callArgs.env).toEqual({ FOO: 'bar' });
    });

    it('disables flow signal handlers', async () => {
      vi.mocked(mockFlowExecute).mockResolvedValue(undefined);

      await runFlowWorkflow({ workflow: makeWorkflow(), cwd: '/tmp' });

      const callArgs = vi.mocked(mockFlowExecute).mock.calls[0][0];
      expect(callArgs.attachSignalHandlers).toBe(false);
    });

    it('handles cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      vi.mocked(mockFlowExecute).mockImplementation(async () => {
        controller.abort();
        throw new Error('cancelled');
      });

      const result = await runFlowWorkflow({
        workflow: makeWorkflow(),
        cwd: '/tmp',
        abortSignal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.finalPhase).toBe('interrupted');
    });

    it('routes stdout events to onEvent callback', async () => {
      vi.mocked(mockFlowExecute).mockImplementation(async (opts: { stdout: (msg: string) => void }) => {
        opts.stdout('Step completed ✓');
      });

      const events: unknown[] = [];
      await runFlowWorkflow({
        workflow: makeWorkflow(),
        cwd: '/tmp',
        onEvent: (e) => events.push(e),
      });

      expect(events.length).toBeGreaterThan(0);
      const streamEvent = events.find((e: unknown) => (e as { type: string }).type === 'stream-event');
      expect(streamEvent).toBeDefined();
    });

    it('disables persistence when persist=false', async () => {
      vi.mocked(mockFlowExecute).mockResolvedValue(undefined);

      await runFlowWorkflow({
        workflow: makeWorkflow(),
        cwd: '/tmp',
        persist: false,
      });

      const callArgs = vi.mocked(mockFlowExecute).mock.calls[0][0];
      expect(callArgs.eventLogger).toBeNull();
    });
  });
});
