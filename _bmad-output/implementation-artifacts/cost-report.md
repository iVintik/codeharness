# Harness Cost Report

Total API-equivalent cost: $172.36
Total API calls: 1342
Average cost per story: $3.51 (41 stories)

## Cost by Token Type

| Type | Tokens | Rate | Cost | % |
|------|--------|------|------|---|
| Cache reads | 71,279,282 | $1.50/MTok | $106.92 | 62% |
| Cache writes | 2,005,845 | $18.75/MTok | $37.61 | 22% |
| Output | 369,987 | $75/MTok | $27.75 | 16% |
| Input | 5,356 | $15/MTok | $0.08 | 0% |

## Cost by Phase

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 653 | $78.30 | 45.4% |
| orchestrator | 148 | $30.95 | 18.0% |
| create-story | 175 | $19.41 | 11.3% |
| dev-story | 152 | $16.83 | 9.8% |
| code-review | 129 | $15.14 | 8.8% |
| retro | 85 | $11.72 | 6.8% |

## Cost by Tool

| Tool | Calls | Cost | % |
|------|-------|------|---|
| Bash | 390 | $42.61 | 24.7% |
| Read | 317 | $42.48 | 24.6% |
| Edit | 282 | $34.64 | 20.1% |
| Agent | 160 | $23.02 | 13.4% |
| Skill | 30 | $11.07 | 6.4% |
| Grep | 83 | $9.01 | 5.2% |
| Write | 36 | $4.59 | 2.7% |
| Glob | 31 | $3.37 | 2.0% |
| TodoWrite | 11 | $1.41 | 0.8% |
| ToolSearch | 2 | $0.16 | 0.1% |

## Top 10 Most Expensive Stories

| Story | Calls | Cost | % |
|-------|-------|------|---|
| unknown | 122 | $28.58 | 16.6% |
| 5-1-flow-execution-sequential-steps | 65 | $8.84 | 5.1% |
| 2-1-workflow-yaml-json-schema | 69 | $8.51 | 4.9% |
| 9-2-custom-workflow-creation | 64 | $6.83 | 4.0% |
| 3-2-embedded-agent-templates | 49 | $6.42 | 3.7% |
| 6-2-evaluator-verdict-json-schema-parsing | 45 | $6.15 | 3.6% |
| 5-4-run-status-commands | 55 | $6.14 | 3.6% |
| 9-1-workflow-patch-resolution | 53 | $6.09 | 3.5% |
| 1-3-workflow-state-module | 47 | $5.48 | 3.2% |
| 6-1-evaluator-module-workspace-spawn | 50 | $5.46 | 3.2% |