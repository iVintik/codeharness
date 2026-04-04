import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { validateAgentSchema } from '../schema-validate.js';

const TEMPLATES_DIR = path.resolve(__dirname, '../../../templates/agents');

const EXPECTED_AGENTS = [
  'dev',
  'qa',
  'architect',
  'pm',
  'sm',
  'analyst',
  'ux-designer',
  'tech-writer',
  'evaluator',
  'reviewer',
  'retro',
];

/** Cache parsed agents to avoid redundant fs reads across test groups */
const agentCache = new Map<string, Record<string, unknown>>();

function loadAgent(name: string): Record<string, unknown> {
  const cached = agentCache.get(name);
  if (cached) return cached;
  const filePath = path.join(TEMPLATES_DIR, `${name}.yaml`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = YAML.parse(content) as Record<string, unknown>;
  agentCache.set(name, parsed);
  return parsed;
}

describe('embedded agent templates', () => {
  describe('directory and file existence (AC #1)', () => {
    it('templates/agents/ directory exists', () => {
      expect(fs.existsSync(TEMPLATES_DIR)).toBe(true);
    });

    it('contains exactly 11 YAML files', () => {
      const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.yaml'));
      expect(files).toHaveLength(11);
    });

    it.each(EXPECTED_AGENTS)('%s.yaml exists', (name) => {
      const filePath = path.join(TEMPLATES_DIR, `${name}.yaml`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('YAML parsing (AC #2)', () => {
    it.each(EXPECTED_AGENTS)('%s.yaml parses as valid YAML', (name) => {
      const agent = loadAgent(name);
      expect(agent).toBeDefined();
      expect(typeof agent).toBe('object');
    });

    it.each(EXPECTED_AGENTS)('%s.yaml has required top-level fields: name, role, persona', (name) => {
      const agent = loadAgent(name);
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('role');
      expect(agent).toHaveProperty('persona');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.role).toBe('object');
      expect(typeof agent.persona).toBe('object');

      const role = agent.role as Record<string, unknown>;
      expect(role).toHaveProperty('title');
      expect(role).toHaveProperty('purpose');

      const persona = agent.persona as Record<string, unknown>;
      expect(persona).toHaveProperty('identity');
      expect(persona).toHaveProperty('communication_style');
      expect(persona).toHaveProperty('principles');
      expect(Array.isArray(persona.principles)).toBe(true);
    });
  });

  describe('schema validation (AC #3)', () => {
    it.each(EXPECTED_AGENTS)('%s.yaml validates against agent.schema.json', (name) => {
      const agent = loadAgent(name);
      const result = validateAgentSchema(agent);
      expect(result).toEqual({ valid: true, errors: [] });
    });
  });

  describe('name matches filename (AC #8)', () => {
    it.each(EXPECTED_AGENTS)('%s.yaml has name field matching filename stem', (name) => {
      const agent = loadAgent(name);
      expect(agent.name).toBe(name);
    });
  });

  describe('evaluator agent specifics (AC #4, #5)', () => {
    it('evaluator.yaml contains disallowedTools with Edit and Write', () => {
      const agent = loadAgent('evaluator');
      expect(agent.disallowedTools).toBeDefined();
      expect(Array.isArray(agent.disallowedTools)).toBe(true);
      const tools = agent.disallowedTools as string[];
      expect(tools).toContain('Edit');
      expect(tools).toContain('Write');
    });

    it('evaluator.yaml persona.principles includes anti-leniency keywords', () => {
      const agent = loadAgent('evaluator');
      const persona = agent.persona as Record<string, unknown>;
      const principles = persona.principles as string[];
      const joined = principles.join(' ');

      expect(joined).toContain('evidence');
      expect(joined).toContain('UNKNOWN');
      expect(joined).toContain('benefit of the doubt');
    });

    it('evaluator.yaml personality.traits.rigor >= 0.9', () => {
      const agent = loadAgent('evaluator');
      const personality = agent.personality as Record<string, unknown>;
      const traits = personality.traits as Record<string, number>;
      expect(traits.rigor).toBeGreaterThanOrEqual(0.9);
    });

    it('evaluator.yaml personality.traits.warmth <= 0.3', () => {
      const agent = loadAgent('evaluator');
      const personality = agent.personality as Record<string, unknown>;
      const traits = personality.traits as Record<string, number>;
      expect(traits.warmth).toBeLessThanOrEqual(0.3);
    });
  });

  describe('BMAD derivation format (AC #6)', () => {
    const bmadDerived = EXPECTED_AGENTS.filter((n) => !['evaluator', 'reviewer', 'retro'].includes(n));

    it.each(bmadDerived)('%s.yaml uses flat codeharness format (no agent: wrapper)', (name) => {
      const agent = loadAgent(name);
      // Must NOT have BMAD-specific sections
      expect(agent).not.toHaveProperty('agent');
      expect(agent).not.toHaveProperty('metadata');
      expect(agent).not.toHaveProperty('menu');
      expect(agent).not.toHaveProperty('critical_actions');
      expect(agent).not.toHaveProperty('prompts');
    });

    it.each(bmadDerived)('%s.yaml does not have personality.traits (only evaluator gets traits)', (name) => {
      const agent = loadAgent(name);
      expect(agent).not.toHaveProperty('personality');
    });
  });

  describe('BMAD derivation content (AC #6)', () => {
    const BMAD_AGENTS_DIR = path.resolve(__dirname, '../../../_bmad/bmm/agents');

    /** Map of template name → BMAD agent YAML path */
    const bmadPaths: Record<string, string> = {
      dev: path.join(BMAD_AGENTS_DIR, 'dev.agent.yaml'),
      qa: path.join(BMAD_AGENTS_DIR, 'qa.agent.yaml'),
      architect: path.join(BMAD_AGENTS_DIR, 'architect.agent.yaml'),
      pm: path.join(BMAD_AGENTS_DIR, 'pm.agent.yaml'),
      sm: path.join(BMAD_AGENTS_DIR, 'sm.agent.yaml'),
      analyst: path.join(BMAD_AGENTS_DIR, 'analyst.agent.yaml'),
      'ux-designer': path.join(BMAD_AGENTS_DIR, 'ux-designer.agent.yaml'),
      'tech-writer': path.join(BMAD_AGENTS_DIR, 'tech-writer/tech-writer.agent.yaml'),
    };

    const bmadDerived = EXPECTED_AGENTS.filter((n) => !['evaluator', 'reviewer', 'retro'].includes(n));

    it.each(bmadDerived)('%s.yaml persona.identity derives from BMAD persona.identity', (name) => {
      const template = loadAgent(name);
      const bmadContent = fs.readFileSync(bmadPaths[name], 'utf-8');
      const bmad = YAML.parse(bmadContent) as Record<string, unknown>;
      const bmadAgent = bmad.agent as Record<string, unknown>;
      const bmadPersona = bmadAgent.persona as Record<string, unknown>;
      const templatePersona = template.persona as Record<string, unknown>;

      // Template identity should contain the core BMAD identity text (possibly trimmed/reformatted)
      const bmadIdentity = String(bmadPersona.identity).trim();
      const templateIdentity = String(templatePersona.identity).trim();
      // At minimum, the first 20 chars of the BMAD identity should appear in the template
      const bmadPrefix = bmadIdentity.substring(0, 20);
      expect(templateIdentity).toContain(bmadPrefix);
    });

    it.each(bmadDerived)('%s.yaml role.title derives from BMAD metadata.title', (name) => {
      const template = loadAgent(name);
      const bmadContent = fs.readFileSync(bmadPaths[name], 'utf-8');
      const bmad = YAML.parse(bmadContent) as Record<string, unknown>;
      const bmadAgent = bmad.agent as Record<string, unknown>;
      const bmadMetadata = bmadAgent.metadata as Record<string, unknown>;
      const templateRole = template.role as Record<string, unknown>;

      expect(templateRole.title).toBe(String(bmadMetadata.title));
    });
  });

  describe('no regressions (AC #8)', () => {
    it('existing schema validation still works for valid agent objects', () => {
      const result = validateAgentSchema({
        name: 'test-agent',
        role: { title: 'Test', purpose: 'Testing' },
        persona: {
          identity: 'A test agent',
          communication_style: 'Direct',
          principles: ['Be thorough'],
        },
      });
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('existing schema validation still rejects invalid agent objects', () => {
      const result = validateAgentSchema({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
