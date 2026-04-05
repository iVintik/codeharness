import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  WorkflowError,
  isWorkflowError,
  isEngineError,
  isLoopBlock,
  isGateConfig,
  isForEachConfig,
  type DispatchInput,
  type DispatchOutput,
  type EngineConfig,
  type EngineError,
  type EngineEvent,
  type EngineResult,
  type EpicContext,
  type FlowStep,
  type ForEachConfig,
  type GateConfig,
  type GateContext,
  type NullTaskInput,
  type RunContext,
  type StoryContext,
  type WorkItem,
} from '../workflow-types.js';

describe('WorkflowError', () => {
  it('stores structured fields and passes instanceof checks', () => {
    const error = new WorkflowError('boom', 'RATE_LIMIT', 'implement', '24-1-shared-types-module');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WorkflowError);
    expect(error.name).toBe('WorkflowError');
    expect(error.message).toBe('boom');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.taskName).toBe('implement');
    expect(error.storyKey).toBe('24-1-shared-types-module');
  });
});

describe('type guards', () => {
  it('identifies workflow and engine errors', () => {
    const workflowError = new WorkflowError('halt', 'UNKNOWN', 'verify', '24-1');
    const plainError: EngineError = { taskName: 'verify', storyKey: '24-1', code: 'UNKNOWN', message: 'halt' };

    expect(isWorkflowError(workflowError)).toBe(true);
    expect(isEngineError(workflowError)).toBe(true);
    expect(isEngineError(plainError)).toBe(true);
    expect(isWorkflowError(plainError)).toBe(false);
    expect(isEngineError({ taskName: 'verify', code: 'UNKNOWN', message: 'halt' })).toBe(false);
  });

  it('narrows loop, gate, and for_each flow steps', () => {
    const loopStep: FlowStep = { loop: ['implement'] };
    const gateStep: FlowStep = { gate: 'quality', check: ['check'], fix: ['retry'], pass_when: 'consensus', max_retries: 3, circuit_breaker: 'stagnation' };
    const forEachStep: FlowStep = { for_each: 'story', steps: ['implement'] };

    expect(isLoopBlock(loopStep)).toBe(true);
    expect(isGateConfig(gateStep)).toBe(true);
    expect(isForEachConfig(forEachStep)).toBe(true);
    expect(isGateConfig(loopStep)).toBe(false);
    expect(isForEachConfig(gateStep)).toBe(false);
  });
});

describe('exports', () => {
  it('exports the consolidated types as importable symbols', () => {
    expectTypeOf<RunContext>().toBeObject();
    expectTypeOf<EpicContext>().toBeObject();
    expectTypeOf<StoryContext>().toBeObject();
    expectTypeOf<GateContext>().toBeObject();
    expectTypeOf<EngineConfig>().toBeObject();
    expectTypeOf<EngineResult>().toBeObject();
    expectTypeOf<EngineEvent>().toBeObject();
    expectTypeOf<WorkItem>().toBeObject();
    expectTypeOf<DispatchInput>().toBeObject();
    expectTypeOf<DispatchOutput>().toBeObject();
    expectTypeOf<NullTaskInput>().toBeObject();
    expectTypeOf<GateConfig>().toBeObject();
    expectTypeOf<ForEachConfig>().toBeObject();
    expectTypeOf<FlowStep>().toMatchTypeOf<string | { loop: string[] } | GateConfig | ForEachConfig>();
  });
});
