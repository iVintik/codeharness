import { describe, it, expect } from 'vitest';
import { validateWorkflowSchema, validateAgainstSchema } from '../schema-validate.js';

// --- Helpers ---

function minimalValidWorkflow() {
  return {
    tasks: {
      implement: {
        agent: 'dev',
      },
    },
    story_flow: ['implement'],
    epic_flow: ['story_flow'],
  };
}

function fullValidWorkflow() {
  return {
    tasks: {
      implement: {
        agent: 'dev',
        session: 'fresh',
        source_access: true,
        prompt_template: 'Implement story {{story_key}}',
        input_contract: { type: 'object' },
        output_contract: { type: 'object' },
        max_budget_usd: 5.0,
      },
      verify: {
        agent: 'evaluator',
        session: 'continue',
        source_access: false,
      },
      retry: {
        agent: 'dev',
        session: 'fresh',
        source_access: true,
        prompt_template: 'Fix failures: {{findings}}',
      },
    },
    story_flow: ['implement', { loop: ['retry', 'verify'] }],
    epic_flow: ['story_flow', 'verify'],
  };
}

// --- Tests ---

describe('validateWorkflowSchema', () => {
  describe('valid workflows', () => {
    it('accepts a minimal valid workflow (AC #1)', () => {
      const result = validateWorkflowSchema(minimalValidWorkflow());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts a full workflow with all optional fields (AC #9)', () => {
      const result = validateWorkflowSchema(fullValidWorkflow());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts empty tasks object', () => {
      const result = validateWorkflowSchema({ tasks: {}, story_flow: [], epic_flow: [] });
      expect(result.valid).toBe(true);
    });

    it('accepts empty flow array', () => {
      const result = validateWorkflowSchema({ tasks: {}, story_flow: [], epic_flow: [] });
      expect(result.valid).toBe(true);
    });

    it('accepts a loop block in story_flow (AC #6)', () => {
      const workflow = {
        tasks: {
          retry: { agent: 'dev' },
          verify: { agent: 'evaluator' },
        },
        story_flow: [{ loop: ['retry', 'verify'] }],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(true);
    });

    it('accepts optional fields when present and passes when absent (AC #9)', () => {
      // With all optional fields
      const withOptional = validateWorkflowSchema(fullValidWorkflow());
      expect(withOptional.valid).toBe(true);

      // Without optional fields (only required agent)
      const withoutOptional = validateWorkflowSchema(minimalValidWorkflow());
      expect(withoutOptional.valid).toBe(true);
    });
  });

  describe('missing required fields', () => {
    it('rejects missing tasks field (AC #2)', () => {
      const result = validateWorkflowSchema({ story_flow: ['implement'], epic_flow: ['story_flow'] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('tasks'))).toBe(true);
      expect(result.errors.some((e) => e.keyword === 'required')).toBe(true);
    });

    it('accepts tasks-only object (story 22-1: schema no longer requires story_flow — parser enforces that)', () => {
      // After story 22-1 the schema only requires `tasks`; the parser checks for
      // story_flow vs workflow mutual-exclusion and presence. Schema-only validation
      // of { tasks: {} } is valid — parseWorkflowData() still rejects it.
      const result = validateWorkflowSchema({ tasks: {} });
      expect(result.valid).toBe(true);
    });

    it('rejects missing agent in task (AC #7)', () => {
      const workflow = {
        tasks: {
          implement: { session: 'fresh' },
        },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required')).toBe(true);
    });
  });

  describe('invalid enum values', () => {
    it('rejects unknown task fields as additionalProperties (AC #4)', () => {
      const workflow = {
        tasks: {
          implement: { agent: 'dev', scope: 'per-story' },
        },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects invalid session value (AC #5)', () => {
      const workflow = {
        tasks: {
          implement: { agent: 'dev', session: 'invalid-session' },
        },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'enum')).toBe(true);
      expect(result.errors.some((e) => e.path.includes('session'))).toBe(true);
    });
  });

  describe('invalid types', () => {
    it('rejects source_access as non-boolean', () => {
      const workflow = {
        tasks: {
          implement: { agent: 'dev', source_access: 'yes' },
        },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'type')).toBe(true);
    });

    it('rejects max_budget_usd as non-number', () => {
      const workflow = {
        tasks: {
          implement: { agent: 'dev', max_budget_usd: 'five' },
        },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'type')).toBe(true);
    });
  });

  describe('flow validation', () => {
    it('rejects invalid story_flow item types', () => {
      const workflow = {
        tasks: { implement: { agent: 'dev' } },
        story_flow: [123],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
    });

    it('rejects loop with empty array', () => {
      const workflow = {
        tasks: { retry: { agent: 'dev' } },
        story_flow: [{ loop: [] }],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
    });

    it('rejects loop with non-string items', () => {
      const workflow = {
        tasks: { retry: { agent: 'dev' } },
        story_flow: [{ loop: [123] }],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
    });

    it('rejects story_flow object with unknown properties', () => {
      const workflow = {
        tasks: { implement: { agent: 'dev' } },
        story_flow: [{ loop: ['implement'], extra: true }],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
    });
  });

  describe('additional properties', () => {
    it('rejects unknown top-level properties', () => {
      const workflow = {
        tasks: {},
        story_flow: [],
        epic_flow: [],
        extra: 'nope',
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects unknown task properties', () => {
      const workflow = {
        tasks: {
          implement: { agent: 'dev', unknown_field: true },
        },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(workflow);
      expect(result.valid).toBe(false);
    });
  });

  describe('error structure', () => {
    it('returns errors with path, message, and keyword', () => {
      const result = validateWorkflowSchema({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(err).toHaveProperty('path');
        expect(err).toHaveProperty('message');
        expect(err).toHaveProperty('keyword');
        expect(typeof err.path).toBe('string');
        expect(typeof err.message).toBe('string');
        expect(typeof err.keyword).toBe('string');
      }
    });
  });

  describe('edge cases', () => {
    it('rejects null input', () => {
      const result = validateWorkflowSchema(null);
      expect(result.valid).toBe(false);
    });

    it('rejects non-object input', () => {
      const result = validateWorkflowSchema('not an object');
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateWorkflowSchema([]);
      expect(result.valid).toBe(false);
    });
  });
});

describe('validateAgainstSchema', () => {
  it('works with the workflow schema via the generic API (valid input)', () => {
    // Use a fake validator that returns true to test the generic path
    const fakeValidate = Object.assign(
      (_data: unknown) => true,
      { errors: null, schema: {} },
    ) as unknown as Parameters<typeof validateAgainstSchema>[1];
    const result = validateAgainstSchema(minimalValidWorkflow(), fakeValidate);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('works with the workflow schema via the generic API (invalid input)', () => {
    // Use a fake validator that returns false with errors
    const fakeValidate = Object.assign(
      (_data: unknown) => false,
      {
        errors: [
          { instancePath: '/tasks', keyword: 'required', message: "must have required property 'agent'" },
        ],
        schema: {},
      },
    ) as unknown as Parameters<typeof validateAgainstSchema>[1];
    const result = validateAgainstSchema({}, fakeValidate);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('/tasks');
    expect(result.errors[0].keyword).toBe('required');
  });

  it('returns empty errors when validate.errors is null/undefined', () => {
    // Simulate a validator that returns true with no errors array
    const fakeValidate = Object.assign(
      (_data: unknown) => true,
      { errors: null, schema: {} },
    ) as unknown as Parameters<typeof validateAgainstSchema>[1];
    const result = validateAgainstSchema({}, fakeValidate);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('handles errors with undefined message', () => {
    // Simulate a validator that returns false with an error missing .message
    const fakeValidate = Object.assign(
      (_data: unknown) => false,
      {
        errors: [
          { instancePath: '/foo', keyword: 'type', message: undefined },
        ],
        schema: {},
      },
    ) as unknown as Parameters<typeof validateAgainstSchema>[1];
    const result = validateAgainstSchema({}, fakeValidate);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Unknown validation error');
    expect(result.errors[0].path).toBe('/foo');
    expect(result.errors[0].keyword).toBe('type');
  });

  it('handles errors with undefined errors array', () => {
    // Simulate a validator that fails but errors is undefined
    const fakeValidate = Object.assign(
      (_data: unknown) => false,
      { errors: undefined, schema: {} },
    ) as unknown as Parameters<typeof validateAgainstSchema>[1];
    const result = validateAgainstSchema({}, fakeValidate);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([]);
  });
});
