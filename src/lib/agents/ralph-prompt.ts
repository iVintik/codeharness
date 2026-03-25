/**
 * Ralph prompt template — generates the prompt that instructs each
 * Claude Code iteration to run /harness-run for sprint execution.
 */

import { renderTemplateFile } from '../templates.js';

export interface RalphPromptConfig {
  projectDir: string;
  sprintStatusPath: string;
  retryCount?: number;
  currentStoryKey?: string;
  flaggedStories?: string[];
}

/**
 * Generates the prompt content for a Ralph iteration.
 * Reads the base template from templates/prompts/ralph-prompt.md and
 * interpolates project-specific paths.
 * Optionally includes retry context and flagged story information.
 */
export function generateRalphPrompt(config: RalphPromptConfig): string {
  let prompt = renderTemplateFile('templates/prompts/ralph-prompt.md', {
    projectDir: config.projectDir,
    sprintStatusPath: config.sprintStatusPath,
  });

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
