/**
 * DashboardFormatter — parses ralph's structured output lines and reformats
 * them as a clean dashboard with icons and progress tracking.
 *
 * Ralph output format (from stderr): [timestamp] [LEVEL] message
 * This formatter receives the raw line text after it's been split from the buffer.
 */

/**
 * Format elapsed milliseconds as "Xm Ys" or "Ys".
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

// --- Line parsing patterns ---
// Ralph lines look like: [2025-01-15 10:30:45] [SUCCESS] Story 1-1-foo: DONE — title [proof: ...]
// or: [2025-01-15 10:30:45] [INFO] Sprint: 5/12 done, 7 remaining — next: ...

const TIMESTAMP_PREFIX = /^\[[\d-]+\s[\d:]+\]\s*/;

/** Strip ANSI color codes */
const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

/** Matches: [SUCCESS] Story {key}: DONE ... */
const SUCCESS_STORY = /\[SUCCESS\]\s+Story\s+([\w-]+):\s+DONE(.*)/;

/** Matches: [ERROR] ... (any error line) */
const ERROR_LINE = /\[ERROR\]\s+(.+)/;

/** Matches: [WARN] Story {key} exceeded retry limit */
const WARN_STORY_RETRY = /\[WARN\]\s+Story\s+([\w-]+)\s+exceeded retry limit.*flagging/;

/** Matches: [WARN] Story {key} — retry N/M */
const WARN_STORY_RETRYING = /\[WARN\]\s+Story\s+([\w-]+)\s+.*retry\s+(\d+)\/(\d+)/;

/** Matches: [INFO] Sprint: X/Y done, ... */
const INFO_SPRINT = /\[INFO\]\s+Sprint:\s+(.+)/;

/** Matches: [INFO] Progress: X/Y done, ... */
const INFO_PROGRESS = /\[INFO\]\s+Progress:\s+(.+)/;

/** Matches: [INFO] Story {key}: {phase} ({detail}) — internal progress update */
const INFO_STORY_PHASE = /\[INFO\]\s+Story\s+([\w-]+):\s+(create|dev|review|verify)(?:\s+\((.+)\))?/;

/** Matches: [INFO] Story {key}: verify (AC X/Y) */
const INFO_STORY_AC = /\[INFO\]\s+Story\s+([\w-]+):\s+verify\s+\(AC\s+(.+)\)/;

/** Matches: [INFO] Next up: {key} */
const INFO_NEXT = /\[INFO\]\s+Next up:\s+([\w-]+)/;

/** Matches: [DEBUG] ... */
const DEBUG_LINE = /\[DEBUG\]/;

/** Matches: [INFO] Plugin: ... or [INFO] Starting ... */
const INFO_NOISE = /\[INFO\]\s+(Plugin:|Starting\s+|Sleeping\s|Capturing\s|Timeout report)/;

/** Matches: [LOOP] ... */
const LOOP_LINE = /\[LOOP\]\s+(.+)/;

/** Matches: [WARN] ... (generic) */
const WARN_LINE = /\[WARN\]\s+(.+)/;

/** Matches: [SUCCESS] Ralph loop starting */
const SUCCESS_STARTING = /\[SUCCESS\]\s+Ralph loop starting/;

/** Matches: [SUCCESS] All stories complete */
const SUCCESS_ALL_DONE = /\[SUCCESS\]\s+All stories complete\.(.+)/;

/** Matches: [INFO] with session/retro info */
const INFO_SESSION = /\[INFO\]\s+(━━━.*━━━)/;

export class DashboardFormatter {
  private currentStory: string | null = null;
  private currentPhase: string | null = null;
  private phaseStartTime: number | null = null;

  /**
   * Parse a raw ralph output line and return formatted dashboard output,
   * or null to suppress the line.
   */
  formatLine(rawLine: string): string | null {
    // Strip ANSI codes and timestamp prefix
    const clean = rawLine.replace(ANSI_ESCAPE, '').replace(TIMESTAMP_PREFIX, '').trim();
    if (clean.length === 0) return null;

    // [DEBUG] — always suppress
    if (DEBUG_LINE.test(clean)) return null;

    // [SUCCESS] Ralph loop starting
    if (SUCCESS_STARTING.test(clean)) {
      return '--- Ralph loop starting ---';
    }

    // [SUCCESS] All stories complete
    const allDone = SUCCESS_ALL_DONE.exec(clean);
    if (allDone) {
      return `\u2713 All stories complete.${allDone[1]}`;
    }

    // [SUCCESS] Story {key}: DONE ...
    const success = SUCCESS_STORY.exec(clean);
    if (success) {
      const key = success[1];
      const rest = success[2].trim();
      // Extract duration/cost from rest if present, otherwise show as-is
      const formatted = rest ? ` (${rest.replace(/^—\s*/, '')})` : '';
      this.currentStory = null;
      this.currentPhase = null;
      this.phaseStartTime = null;
      return `\u2713 Story ${key}: DONE${formatted}`;
    }

    // [INFO] Story {key}: verify (AC X/Y) — update internal state, suppress line
    const acMatch = INFO_STORY_AC.exec(clean);
    if (acMatch) {
      this.currentStory = acMatch[1];
      this.currentPhase = `verify (AC ${acMatch[2]})`;
      if (this.phaseStartTime === null) {
        this.phaseStartTime = Date.now();
      }
      return null;
    }

    // [INFO] Story {key}: {phase} ({detail}) — update internal state, suppress line
    const phaseMatch = INFO_STORY_PHASE.exec(clean);
    if (phaseMatch) {
      const newStory = phaseMatch[1];
      const newPhase = phaseMatch[2];
      // Reset timer if story or phase changed
      if (newStory !== this.currentStory || newPhase !== this.currentPhase) {
        this.phaseStartTime = Date.now();
      }
      this.currentStory = newStory;
      this.currentPhase = phaseMatch[3] ? `${newPhase} (${phaseMatch[3]})` : newPhase;
      return null;
    }

    // [INFO] Sprint: ... — pass through reformatted
    const sprint = INFO_SPRINT.exec(clean);
    if (sprint) {
      return `\u25c6 Sprint: ${sprint[1]}`;
    }

    // [INFO] Progress: ... — pass through reformatted
    const progress = INFO_PROGRESS.exec(clean);
    if (progress) {
      return `\u25c6 Progress: ${progress[1]}`;
    }

    // [INFO] Next up: {key}
    const next = INFO_NEXT.exec(clean);
    if (next) {
      return `\u25c6 Next: ${next[1]}`;
    }

    // [INFO] noise (plugin, startup) — suppress
    if (INFO_NOISE.test(clean)) return null;

    // [INFO] session/retro markers — pass through
    const session = INFO_SESSION.exec(clean);
    if (session) {
      return session[1];
    }

    // [ERROR] ... — format with cross icon
    const errorMatch = ERROR_LINE.exec(clean);
    if (errorMatch) {
      const msg = errorMatch[1].trim();
      // If it already has the ✗ icon, strip it to avoid duplication
      if (msg.startsWith('\u2717')) {
        return `\u2717 ${msg.replace(/^\u2717\s*/, '')}`;
      }
      return `\u2717 ${msg}`;
    }

    // [WARN] Story exceeded retry — format as failure
    const retryExceeded = WARN_STORY_RETRY.exec(clean);
    if (retryExceeded) {
      return `\u2717 Story ${retryExceeded[1]}: FAIL — exceeded retry limit`;
    }

    // [WARN] Story retrying
    const retrying = WARN_STORY_RETRYING.exec(clean);
    if (retrying) {
      return `\u25c6 Story ${retrying[1]}: retry ${retrying[2]}/${retrying[3]}`;
    }

    // [LOOP] ... — pass through
    const loop = LOOP_LINE.exec(clean);
    if (loop) {
      return `\u25c6 ${loop[1]}`;
    }

    // [WARN] ... — pass through (warnings are actionable)
    const warn = WARN_LINE.exec(clean);
    if (warn) {
      return `! ${warn[1]}`;
    }

    // Fallback: pass line through unchanged (backward compatible)
    // But suppress lines that are clearly just noise (e.g., ✓/✕ completion icons from session summary)
    if (clean.startsWith('[')) {
      // Unrecognized bracketed level — pass through
      return clean;
    }

    // Raw text without a level prefix — pass through
    return clean;
  }

  /**
   * Returns the current ticker line showing active story progress,
   * or null if no story is active.
   */
  getTickerLine(): string | null {
    if (!this.currentStory || !this.currentPhase || this.phaseStartTime === null) {
      return null;
    }
    const elapsed = formatElapsed(Date.now() - this.phaseStartTime);
    return `\u25c6 ${this.currentStory} \u2014 ${this.currentPhase} (elapsed ${elapsed})`;
  }

  /** Get current tracked story (for testing) */
  getCurrentStory(): string | null {
    return this.currentStory;
  }

  /** Get current tracked phase (for testing) */
  getCurrentPhase(): string | null {
    return this.currentPhase;
  }

  /** Reset internal state */
  reset(): void {
    this.currentStory = null;
    this.currentPhase = null;
    this.phaseStartTime = null;
  }
}
