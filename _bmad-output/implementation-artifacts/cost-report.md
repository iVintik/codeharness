# Harness Cost Report

Total API-equivalent cost: $140.54
Total API calls: 1090
Average cost per story: $3.57 (33 stories)

## Cost by Token Type

| Type | Tokens | Rate | Cost | % |
|------|--------|------|------|---|
| Cache reads | 58,214,712 | $1.50/MTok | $87.32 | 62% |
| Cache writes | 1,604,785 | $18.75/MTok | $30.09 | 21% |
| Output | 307,347 | $75/MTok | $23.05 | 16% |
| Input | 5,081 | $15/MTok | $0.08 | 0% |

## Cost by Phase

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 557 | $67.20 | 47.8% |
| orchestrator | 123 | $24.39 | 17.4% |
| dev-story | 127 | $14.20 | 10.1% |
| create-story | 115 | $13.46 | 9.6% |
| code-review | 107 | $12.61 | 9.0% |
| retro | 61 | $8.68 | 6.2% |

## Cost by Tool

| Tool | Calls | Cost | % |
|------|-------|------|---|
| Read | 268 | $35.48 | 25.2% |
| Bash | 304 | $33.49 | 23.8% |
| Edit | 228 | $28.32 | 20.1% |
| Agent | 134 | $19.30 | 13.7% |
| Skill | 25 | $8.66 | 6.2% |
| Grep | 59 | $6.54 | 4.7% |
| Write | 34 | $4.32 | 3.1% |
| Glob | 25 | $2.87 | 2.0% |
| TodoWrite | 11 | $1.41 | 1.0% |
| ToolSearch | 2 | $0.16 | 0.1% |

## Top 10 Most Expensive Stories

| Story | Calls | Cost | % |
|-------|-------|------|---|
| unknown | 105 | $22.88 | 16.3% |
| 5-1-flow-execution-sequential-steps | 65 | $8.84 | 6.3% |
| 2-1-workflow-yaml-json-schema | 69 | $8.51 | 6.1% |
| 3-2-embedded-agent-templates | 49 | $6.42 | 4.6% |
| 6-2-evaluator-verdict-json-schema-parsing | 45 | $6.15 | 4.4% |
| 5-4-run-status-commands | 55 | $6.14 | 4.4% |
| 1-3-workflow-state-module | 47 | $5.48 | 3.9% |
| 6-1-evaluator-module-workspace-spawn | 50 | $5.46 | 3.9% |
| 5-2-flow-execution-loop-blocks | 42 | $5.28 | 3.8% |
| 4-3-trace-id-generation-injection | 51 | $5.20 | 3.7% |