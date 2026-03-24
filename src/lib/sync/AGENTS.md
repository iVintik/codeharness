# src/lib/sync — Sync Subsystem

Bidirectional synchronization between beads issues, story markdown files, and sprint-status.yaml. Keeps all three representations consistent.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| story-files.ts | Story file path resolution, status reading/writing, beads-to-story status mapping | `SyncResult`, `SyncDirection`, `resolveStoryFilePath`, `readStoryFileStatus`, `updateStoryFileStatus`, `beadsStatusToStoryStatus`, `storyStatusToBeadsStatus` |
| sprint-yaml.ts | Sprint status YAML read/write and onboarding epic append | `readSprintStatus`, `updateSprintStatus`, `appendOnboardingEpicToSprint`, `OnboardingStoryEntry` |
| beads.ts | Bidirectional sync operations — beads-to-file, file-to-beads, close, sync-all | `syncBeadsToStoryFile`, `syncStoryFileToBeads`, `syncClose`, `syncAll` |
| index.ts | Barrel re-exports for the sync subsystem | all public API from story-files, sprint-yaml, beads |
