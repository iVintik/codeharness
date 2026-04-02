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
} from './story-files.js';

// Sprint YAML operations
export {
  readSprintStatus,
  updateSprintStatus,
  appendOnboardingEpicToSprint,
} from './sprint-yaml.js';

// TODO: v2 issue tracker (Epic 8) — beads sync operations removed
