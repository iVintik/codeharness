## WHY

Stories were marked "done" with no proof artifact, or with proofs that only
grepped source code instead of exercising the feature from the user's
perspective. This patch mandates black-box proof documents, docker exec evidence,
verification tags per AC, and test coverage targets — preventing regressions
from being hidden behind source-level assertions.
(FR33, FR36, NFR20)

## Verification Requirements

Every story must produce a **black-box proof** — evidence that the feature works from the user's perspective, NOT from reading source code.

### Proof Standard

- Proof document at `verification/<story-key>-proof.md`
- Each AC gets a `## AC N:` section with `docker exec` commands and captured output
- Evidence must come from running the installed CLI/tool, not from grepping source
- `[FAIL]` = AC failed with evidence showing what went wrong
- `[ESCALATE]` = AC genuinely cannot be automated (last resort — try everything first)

### Verification Tags

For each AC, append a tag indicating verification approach:
- `<!-- verification: cli-verifiable -->` — default. Can be verified via CLI commands in a Docker container.
- `<!-- verification: integration-required -->` — requires external systems not available in the test environment (e.g., paid third-party APIs, physical hardware). This is rare — most things including workflows, agent sessions, and multi-step processes CAN be verified in Docker.

**Do not over-tag.** Workflows, sprint planning, user sessions, slash commands, and agent behavior are all verifiable via `docker exec ... claude --print`. Only tag `integration-required` when there is genuinely no automated path.

### Testing Requirements

- Unit tests for all new/changed code
- Coverage target: 100% of new/changed lines
- No skipped tests without justification
