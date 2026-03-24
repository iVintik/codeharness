/**
 * Public API for the sync subsystem.
 */

// Types
export type { SyncResult, SyncDirection } from './story-files.js';
export type { OnboardingStoryEntry } from './sprint-yaml.js';

// Story file operations
export {
  resolveStoryFilePath,
  readStoryFileStatus,
  updateStoryFileStatus,
  beadsStatusToStoryStatus,
  storyStatusToBeadsStatus,
} from './story-files.js';

// Sprint YAML operations
export {
  readSprintStatus,
  updateSprintStatus,
  appendOnboardingEpicToSprint,
} from './sprint-yaml.js';

// Beads sync operations
export {
  syncBeadsToStoryFile,
  syncStoryFileToBeads,
  syncClose,
  syncAll,
} from './beads.js';
