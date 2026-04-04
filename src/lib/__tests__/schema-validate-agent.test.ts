import { describe, it, expect } from 'vitest';
import { validateAgentSchema, validateWorkflowSchema } from '../schema-validate.js';

// --- Helpers ---

function minimalValidAgent() {
  return {
    name: 'evaluator',
    role: {
      title: 'Adversarial QA Evaluator',
      purpose: 'Exercise the built artifact and determine if it actually works',
    },
    persona: {
      identity: 'Senior QA who trusts nothing without evidence',
      communication_style: 'Blunt, evidence-first',
      principles: [
        'Never give the benefit of the doubt',
        'Every PASS requires evidence',
      ],
    },
  };
}

function agentWithPersonality() {
  return {
    ...minimalValidAgent(),
    personality: {
      traits: {
        rigor: 0.98,
        directness: 0.95,
        warmth: 0.2,
      },
    },
  };
}

function agentWithDisallowedTools() {
  return {
    ...minimalValidAgent(),
    disallowedTools: ['Edit', 'Write'],
  };
}

// --- Tests ---

describe('validateAgentSchema', () => {
  describe('valid agents', () => {
    it('accepts a minimal valid agent with all required fields (AC #1, #2)', () => {
      const result = validateAgentSchema(minimalValidAgent());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts agent with optional personality.traits in 0-1 range (AC #5)', () => {
      const result = validateAgentSchema(agentWithPersonality());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts agent with valid disallowedTools array', () => {
      const result = validateAgentSchema(agentWithDisallowedTools());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts agent with all optional fields present', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {
          traits: {
            rigor: 0.98,
            warmth: 0.2,
          },
        },
        disallowedTools: ['Edit', 'Write'],
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts personality with empty traits object', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: { traits: {} },
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(true);
    });

    it('accepts empty disallowedTools array', () => {
      const agent = {
        ...minimalValidAgent(),
        disallowedTools: [],
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(true);
    });

    it('accepts trait values at boundaries (0 and 1)', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {
          traits: {
            minimum: 0,
            maximum: 1,
          },
        },
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(true);
    });
  });

  describe('missing required fields', () => {
    it('rejects missing name field (AC #3)', () => {
      const { name: _, ...agent } = minimalValidAgent();
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.message.includes('name'))).toBe(true);
    });

    it('rejects missing role field (AC #3)', () => {
      const { role: _, ...agent } = minimalValidAgent();
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.message.includes('role'))).toBe(true);
    });

    it('rejects missing persona field (AC #3)', () => {
      const { persona: _, ...agent } = minimalValidAgent();
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.message.includes('persona'))).toBe(true);
    });

    it('rejects missing role.title', () => {
      const agent = minimalValidAgent();
      delete (agent.role as Record<string, unknown>).title;
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.path === '/role')).toBe(true);
    });

    it('rejects missing role.purpose', () => {
      const agent = minimalValidAgent();
      delete (agent.role as Record<string, unknown>).purpose;
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.path === '/role')).toBe(true);
    });

    it('rejects missing persona.identity', () => {
      const agent = minimalValidAgent();
      delete (agent.persona as Record<string, unknown>).identity;
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.path === '/persona')).toBe(true);
    });

    it('rejects missing persona.communication_style', () => {
      const agent = minimalValidAgent();
      delete (agent.persona as Record<string, unknown>).communication_style;
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.path === '/persona')).toBe(true);
    });

    it('rejects missing persona.principles', () => {
      const agent = minimalValidAgent();
      delete (agent.persona as Record<string, unknown>).principles;
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.path === '/persona')).toBe(true);
    });
  });

  describe('personality trait validation', () => {
    it('rejects trait value above 1 (AC #4)', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {
          traits: {
            rigor: 1.5,
          },
        },
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'maximum' && e.path.includes('rigor'))).toBe(true);
    });

    it('rejects trait value below 0 (AC #4)', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {
          traits: {
            warmth: -0.1,
          },
        },
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minimum' && e.path.includes('warmth'))).toBe(true);
    });

    it('rejects non-number trait value', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {
          traits: {
            rigor: 'high',
          },
        },
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'type')).toBe(true);
    });
  });

  describe('additional properties', () => {
    it('rejects unknown top-level property', () => {
      const agent = {
        ...minimalValidAgent(),
        unknownField: 'unexpected',
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects unknown property in role', () => {
      const agent = minimalValidAgent();
      (agent.role as Record<string, unknown>).extra = 'nope';
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects unknown property in persona', () => {
      const agent = minimalValidAgent();
      (agent.persona as Record<string, unknown>).extra = 'nope';
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('rejects unknown property in personality', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {
          traits: { rigor: 0.9 },
          extra: 'nope',
        },
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'additionalProperties')).toBe(true);
    });
  });

  describe('empty string validation', () => {
    it('rejects empty name string', () => {
      const agent = { ...minimalValidAgent(), name: '' };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minLength' && e.path === '/name')).toBe(true);
    });

    it('rejects empty role.title string', () => {
      const agent = minimalValidAgent();
      agent.role.title = '';
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minLength' && e.path === '/role/title')).toBe(true);
    });

    it('rejects empty role.purpose string', () => {
      const agent = minimalValidAgent();
      agent.role.purpose = '';
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minLength' && e.path === '/role/purpose')).toBe(true);
    });

    it('rejects empty persona.identity string', () => {
      const agent = minimalValidAgent();
      agent.persona.identity = '';
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minLength' && e.path === '/persona/identity')).toBe(true);
    });

    it('rejects empty persona.communication_style string', () => {
      const agent = minimalValidAgent();
      agent.persona.communication_style = '';
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minLength' && e.path === '/persona/communication_style')).toBe(true);
    });

    it('rejects empty string in principles array', () => {
      const agent = minimalValidAgent();
      agent.persona.principles = ['valid', ''];
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minLength')).toBe(true);
    });
  });

  describe('empty collection validation', () => {
    it('rejects empty principles array', () => {
      const agent = minimalValidAgent();
      agent.persona.principles = [];
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'minItems' && e.path === '/persona/principles')).toBe(true);
    });

    it('rejects personality without traits key', () => {
      const agent = {
        ...minimalValidAgent(),
        personality: {},
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'required' && e.path === '/personality')).toBe(true);
    });
  });

  describe('disallowedTools validation', () => {
    it('rejects non-string items in disallowedTools', () => {
      const agent = {
        ...minimalValidAgent(),
        disallowedTools: [123 as unknown as string],
      };
      const result = validateAgentSchema(agent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === 'type')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('rejects null input', () => {
      const result = validateAgentSchema(null);
      expect(result.valid).toBe(false);
    });

    it('rejects non-object input', () => {
      const result = validateAgentSchema('not an object');
      expect(result.valid).toBe(false);
    });

    it('rejects array input', () => {
      const result = validateAgentSchema([]);
      expect(result.valid).toBe(false);
    });

    it('rejects empty object', () => {
      const result = validateAgentSchema({});
      expect(result.valid).toBe(false);
    });
  });

  describe('error structure', () => {
    it('returns errors with path, message, and keyword', () => {
      const result = validateAgentSchema({});
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

    it('returns ValidationResult with valid: true and errors: [] for valid input (AC #6)', () => {
      const result = validateAgentSchema(minimalValidAgent());
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('no regressions', () => {
    it('existing workflow schema validation still works (AC #8)', () => {
      const validWorkflow = {
        tasks: { implement: { agent: 'dev' } },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
      };
      const result = validateWorkflowSchema(validWorkflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('existing workflow schema still rejects invalid input', () => {
      const result = validateWorkflowSchema({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
