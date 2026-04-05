import type { ACStatus } from './agents/types.js';
import { getStoryFilePath } from './bmad.js';
import { parseStoryACs } from '../modules/verify/index.js';

export function getPendingAcceptanceCriteria(
  taskName: string,
  storyKey: string,
  projectDir: string,
  storyFiles?: string[],
): ACStatus[] {
  const acFiles = storyFiles ?? (taskName === 'create-story' || storyKey.startsWith('__')
    ? []
    : [getStoryFilePath(storyKey)]);

  return acFiles.flatMap((storyFile) => {
    try {
      return parseStoryACs(storyFile.startsWith('/') ? storyFile : `${projectDir}/${storyFile}`)
        .map(({ id, description }) => ({ id: `AC${id}`, description, status: 'pending' }));
    } catch { // IGNORE: missing or malformed story file should not block contract writing
      return [];
    }
  });
}
