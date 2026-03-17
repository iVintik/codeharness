import { readFileSync, writeFileSync } from 'node:fs';

export interface PatchMarkers {
  start: string;
  end: string;
}

export interface PatchApplyResult {
  applied: boolean;
  updated: boolean;
}

/**
 * Validates that a patch name is safe for use in markers.
 * Only allows lowercase letters, digits, and hyphens (kebab-case).
 */
function validatePatchName(patchName: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(patchName)) {
    throw new Error(
      `Invalid patch name '${patchName}': must be kebab-case (lowercase letters, digits, hyphens)`,
    );
  }
}

/**
 * Returns the canonical marker strings for a given patch name.
 */
export function getPatchMarkers(patchName: string): PatchMarkers {
  validatePatchName(patchName);
  return {
    start: `<!-- CODEHARNESS-PATCH-START:${patchName} -->`,
    end: `<!-- CODEHARNESS-PATCH-END:${patchName} -->`,
  };
}

/**
 * Checks if markers for the given patch name exist in the file.
 */
export function hasPatch(filePath: string, patchName: string): boolean {
  const content = readFileSync(filePath, 'utf-8');
  const markers = getPatchMarkers(patchName);
  return content.includes(markers.start) && content.includes(markers.end);
}

/**
 * Applies a patch to a file using marker-based idempotency.
 *
 * If markers already exist: replaces content between them (update).
 * If no markers: appends with markers at end of file.
 *
 * Returns whether the patch was applied fresh or updated.
 */
export function applyPatch(filePath: string, patchName: string, patchContent: string): PatchApplyResult {
  let content = readFileSync(filePath, 'utf-8');
  const markers = getPatchMarkers(patchName);

  const markerBlock = `${markers.start}\n${patchContent}\n${markers.end}`;

  const startIdx = content.indexOf(markers.start);
  const endIdx = content.indexOf(markers.end);

  // Guard against half-open markers (one exists without the other)
  if ((startIdx !== -1) !== (endIdx !== -1)) {
    throw new Error(
      `Corrupted patch markers for '${patchName}': only ${startIdx !== -1 ? 'start' : 'end'} marker found in ${filePath}`,
    );
  }

  if (startIdx !== -1 && endIdx !== -1) {
    // Guard against corrupted marker ordering (end before start)
    if (endIdx < startIdx) {
      throw new Error(
        `Corrupted patch markers for '${patchName}': end marker appears before start marker in ${filePath}`,
      );
    }
    // Update: replace content between markers (inclusive)
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + markers.end.length);
    content = before + markerBlock + after;
    writeFileSync(filePath, content, 'utf-8');
    return { applied: true, updated: true };
  }

  // Fresh apply: append with markers
  const trimmed = content.trimEnd();
  content = trimmed + '\n\n' + markerBlock + '\n';
  writeFileSync(filePath, content, 'utf-8');
  return { applied: true, updated: false };
}

/**
 * Removes content between markers including markers themselves.
 * Returns true if patch was found and removed, false otherwise.
 */
export function removePatch(filePath: string, patchName: string): boolean {
  let content = readFileSync(filePath, 'utf-8');
  const markers = getPatchMarkers(patchName);

  const startIdx = content.indexOf(markers.start);
  const endIdx = content.indexOf(markers.end);

  if (startIdx === -1 || endIdx === -1) {
    return false;
  }

  // Guard against corrupted marker ordering (end before start)
  if (endIdx < startIdx) {
    throw new Error(
      `Corrupted patch markers for '${patchName}': end marker appears before start marker in ${filePath}`,
    );
  }

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + markers.end.length);

  // Clean up extra blank lines at the join point
  content = before.trimEnd() + '\n' + after.trimStart();
  writeFileSync(filePath, content, 'utf-8');
  return true;
}
