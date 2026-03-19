/**
 * Verification prompt template for black-box verifier sessions.
 * Architecture Decision 6: All templates are TypeScript string literals.
 * Architecture Decision 10: Two-layer isolation — clean workspace + Docker container.
 *
 * This prompt is passed to `claude --print -p "..."` in a clean workspace
 * that contains NO source code. The verifier must exercise the feature
 * exclusively via `docker exec` and observability queries.
 */

export type PromptProjectType = 'nodejs' | 'python' | 'plugin' | 'generic';

export interface VerifyPromptConfig {
  /** Story key, e.g. "13-3-black-box-verifier-agent" */
  storyKey: string;
  /** Full content of story.md from the clean workspace */
  storyContent: string;
  /** Docker container name (default: "codeharness-verify") */
  containerName?: string;
  /** Project type for verification strategy guidance */
  projectType?: PromptProjectType;
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

/** Returns project-type-specific verification guidance. */
export function projectTypeGuidance(projectType: PromptProjectType, container: string): string {
  switch (projectType) {
    case 'nodejs':
    case 'python':
      return `### Project Type: ${projectType === 'nodejs' ? 'Node.js CLI' : 'Python CLI'}

Execute commands inside the container and capture stdout/stderr as evidence:
- \`docker exec ${container} <cli-command> [args]\`
- Capture exit codes: \`docker exec ${container} sh -c '<command>; echo "EXIT:$?"'\`
- For ${projectType === 'nodejs' ? 'Node.js' : 'Python'} projects, the built artifact is installed globally in the container.`;

    case 'plugin':
      return `### Project Type: Claude Code Plugin

This is a Claude Code plugin project. Verify using \`claude --print\` inside the container:
- \`docker exec ${container} claude --print -p "<prompt>" --allowedTools Bash Read Write Glob Grep Edit --max-budget-usd 1\`
- Plugin commands and hooks are installed in the container's Claude Code environment.
- Test slash commands by prompting Claude to run them inside the container.`;

    case 'generic':
      return `### Project Type: Unknown / Generic

The project stack was not recognized. Adapt your verification approach to the tools available:
- Use basic CLI tools: \`bash\`, \`curl\`, \`jq\`, \`node\`
- Inspect any artifacts copied into the container
- If the project provides a CLI binary, test it directly
- Adapt to whatever tools and artifacts are available — do not refuse verification`;
  }
}

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
  const projectType = config.projectType ?? 'nodejs';
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
- Example: \`docker exec ${container} claude --print --allowedTools Bash Read Write Glob Grep Edit -p "Run /harness-run" --max-budget-usd 1\`

The container has the following tools installed:
- \`codeharness\` — the project CLI
- \`claude\` — Claude Code CLI (authenticated via ANTHROPIC_API_KEY env var)
- \`curl\`, \`jq\` — for querying observability endpoints
- \`showboat\` — for proof document validation
- \`node\`, \`npm\` — Node.js runtime

**IMPORTANT: When invoking \`claude --print\` inside Docker, always pass \`--allowedTools Bash Read Write Glob Grep Edit\` to prevent the nested session from hanging on tool permission prompts.**

${projectTypeGuidance(projectType, container)}

### Observability Endpoints

Query these from the HOST (not inside the container) for runtime evidence:

- **VictoriaLogs** (logs): \`${endpoints.victoriaLogs}\`
  - Example: \`curl '${endpoints.victoriaLogs}/select/logsql/query?query=_stream_id:*&limit=10'\`
- **VictoriaMetrics** (metrics): \`${endpoints.victoriaMetrics}\`
  - Example: \`curl '${endpoints.victoriaMetrics}/api/v1/query?query=up'\`
- **VictoriaTraces** (traces): \`${endpoints.victoriaTraces}\`
  - Example: \`curl '${endpoints.victoriaTraces}/api/traces?service=codeharness-verify&limit=10'\`

## Step 3.5: Observability Check After Each Command

After EACH \`docker exec\` command you run, query the observability backend for log events from the last 30 seconds:

\`\`\`bash
curl '${endpoints.victoriaLogs}/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'
\`\`\`

- If the response contains **one or more log entries**, the code path has observability coverage. Note the count in your proof.
- If the response contains **zero log entries**, the code path is a silent gap. Include this tag in the AC section of your proof:

  \`[OBSERVABILITY GAP] No log events detected for this user interaction\`

This check detects silent code paths — places where the application runs but produces no telemetry. Every AC should produce some log output when exercised.

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
6. **[ESCALATE] is ONLY for things that are genuinely impossible to automate** — physical hardware, paid external services, human visual judgment. Infrastructure problems (missing binary, wrong version, tree-shaking, Docker config) are NOT valid escalation reasons. If a tool is missing from the container, that is a bug to report as [FAIL], not an [ESCALATE]. The harness will fix the infrastructure and re-verify.
7. **\`claude\` CLI is available** inside the container. If an AC requires spawning a Claude Code session, running a slash command, or testing agent behavior, use \`docker exec ${container} claude --print --allowedTools Bash Read Write Glob Grep Edit -p "..." --max-budget-usd 1\` to actually test it. Do NOT escalate just because "it needs a Claude session."
8. **Never switch to unit-testable verification.** If Docker verification doesn't work, report WHY as a [FAIL] — don't fall back to running tests on the host. The harness-run flow will fix the Docker problem and retry.
`;
}
