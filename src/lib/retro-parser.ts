/**
 * Parses retrospective markdown files to extract action items
 * and classify them for beads import.
 */

export interface RetroActionItem {
  /** Item number identifier, e.g., "A1", "A2" */
  number: string;
  /** Action item description */
  description: string;
  /** Status from the retro table, e.g., "Not done", "Regressed" */
  status: string;
  /** Notes column from the retro table */
  notes: string;
}

export type Classification =
  | { type: 'harness' }
  | { type: 'tool'; name: string }
  | { type: 'project' };

const KNOWN_TOOLS = ['showboat', 'ralph', 'beads', 'bmad'];

/**
 * Parses action items from a retrospective markdown file.
 * Looks for a table with the format: `| # | Action | Status | Notes |`
 */
export function parseRetroActionItems(content: string): RetroActionItem[] {
  const lines = content.split('\n');
  const items: RetroActionItem[] = [];

  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect table header row: | # | Action | Status | Notes |
    if (!inTable && /^\|\s*#\s*\|\s*Action\s*\|\s*Status\s*\|\s*Notes\s*\|/i.test(trimmed)) {
      inTable = true;
      continue;
    }

    // Skip separator row: |---|--------|--------|-------|
    if (inTable && /^\|[\s\-|]+\|$/.test(trimmed)) {
      continue;
    }

    // Parse data rows
    if (inTable && trimmed.startsWith('|')) {
      const cells = trimmed
        .split('|')
        .slice(1, -1) // Remove leading/trailing empty strings from split
        .map(c => c.trim());

      if (cells.length >= 4) {
        const number = cells[0];
        const description = cells[1];
        const status = cells[2];
        const notes = cells[3];

        // Only include rows with valid item numbers (e.g., A1, A2)
        if (/^[A-Za-z]\d+$/.test(number)) {
          items.push({ number, description, status, notes });
        }
      }
    }

    // End of table: non-table line after table started
    if (inTable && !trimmed.startsWith('|') && trimmed !== '') {
      inTable = false;
    }
  }

  return items;
}

/**
 * Classifies a retro action item based on its description text.
 *
 * Rules (applied in order):
 * 1. Contains "harness" or "codeharness" (case-insensitive) -> harness
 * 2. Contains known tool name (case-insensitive) -> tool:<name>
 * 3. Everything else -> project
 */
export function classifyFinding(item: RetroActionItem): Classification {
  const text = item.description.toLowerCase();

  if (text.includes('harness') || text.includes('codeharness')) {
    return { type: 'harness' };
  }

  for (const tool of KNOWN_TOOLS) {
    if (text.includes(tool)) {
      return { type: 'tool', name: tool };
    }
  }

  return { type: 'project' };
}

/**
 * Derives priority from retro action item context.
 * - Items marked "Regressed" or with urgency indicators -> priority 1
 * - Items marked "Not done" with multiple carries -> priority 2
 * - Default -> priority 2
 */
export function derivePriority(item: RetroActionItem): number {
  const statusLower = item.status.toLowerCase();
  const notesLower = item.notes.toLowerCase();

  // Regressed or urgency indicators -> priority 1
  if (
    statusLower.includes('regressed') ||
    notesLower.includes('urgent') ||
    notesLower.includes('critical')
  ) {
    return 1;
  }

  // Default priority
  return 2;
}
