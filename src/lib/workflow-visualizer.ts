/**
 * Pure workflow visualizer — no I/O, no side effects.
 * Returns a single-line ANSI-colored string representing workflow state.
 * AD5: visualize(position, vizConfig) → string
 * NFR18: ≤ 300 lines. NFR8: ≤ 120 chars max width.
 */

import type { ResolvedWorkflow } from './workflow-types.js';
import { isGateConfig } from './workflow-types.js';

// ─── Visualizer types ────────────────────────────────────────────────────────

export interface StepStatus {
  name: string;
  status: 'pending' | 'active' | 'done' | 'failed' | 'skipped';
  isGate?: boolean;
}

export interface GateInfo { name: string; iteration: number; maxRetries: number; passed: number; failed: number }

export interface WorkflowPosition {
  level: 'run' | 'epic' | 'story' | 'gate';
  epicId?: string;
  epicIndex?: number;
  totalEpics?: number;
  storyIndex?: number;
  totalStories?: number;
  steps: StepStatus[];
  activeStepIndex: number;
  gate?: GateInfo;
  storiesDone?: boolean;
}

export interface VizConfig {
  maxWidth?: number;        // default 80, hard cap 120
  maxStepSlots?: number;    // default 5
  taskNameMaxLen?: number;  // default 8
}

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

function dim(s: string): string { return `${DIM}${s}${RESET}`; }
function bold(s: string): string { return `${BOLD}${s}${RESET}`; }
function red(s: string): string { return `${RED}${s}${RESET}`; }
function yellow(s: string): string { return `${YELLOW}${s}${RESET}`; }

/** Strip ANSI escape codes for length measurement. */
 
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

// ─── Step rendering ──────────────────────────────────────────────────────────

function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  if (maxLen <= 1) return name.slice(0, maxLen);
  return name.slice(0, maxLen - 1) + '…';
}

function renderStep(step: StepStatus, nameMaxLen: number): string {
  const name = truncateName(step.name, nameMaxLen);
  switch (step.status) {
    case 'done':    return dim(`${name}✓`);
    case 'active':  return bold(`${name}…`);
    case 'failed':  return red(`${name}✗`);
    case 'skipped': return dim(`${name}⊘`);
    default:        return name;
  }
}

function renderGateStep(gate: GateInfo, stepStatus: 'pending' | 'active' | 'done' | 'failed'): string {
  const name = gate.name;
  if (stepStatus === 'done')   return dim(`⟲${name}✓`);
  if (stepStatus === 'failed') return red(`⟲${name}✗`);
  if (stepStatus === 'active') {
    const detail = `${gate.iteration}/${gate.maxRetries} ${gate.passed}✓${gate.failed}✗`;
    return yellow(`⟲${name}(${detail})…`);
  }
  return `⟲${name}`;
}

// ─── Sliding window ───────────────────────────────────────────────────────────

interface Window {
  start: number;
  end: number;   // exclusive
  collapsedBefore: number;
  collapsedAfter: number;
}

function computeWindow(totalSteps: number, activeIdx: number, maxSlots: number): Window {
  if (totalSteps <= maxSlots) {
    return { start: 0, end: totalSteps, collapsedBefore: 0, collapsedAfter: 0 };
  }

  // Center window on active step, then clamp and backfill so exactly maxSlots steps are visible.
  // When near the end of the flow, the window slides back to keep maxSlots visible (no underfill).
  const half = Math.floor(maxSlots / 2);
  const idealStart = activeIdx - half;
  // Clamp: never start before 0, and never leave fewer than maxSlots steps after start.
  const start = Math.max(0, Math.min(idealStart, totalSteps - maxSlots));
  const end = start + maxSlots;

  return {
    start,
    end,
    collapsedBefore: start,
    collapsedAfter: totalSteps - end,
  };
}

// ─── Scope prefix ────────────────────────────────────────────────────────────

function buildScopePrefix(pos: WorkflowPosition): string {
  if (!pos.epicId) return '';
  if (pos.storiesDone) return `Epic ${pos.epicId} `;
  if (pos.storyIndex !== undefined && pos.totalStories !== undefined) {
    return `Epic ${pos.epicId} [${pos.storyIndex}/${pos.totalStories}] `;
  }
  return `Epic ${pos.epicId} `;
}

// ─── Core rendering ──────────────────────────────────────────────────────────

function renderSteps(
  pos: WorkflowPosition,
  nameMaxLen: number,
  maxSlots: number,
): string {
  const { steps, activeStepIndex, gate } = pos;

  if (steps.length === 0) return '';

  const win = computeWindow(steps.length, activeStepIndex, maxSlots);

  const parts: string[] = [];

  // Prefix: collapsed done count
  if (win.collapsedBefore > 0) {
    parts.push(`[${win.collapsedBefore}✓]`);
  }

  // Visible steps
  for (let i = win.start; i < win.end; i++) {
    const step = steps[i];
    if (!step) continue;

    if (gate && i === activeStepIndex) {
      const gateStatus = step.status === 'done' ? 'done'
        : step.status === 'failed' ? 'failed'
        : step.status === 'active' ? 'active'
        : 'pending';
      parts.push(renderGateStep(gate, gateStatus));
    } else {
      parts.push(renderStep(step, nameMaxLen));
    }
  }

  // Suffix: remaining count
  if (win.collapsedAfter > 0) {
    parts.push(`→ …${win.collapsedAfter} more`);
  }

  return parts.join(' → ');
}

// ─── Width enforcement ───────────────────────────────────────────────────────

function enforceWidth(
  full: string,
  pos: WorkflowPosition,
  scopePrefix: string,
  storiesDoneStr: string,
  maxWidth: number,
  nameMaxLen: number,
  maxSlots: number,
): string {
  if (stripAnsi(full).length <= maxWidth) return full;

  // Try reducing name length first
  for (let nl = nameMaxLen - 1; nl >= 3; nl--) {
    const steps = renderSteps(pos, nl, maxSlots);
    const candidate = scopePrefix + storiesDoneStr + steps;
    if (stripAnsi(candidate).length <= maxWidth) return candidate;
  }

  // Try reducing slot count
  for (let sl = maxSlots - 1; sl >= 1; sl--) {
    const steps = renderSteps(pos, 3, sl);
    const candidate = scopePrefix + storiesDoneStr + steps;
    if (stripAnsi(candidate).length <= maxWidth) return candidate;
  }

  // Hard truncate on plain text, re-applying ANSI at end is not feasible — just truncate raw
  const stripped = stripAnsi(full);
  return stripped.slice(0, maxWidth);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Pure function: workflow position → single-line display string.
 * No I/O, no side effects.
 */
export function visualize(pos: WorkflowPosition, vizConfig?: VizConfig): string {
  const maxWidth   = Math.min(vizConfig?.maxWidth   ?? 80, 120);
  const maxSlots   = vizConfig?.maxStepSlots   ?? 5;
  const nameMaxLen = vizConfig?.taskNameMaxLen  ?? 8;

  const scopePrefix    = buildScopePrefix(pos);
  const storiesDoneStr = pos.storiesDone ? 'stories✓ → ' : '';
  const steps          = renderSteps(pos, nameMaxLen, maxSlots);

  const full = scopePrefix + storiesDoneStr + steps;
  return enforceWidth(full, pos, scopePrefix, storiesDoneStr, maxWidth, nameMaxLen, maxSlots);
}

// ─── Snapshot → position ─────────────────────────────────────────────────────

const p = (o: unknown, k: string): unknown =>
  o !== null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;

function buildFlowSteps(flow: ResolvedWorkflow['storyFlow'], ai: number, t: 'done' | 'halted' | 'active'): StepStatus[] {
  return flow.reduce<StepStatus[]>((acc, step, i) => {
    const name = typeof step === 'string' ? step : isGateConfig(step) ? step.gate : null;
    if (!name) return acc;
    const status: StepStatus['status'] = t === 'done' ? 'done' : i < ai ? 'done' : i > ai ? 'pending' : t === 'halted' ? 'failed' : 'active';
    return [...acc, { name, status, ...(isGateConfig(step) ? { isGate: true } : {}) }];
  }, []);
}

/** Derive WorkflowPosition from an XState persisted snapshot + workflow config. Pure, no I/O. */
export function snapshotToPosition(snapshot: unknown, workflow: ResolvedWorkflow): WorkflowPosition {
  const empty: WorkflowPosition = { level: 'run', steps: [], activeStepIndex: 0 };
  try {
    if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object') return empty;
    const ctx = p(snapshot, 'context');
    const val = p(snapshot, 'value');
    // Reject snapshots with unrecognised state values — they are unparseable
    const KNOWN = ['processingEpic', 'checkNextEpic', 'allDone', 'halted', 'interrupted'];
    if (typeof val !== 'string' || !KNOWN.includes(val)) return empty;

    const t: 'done' | 'halted' | 'active' = val === 'allDone' ? 'done' : (val === 'halted' || p(ctx, 'halted') === true) ? 'halted' : 'active';

    const epicEntries  = p(ctx, 'epicEntries');
    const totalEpics   = Array.isArray(epicEntries) ? epicEntries.length : undefined;
    const rawEi = p(ctx, 'currentEpicIndex');
    const epicIndex  = typeof rawEi === 'number' ? rawEi + 1 : undefined;
    const epicIdRaw  = p(ctx, 'epicId');
    const epicId     = typeof epicIdRaw === 'string' ? epicIdRaw : undefined;
    const epicItems  = p(ctx, 'epicItems');
    const totalStories = Array.isArray(epicItems) ? epicItems.length : undefined;
    const rawSi = p(ctx, 'currentStoryIndex');
    const storyIndex = typeof rawSi === 'number' ? rawSi + 1 : undefined;
    const storiesDone = totalStories !== undefined && storyIndex !== undefined && storyIndex > totalStories;
    const rawStep = p(ctx, 'currentStepIndex');
    const ai    = typeof rawStep === 'number' ? rawStep : 0;
    const flow  = (storiesDone && workflow.epicFlow.length > 0)
      ? workflow.epicFlow
      : workflow.storyFlow.length > 0 ? workflow.storyFlow : workflow.epicFlow;
    const steps = buildFlowSteps(flow, ai, t);

    // Gate info is derived from the workflow config (active step) + workflowState scores.
    // context.gate is not present on persisted run/epic/story contexts — only GateContext has it.
    let gate: GateInfo | undefined;
    const activeFlowStep = flow[ai];
    if (t === 'active' && activeFlowStep && isGateConfig(activeFlowStep)) {
      const ws = p(ctx, 'workflowState');
      const sc = p(ws, 'evaluator_scores');
      const ls = Array.isArray(sc) && sc.length > 0 ? sc[sc.length - 1] : null;
      const ir = p(ws, 'iteration');
      gate = { name: activeFlowStep.gate,
        iteration: typeof ir === 'number' ? ir : 0,
        maxRetries: activeFlowStep.max_retries,
        passed: typeof p(ls, 'passed') === 'number' ? (p(ls, 'passed') as number) : 0,
        failed: typeof p(ls, 'failed') === 'number' ? (p(ls, 'failed') as number) : 0 };
    }

    const level: WorkflowPosition['level'] = gate ? 'gate' : storiesDone ? 'epic' : storyIndex !== undefined ? 'story' : epicIndex !== undefined ? 'epic' : 'run';
    return { level,
      ...(epicId !== undefined ? { epicId } : {}), ...(epicIndex !== undefined ? { epicIndex } : {}),
      ...(totalEpics !== undefined ? { totalEpics } : {}), ...(storyIndex !== undefined ? { storyIndex } : {}),
      ...(totalStories !== undefined ? { totalStories } : {}),
      steps, activeStepIndex: ai,
      ...(gate !== undefined ? { gate } : {}), ...(storiesDone ? { storiesDone } : {}),
    };
  } catch { return empty; } // IGNORE: defensive parser — any parse error returns safe default
}
