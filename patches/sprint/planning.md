## WHY

Sprint planning repeatedly started new work while retrospective action items
were unresolved, leading to compounding tech debt. Stories entered sprints
with untestable ACs or missing backlog sources, causing mid-sprint scope
discovery. This patch enforces pre-planning retro review, multi-source backlog
import, and story readiness checks.
(FR33, FR34, NFR20)

## Codeharness Sprint Planning Integration

### Pre-Planning Checks

Before selecting stories, verify:
1. All prior retrospective action items are reviewed (`_bmad-output/implementation-artifacts/session-retro-*.md`)
2. Unresolved action items are surfaced — do not start new work while critical fixes are pending
3. `ralph/.story_retries` is reviewed — stories with high attempt counts may need architectural changes, not more retries

### Backlog Sources

Import from all sources before triage:
- `codeharness retro-import --epic N` for retrospective findings
- `codeharness github-import` for labeled GitHub issues
- `bd ready` to display combined backlog

### Story Readiness

- Each story has clear, testable acceptance criteria
- ACs are written so they CAN be verified from CLI + Docker (avoid writing untestable ACs)
- Dependencies between stories are explicit
