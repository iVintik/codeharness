import { describe, it, expect } from 'vitest';
import { parseEpicsFile, getStoryFilePath } from '../bmad.js';

// importStoriesToBeads and BridgeImportResult removed — beads cleanup (Epic 8 replacement pending)

describe('bmad bridge (beads removed)', () => {
  it('getStoryFilePath returns conventional path', () => {
    expect(getStoryFilePath('3-1-test-story')).toBe(
      '_bmad-output/implementation-artifacts/3-1-test-story.md',
    );
  });

  it('parseEpicsFile returns empty array for non-existent file', () => {
    expect(parseEpicsFile('/nonexistent/file.md')).toEqual([]);
  });
});
