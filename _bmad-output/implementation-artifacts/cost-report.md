# Harness Cost Report

Total API-equivalent cost: $889.68
Total API calls: 6486
Average cost per story: $4.15 (158 stories)

## Cost by Token Type

| Type | Tokens | Rate | Cost | % |
|------|--------|------|------|---|
| Cache reads | 345,157,319 | $1.50/MTok | $517.74 | 58% |
| Cache writes | 12,416,470 | $18.75/MTok | $232.81 | 26% |
| Output | 1,852,111 | $75/MTok | $138.91 | 16% |
| Input | 15,167 | $15/MTok | $0.23 | 0% |

## Cost by Phase

| Phase | Calls | Cost | % |
|-------|-------|------|---|
| verify | 3803 | $473.01 | 53.2% |
| orchestrator | 904 | $199.19 | 22.4% |
| retro | 763 | $104.46 | 11.7% |
| code-review | 397 | $45.89 | 5.2% |
| create-story | 348 | $37.05 | 4.2% |
| dev-story | 271 | $30.07 | 3.4% |

## Cost by Tool

| Tool | Calls | Cost | % |
|------|-------|------|---|
| Bash | 2400 | $294.71 | 33.1% |
| Read | 1356 | $188.17 | 21.1% |
| Edit | 1013 | $130.57 | 14.7% |
| Agent | 628 | $81.91 | 9.2% |
| Skill | 222 | $76.53 | 8.6% |
| Grep | 454 | $51.45 | 5.8% |
| Write | 159 | $28.32 | 3.2% |
| Glob | 111 | $19.26 | 2.2% |
| TodoWrite | 111 | $15.24 | 1.7% |
| ToolSearch | 28 | $3.10 | 0.3% |

## Top 10 Most Expensive Stories

| Story | Calls | Cost | % |
|-------|-------|------|---|
| unknown | 1185 | $234.64 | 26.4% |
| 16-5-rewrite-harness-run-verification-dispatch | 648 | $78.78 | 8.9% |
| 1-1-foo | 198 | $24.35 | 2.7% |
| 16-7-update-knowledge-and-enforcement-docs | 199 | $23.64 | 2.7% |
| 14-5-stack-aware-verify-dockerfile | 190 | $23.63 | 2.7% |
| 14-4-observability-backend-choice | 192 | $22.13 | 2.5% |
| 16-8-update-all-tests | 150 | $18.06 | 2.0% |
| 8-9-semgrep-rules-rust-observability | 121 | $17.10 | 1.9% |
| 8-2-expand-state-types-for-rust | 84 | $12.67 | 1.4% |
| 9-5-multi-stack-docs-remaining-consumers | 84 | $11.07 | 1.2% |