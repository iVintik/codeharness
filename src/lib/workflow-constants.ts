/**
 * Shared constants for the XState v5 workflow engine.
 */

/** Default prompt templates for built-in task names. */
export const TASK_PROMPTS: Record<string, (key: string) => string> = {
  'create-story': (key) => `Create the story spec for ${key}. Read the epic definitions and architecture docs. Write a complete story file with acceptance criteria, tasks, and dev notes. CRITICAL: Every AC must be testable by a blind QA agent using ONLY a user guide + browser/API/CLI access. No AC should reference source code, internal data structures, or implementation details like O(1) complexity. Each AC must describe observable behavior that can be verified through UI interaction (agent-browser), API calls (curl), CLI commands (docker exec), or log inspection (docker logs). Wrap output in <story-spec>...</story-spec> tags.`,
  'implement': (key) => `Implement story ${key}. BEFORE finishing: run \`npx eslint src/ --fix\` to auto-fix lint issues, then run \`npx eslint src/\` to verify zero warnings. If warnings remain, fix them manually. Do not leave lint warnings for the check agent to find.`,
  'check': (key) => `Run automated checks for story ${key}. Execute the project's test suite and linter. Include <verdict>pass</verdict> or <verdict>fail</verdict> in your response. Also include a metrics tag with actual numbers: <metrics tests-passed="N" tests-failed="N" lint-warnings="N" issues="0" />`,
  'review': (key) => `Review the implementation of story ${key}. Check for correctness, security issues, architecture violations, and AC coverage. Include <verdict>pass</verdict> or <verdict>fail</verdict> in your response. If fail, include <issues>...</issues>. Also include a metrics tag counting the issues found: <metrics tests-passed="0" tests-failed="0" lint-warnings="0" issues="N" />`,
  'document': (key) => `Write user documentation for story ${key}. Describe what was built and how to use it from a user's perspective. No source code. Wrap documentation in <user-docs>...</user-docs> tags.`,
  'deploy': (key) => key === '__sprint__'
    ? `Deploy the entire sprint. Provision Docker environment, start all containers, verify health across all services. This runs ONCE after all epics are complete. Wrap report in <deploy-report>...</deploy-report> tags with status, containers, URLs, credentials, health.`
    : `Provision the Docker environment for epic ${key}. Check for docker-compose.yml, start containers, verify health. Wrap report in <deploy-report>...</deploy-report> tags with status, containers, URLs, credentials, health.`,
  'verify': (key) => key === '__sprint__'
    ? `Verify ALL stories across ALL epics in this sprint. Read user docs and deploy info from ./story-files/. For EACH story's ACs, derive verification steps, run commands, observe output. This is the final sprint-level verification — every AC across every epic must be checked. Include <verdict>pass</verdict> or <verdict>fail</verdict>. Include <evidence ac="N" status="pass|fail|unknown">...</evidence> per AC. Include <quality-scores>...</quality-scores>.`
    : `Verify the stories for epic ${key} using the user docs and deploy info in ./story-files/. For each AC, derive verification steps, run commands, observe output. Include <verdict>pass</verdict> or <verdict>fail</verdict>. Include <evidence ac="N" status="pass|fail|unknown">...</evidence> per AC. Include <quality-scores>...</quality-scores>.`,
  'retro': (key) => `Run a retrospective for epic ${key}. Analyze what worked, what failed, patterns, and action items for next epic.`,
};

/** Tool names that indicate file writes. */
export const FILE_WRITE_TOOL_NAMES = new Set([
  'Write', 'Edit', 'write_to_file', 'edit_file',
  'write', 'edit', 'WriteFile', 'EditFile',
]);
