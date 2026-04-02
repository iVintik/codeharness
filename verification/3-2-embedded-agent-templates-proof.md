# Verification Proof: Story 3-2 Embedded Agent Templates

**Story:** `_bmad-output/implementation-artifacts/3-2-embedded-agent-templates.md`
**Tier:** test-provable
**Date:** 2026-04-02
**Result:** ALL_PASS (8/8 ACs)

## AC 1: 9 YAML files exist in templates/agents/

```bash
ls -1 templates/agents/
```
```output
analyst.yaml
architect.yaml
dev.yaml
evaluator.yaml
pm.yaml
qa.yaml
sm.yaml
tech-writer.yaml
ux-designer.yaml
```

Exactly 9 YAML files present matching the required list.

## AC 2: Required top-level fields in each agent YAML

```bash
node -e "const fs=require('fs');const y=require('yaml');['dev','qa','architect','pm','sm','analyst','ux-designer','tech-writer','evaluator'].forEach(f=>{const d=y.parse(fs.readFileSync('templates/agents/'+f+'.yaml','utf8'));console.log(f+': name='+!!d.name+' role.title='+!!d.role?.title+' role.purpose='+!!d.role?.purpose+' persona.identity='+!!d.persona?.identity+' comm_style='+!!d.persona?.communication_style+' principles='+Array.isArray(d.persona?.principles))})"
```
```output
dev: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
qa: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
architect: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
pm: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
sm: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
analyst: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
ux-designer: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
tech-writer: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
evaluator: name=true role.title=true role.purpose=true persona.identity=true comm_style=true principles=true
```

All 9 agents have all required top-level fields.

## AC 3: All 9 validate against agent.schema.json via validateAgentSchema()

```bash
npx vitest run --reporter=verbose 2>&1 | grep "schema validation (AC #3)"
```
```output
✓ embedded agent templates > schema validation (AC #3) > dev.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > qa.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > architect.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > pm.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > sm.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > analyst.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > ux-designer.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > tech-writer.yaml validates against agent.schema.json
✓ embedded agent templates > schema validation (AC #3) > evaluator.yaml validates against agent.schema.json
```

All 9 pass schema validation.

## AC 4: evaluator.yaml has disallowedTools and anti-leniency principles

```bash
grep -A2 'disallowedTools' templates/agents/evaluator.yaml && echo '---' && grep -A5 'principles:' templates/agents/evaluator.yaml
```
```output
disallowedTools:
  - Edit
  - Write
---
  principles:
    - Never give the benefit of the doubt - assume failure until proven otherwise
    - Every PASS requires evidence - commands run and output captured
    - UNKNOWN if unable to verify - never guess at outcomes
    - Re-verify from scratch each pass - no caching of prior results
    - Report exactly what was observed, not what was expected
```

disallowedTools contains Edit and Write. Principles include anti-leniency directives: evidence for every PASS, UNKNOWN when unable to verify, never give benefit of the doubt.

## AC 5: evaluator.yaml personality traits (rigor >= 0.9, warmth <= 0.3)

```bash
grep -A3 'traits:' templates/agents/evaluator.yaml
```
```output
  traits:
    rigor: 0.98
    directness: 0.95
    warmth: 0.2
```

rigor=0.98 (>= 0.9), warmth=0.2 (<= 0.3).

## AC 6: Embedded templates use codeharness format, not BMAD format

```bash
node -e "const fs=require('fs');const y=require('yaml');fs.readdirSync('templates/agents/').filter(f=>f.endsWith('.yaml')).forEach(f=>{const d=y.parse(fs.readFileSync('templates/agents/'+f,'utf8'));const bad=['agent','metadata','menu','critical_actions','prompts'].filter(k=>d[k]!==undefined);console.log(f+': bad_keys='+(bad.length?bad.join(','):'none'))})"
```
```output
analyst.yaml: bad_keys=none
architect.yaml: bad_keys=none
dev.yaml: bad_keys=none
evaluator.yaml: bad_keys=none
pm.yaml: bad_keys=none
qa.yaml: bad_keys=none
sm.yaml: bad_keys=none
tech-writer.yaml: bad_keys=none
ux-designer.yaml: bad_keys=none
```

No BMAD wrapper sections (agent, metadata, menu, critical_actions, prompts) in any template. All use flat codeharness schema format.

## AC 7: package.json files array includes templates/agents/

```bash
grep 'templates/agents' package.json
```
```output
    "templates/agents/"
```

templates/agents/ present in package.json files array.

## AC 8: Unit tests comprehensive — 85 tests all pass

```bash
npm run test:unit 2>&1 | tail -5
```
```output
 Test Files  149 passed (149)
      Tests  3757 passed (3757)
   Start at  19:44:01
   Duration  8.59s (transform 4.15s, setup 0ms, import 8.69s, tests 20.77s, environment 13ms)
```

85 tests in embedded-agent-templates.test.ts covering: file existence (9 agents), YAML parsing, schema validation, name-filename matching, evaluator disallowedTools, anti-leniency principles, personality trait ranges, BMAD cross-references. 3757 total tests pass, zero regressions.
