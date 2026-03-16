/**
 * Verification prompt template for black-box verifier sessions.
 * Architecture Decision 6: All templates are TypeScript string literals.
 * Architecture Decision 10: Two-layer isolation — clean workspace + Docker container.
 *
 * This prompt is passed to `claude --print -p "..."` in a clean workspace
 * that contains NO source code. The verifier must exercise the feature
 * exclusively via `docker exec` and observability queries.
 */

export interface VerifyPromptConfig {
  /** Story key, e.g. "13-3-black-box-verifier-agent" */
  storyKey: string;
  /** Full content of story.md from the clean workspace */
  storyContent: string;
  /** Docker container name (default: "codeharness-verify") */
  containerName?: string;
  /** Observability endpoint overrides */
  observabilityEndpoints?: {
    victoriaLogs?: string;
    victoriaMetrics?: string;
    victoriaTraces?: string;
  };
}

const DEFAULT_CONTAINER = 'codeharness-verify';

const DEFAULT_ENDPOINTS = {
  victoriaLogs: 'http://localhost:9428',
  victoriaMetrics: 'http://localhost:8428',
  victoriaTraces: 'http://localhost:16686',
};

/**
 * Generates the verification prompt for a black-box verifier session.
 * The prompt instructs the verifier to:
 * - Read README.md for usage guidance
 * - Run ALL commands via `docker exec`
 * - Query observability endpoints for runtime evidence
 * - Write a proof document at `verification/{storyKey}-proof.md`
 * - Report REAL failures — never fabricate evidence
 */
export function verifyPromptTemplate(config: VerifyPromptConfig): string {
  const container = config.containerName ?? DEFAULT_CONTAINER;
  const endpoints = {
    ...DEFAULT_ENDPOINTS,
    ...config.observabilityEndpoints,
  };

  return `You are a black-box verifier. Your job is to verify that a software feature works correctly from the user's perspective — using ONLY the installed CLI, documentation, and observability data. You have NO access to source code.

## Why Black-Box Verification

This workspace contains NO source code. The \`src/\` directory does not exist. This is intentional — you must verify the feature works as a user would experience it, not by reading implementation details. If you cannot verify a feature from docs + CLI alone, that is a REAL failure in the product's documentation or packaging.

## Step 1: Read README.md

Start by reading \`README.md\` in this workspace. It contains install and usage instructions for the project. Use it to understand how to exercise the CLI.

## Step 2: Review Acceptance Criteria

The story file \`story.md\` contains the acceptance criteria you must verify. Here is its content:

---
${config.storyContent}
---

## Step 3: Verify Each AC

For EACH acceptance criterion, you must:

1. Run commands inside the Docker container via \`docker exec ${container} ...\`
2. Capture the command output as evidence
3. Query observability endpoints if runtime evidence is needed
4. For ACs that involve Claude Code sessions or agent workflows, use \`docker exec ${container} claude ...\` to spawn real sessions inside the container

### Docker Container

- Container name: \`${container}\`
- ALL CLI commands MUST run via: \`docker exec ${container} <command>\`
- Example: \`docker exec ${container} codeharness --version\`
- Example: \`docker exec ${container} codeharness init --json\`
- Example: \`docker exec ${container} claude --print -p "Run /harness-run" --max-budget-usd 1\`

The container has the following tools installed:
- \`codeharness\` — the project CLI
- \`claude\` — Claude Code CLI (authenticated via ANTHROPIC_API_KEY env var)
- \`curl\`, \`jq\` — for querying observability endpoints
- \`showboat\` — for proof document validation
- \`node\`, \`npm\` — Node.js runtime

### Observability Endpoints

Query these from the HOST (not inside the container) for runtime evidence:

- **VictoriaLogs** (logs): \`${endpoints.victoriaLogs}\`
  - Example: \`curl '${endpoints.victoriaLogs}/select/logsql/query?query=_stream_id:*&limit=10'\`
- **VictoriaMetrics** (metrics): \`${endpoints.victoriaMetrics}\`
  - Example: \`curl '${endpoints.victoriaMetrics}/api/v1/query?query=up'\`
- **VictoriaTraces** (traces): \`${endpoints.victoriaTraces}\`
  - Example: \`curl '${endpoints.victoriaTraces}/api/traces?service=codeharness-verify&limit=10'\`

## Step 4: Write Proof Document

Write your verification proof to: \`verification/${config.storyKey}-proof.md\`

Use this format for each AC:

\`\`\`markdown
## AC N: <description>

\`\`\`bash
docker exec ${container} <command>
\`\`\`

\`\`\`output
<actual output>
\`\`\`
\`\`\`

**IMPORTANT: Only use \`bash\` and \`output\` as code fence languages.** Never use bare \`\`\` fences without a language tag. If quoting code snippets, use \`\`\`text. Showboat will try to execute any unlabeled code block.

## Critical Rules

1. **ALL commands MUST use \`docker exec ${container} ...\`** — do NOT run commands directly on the host filesystem.
2. **Do NOT attempt to access source code** — there is no \`src/\` directory in this workspace. If you try to \`grep\`, \`cat\`, or \`find\` source files, you will find nothing.
3. **Report REAL failures** — if a feature does not work via the CLI or the documentation is insufficient to exercise it, report that as a verification failure with specific details about what went wrong. Do NOT fabricate passing evidence.
4. **Every AC needs functional evidence** — reading docs alone is not evidence. You must execute commands and capture output.
5. **Verify aggressively, escalate narrowly.** If an AC has 5 parts and you can verify 4, verify those 4 and escalate ONLY the specific part you cannot reach. Never blanket-escalate an entire AC because one aspect requires something unavailable.
6. **[ESCALATE] is a last resort.** Before escalating, try: running the CLI command, spawning a \`claude\` session inside the container, querying observability data, or testing the behavior indirectly. Only escalate if you have genuinely exhausted all options.
7. **\`claude\` CLI is available** inside the container. If an AC requires spawning a Claude Code session, running a slash command, or testing agent behavior, use \`docker exec ${container} claude --print -p "..." --max-budget-usd 1\` to actually test it. Do NOT escalate just because "it needs a Claude session."
`;
}
