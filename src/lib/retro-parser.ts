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

// ─── Section-based retro parsing (subsection format) ────────────────────

/** Section classification for action items under ## 6. Action Items */
export type RetroSection = 'fix-now' | 'fix-soon' | 'backlog';

/** An action item parsed from a retro subsection */
export interface RetroSectionItem {
  readonly section: RetroSection;
  readonly text: string;
}

/**
 * Classify a subsection header into a RetroSection.
 * Matches case-insensitively and strips parenthetical suffixes.
 * Returns null if the header doesn't match a known section.
 */
function classifyHeader(header: string): RetroSection | null {
  // Strip leading #+ and trim
  const text = header.replace(/^#+\s*/, '').trim();
  // Strip parenthetical suffix: "Fix Now (Before Next Session)" -> "Fix Now"
  const base = text.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
  if (base === 'fix now') return 'fix-now';
  if (base === 'fix soon') return 'fix-soon';
  if (base === 'backlog') return 'backlog';
  return null;
}

/**
 * Parse retro subsection-based action items from the `## 6. Action Items` section.
 * Handles varying header formats (### or ####, with/without parenthetical suffixes).
 * Extracts bullet items (`- ` or numbered `1. `) under each subsection.
 */
export function parseRetroSections(content: string): RetroSectionItem[] {
  const lines = content.split('\n');
  const items: RetroSectionItem[] = [];
  let currentSection: RetroSection | null = null;
  let inActionItems = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect ## 6. Action Items header (or similar)
    if (/^#{2}\s+\d+\.\s*Action\s*Items/i.test(trimmed)) {
      inActionItems = true;
      continue;
    }

    // If we hit another ## header (not ###/####), stop
    if (inActionItems && /^#{2}\s+[^#]/.test(trimmed) && !/Action\s*Items/i.test(trimmed)) {
      break;
    }

    if (!inActionItems) continue;

    // Detect ### or #### subsection headers
    if (/^#{3,4}\s+/.test(trimmed)) {
      const section = classifyHeader(trimmed);
      currentSection = section;
      continue;
    }

    // Extract bullet items under current section
    if (currentSection !== null) {
      const bulletMatch = trimmed.match(/^(?:-|\d+\.)\s+(.+)$/);
      if (bulletMatch) {
        items.push({ section: currentSection, text: bulletMatch[1].trim() });
      }
    }
  }

  return items;
}

// ─── Deduplication utilities ────────────────────────────────────────────

/**
 * Normalize text for deduplication: lowercase, remove punctuation, split into words.
 */
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Compute word overlap between two normalized word arrays.
 * Returns overlap percentage (0-1) using min(|a|, |b|) as denominator.
 */
export function wordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

/**
 * Check if a new item is a duplicate of any existing title.
 * Uses word overlap with configurable threshold (default 0.8).
 */
export function isDuplicate(
  newItem: string,
  existingTitles: string[],
  threshold = 0.8,
): { duplicate: boolean; matchedTitle?: string } {
  const newWords = normalizeText(newItem);
  for (const title of existingTitles) {
    const titleWords = normalizeText(title);
    if (wordOverlap(newWords, titleWords) >= threshold) {
      return { duplicate: true, matchedTitle: title };
    }
  }
  return { duplicate: false };
}
