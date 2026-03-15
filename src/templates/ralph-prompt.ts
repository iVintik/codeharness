/**
 * Ralph prompt template — generates the prompt that instructs each
 * Claude Code iteration to run /harness-run for sprint execution.
 */

export interface RalphPromptConfig {
  projectDir: string;
  sprintStatusPath: string;
  retryCount?: number;
  currentStoryKey?: string;
  flaggedStories?: string[];
}

const PROMPT_TEMPLATE = `You are an autonomous coding agent executing a sprint for the codeharness project.

## Your Mission

Run the \`/harness-run\` command to execute the next story in the sprint.

## Instructions

1. **Run \`/harness-run\`** — this is the sprint execution skill that:
   - Reads sprint-status.yaml at \`{{sprintStatusPath}}\` to find the next story
   - Picks the first story with status \`ready-for-dev\` or \`in-progress\`
   - Executes the full BMAD workflow: create-story, dev-story, code-review
   - Updates sprint-status.yaml when the story is complete

2. **Follow all BMAD workflows** — the /harness-run skill handles this, but if prompted:
   - Use \`/bmad-dev-story\` for implementation
   - Use code-review workflow for quality checks
   - Ensure tests pass and coverage meets targets

3. **Update sprint-status.yaml** — after each story completes, the skill updates
   the story status to \`done\` in \`{{sprintStatusPath}}\`.

4. **Do not skip verification** — every story must pass verification gates
   (tests, coverage, showboat proof) before being marked done.

## Verification Gates

After completing a story, run \`codeharness verify --story <id>\` to verify.
If verification fails, fix the issues and re-verify. The story is not done
until verification passes.

## Project Context

- **Project directory:** \`{{projectDir}}\`
- **Sprint status:** \`{{sprintStatusPath}}\`

## Important

- Do NOT implement your own task-picking logic. Let /harness-run handle it.
- Do NOT modify sprint-status.yaml directly. Let the skill manage it.
- Focus on one story per session. Ralph will spawn a new session for the next story.
`;

/**
 * Generates the prompt content for a Ralph iteration.
 * Interpolates project-specific paths into the template.
 * Optionally includes retry context and flagged story information.
 */
export function generateRalphPrompt(config: RalphPromptConfig): string {
  let prompt = PROMPT_TEMPLATE
    .replace(/\{\{projectDir\}\}/g, config.projectDir)
    .replace(/\{\{sprintStatusPath\}\}/g, config.sprintStatusPath);

  // Add retry context if retrying a story
  if (config.retryCount && config.retryCount > 0 && config.currentStoryKey) {
    prompt += `\n## Retry Context\n\n`;
    prompt += `This is retry attempt **${config.retryCount}** for story \`${config.currentStoryKey}\`. `;
    prompt += `Previous attempts did not complete verification. Focus on fixing the remaining issues.\n`;
  }

  // Add flagged stories if any
  if (config.flaggedStories && config.flaggedStories.length > 0) {
    prompt += `\n## Flagged Stories (Skip These)\n\n`;
    prompt += `The following stories have exceeded the retry limit and should be skipped:\n`;
    for (const story of config.flaggedStories) {
      prompt += `- \`${story}\`\n`;
    }
  }

  return prompt;
}
