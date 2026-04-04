/**
 * Ink Terminal Renderer — live terminal UI for Claude activity display.
 * Exports startRenderer() which returns a RendererHandle for feeding events.
 *
 * Multi-lane support (story 20-3): when laneId is provided to update(),
 * events are routed to per-lane state. The activity section shows the
 * most recently active lane's events.
 */

import React from 'react';
import { render as inkRender } from 'ink';
import type { StreamEvent } from './agents/stream-parser.js';
import {
  App,
  type SprintInfo,
  type CompletedToolEntry,
  type RetryInfo,
  type RendererState,
  type StoryStatusEntry,
  type StoryMessage,
  type TaskNodeState,
  type TaskNodeMeta,
} from './ink-components.js';
import type { FlowStep } from './workflow-parser.js';
import type { LaneEvent } from './lane-pool.js';
import type { MergeState } from './ink-merge-status.js';

// --- Public Types ---

export interface RendererOptions {
  quiet?: boolean;
  sprintState?: SprintInfo;
  /** Called when user presses 'q' to quit. */
  onQuit?: () => void;
  /** @internal Force TTY mode for testing. Not part of the public API. */
  _forceTTY?: boolean;
}

/**
 * Per-lane activity state tracked by the renderer controller.
 */
export interface LaneActivityState {
  completedTools: CompletedToolEntry[];
  activeTool: { name: string } | null;
  activeToolArgs: string;
  lastThought: string | null;
  retryInfo: RetryInfo | null;
  activeDriverName: string | null;
  status: 'active' | 'completed' | 'failed';
  lastActivityTime: number;
}

export interface RendererHandle {
  update(event: StreamEvent, driverName?: string, laneId?: string): void;
  updateSprintState(state: SprintInfo | undefined): void;
  updateStories(stories: StoryStatusEntry[]): void;
  addMessage(msg: StoryMessage): void;
  updateWorkflowState(flow: FlowStep[], currentTask: string | null, taskStates: Record<string, TaskNodeState>, taskMeta?: Record<string, TaskNodeMeta>): void;
  processLaneEvent(event: LaneEvent): void;
  updateMergeState(mergeState: MergeState | null): void;
  cleanup(): void;
  /** @internal Expose state for testing. Not part of the public API. */
  _getState?(): RendererState;
  /** @internal Expose lane states for testing. */
  _getLaneStates?(): Map<string, LaneActivityState>;
  /** @internal Expose cycleLane for testing. */
  _cycleLane?(): void;
}

// --- No-op handle for quiet mode ---

const noopHandle: RendererHandle = {
  update(_event: StreamEvent, _driverName?: string, _laneId?: string) {},
  updateSprintState() {},
  updateStories() {},
  addMessage() {},
  updateWorkflowState() {},
  processLaneEvent() {},
  updateMergeState() {},
  cleanup() {},
};

/** Maximum number of completed tools to retain in the display list. */
const MAX_COMPLETED_TOOLS = 50;

// --- Controller ---

/**
 * Start the Ink terminal renderer.
 *
 * If `quiet` is true or stdout is not a TTY, returns a no-op handle
 * (no Ink instance created).
 * Otherwise, mounts the component tree and returns a handle for feeding events.
 */
export function startRenderer(options?: RendererOptions): RendererHandle {
  if (options?.quiet || (!process.stdout.isTTY && !options?._forceTTY)) {
    return noopHandle;
  }

  // Mutable state that drives re-renders
  let state: RendererState = {
    sprintInfo: options?.sprintState ?? null,
    stories: [],
    messages: [],
    completedTools: [],
    activeTool: null,
    activeToolArgs: '',
    lastThought: null,
    retryInfo: null,
    workflowFlow: [],
    currentTaskName: null,
    taskStates: {},
    taskMeta: {},
    activeDriverName: null,
    driverCosts: {},
    storyContext: [],
    activeLaneId: null,
    laneCount: 0,
  };

  // Per-lane state map (multi-lane mode)
  const laneStates = new Map<string, LaneActivityState>();
  // Whether user has pinned a lane via Ctrl+L
  let pinnedLane = false;

  // Per-story cost tracking (not part of RendererState — internal to controller)
  let currentStoryCosts: Record<string, number> = {};
  let lastStoryKey: string | null = state.sprintInfo?.storyKey ?? null;
  // Costs finalized for completed stories, awaiting snapshot into StoryStatusEntry
  const pendingStoryCosts: Map<string, Record<string, number>> = new Map();

  let cleaned = false;

  // Mount Ink with performance options
  const onQuit = options?.onQuit;
  const inkInstance = inkRender(<App state={state} onCycleLane={() => cycleLane()} onQuit={onQuit ? () => onQuit() : undefined} />, {
    exitOnCtrlC: false,
    patchConsole: false, // Disable console patching to prevent flicker
    maxFps: 10,
  });

  function rerender() {
    if (!cleaned) {
      // Create a new state object reference to trigger React re-render
      state = { ...state };
      inkInstance.rerender(<App state={state} onCycleLane={() => cycleLane()} onQuit={onQuit ? () => onQuit() : undefined} />);
    }
  }

  // Heartbeat: periodic re-renders for spinner animation even when no events flow.
  // Runs every 500ms — spinner frame derives from Date.now() so it still animates.
  const heartbeat = setInterval(() => {
    if (!cleaned) rerender();
  }, 500);

  // SIGINT/SIGTERM: cleanup Ink and stop heartbeat, but do NOT re-send signal.
  // The caller (run.ts) handles abort signaling — Ink just needs to unmount cleanly.
  function onSigint() { cleanupFull(); }
  function onSigterm() { cleanupFull(); }
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  /** Promote active tool to completed list, bounded to MAX_COMPLETED_TOOLS. */
  function promoteActiveTool(clearActive: boolean, targetState?: LaneActivityState) {
    const s = targetState ?? state;
    if (!s.activeTool) return;
    const entry: CompletedToolEntry = {
      name: s.activeTool.name, args: s.activeToolArgs,
      driver: s.activeDriverName ?? undefined,
    };
    const updated = [...s.completedTools, entry];
    s.completedTools = updated.length > MAX_COMPLETED_TOOLS
      ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
    if (clearActive) { s.activeTool = null; s.activeToolArgs = ''; s.activeDriverName = null; }
  }

  /** Copy a lane's activity state to top-level RendererState fields for display. */
  function copyLaneToDisplay(laneId: string) {
    const ls = laneStates.get(laneId);
    if (!ls) return;
    state.completedTools = [...ls.completedTools];
    state.activeTool = ls.activeTool ? { ...ls.activeTool } : null;
    state.activeToolArgs = ls.activeToolArgs;
    state.lastThought = ls.lastThought;
    state.retryInfo = ls.retryInfo ? { ...ls.retryInfo } : null;
    state.activeDriverName = ls.activeDriverName;
    state.activeLaneId = laneId;
  }

  /** Get or create lane state for a laneId. */
  function getOrCreateLaneState(laneId: string): LaneActivityState {
    let ls = laneStates.get(laneId);
    if (!ls) {
      ls = {
        completedTools: [],
        activeTool: null,
        activeToolArgs: '',
        lastThought: null,
        retryInfo: null,
        activeDriverName: null,
        status: 'active',
        lastActivityTime: Date.now(),
      };
      laneStates.set(laneId, ls);
    }
    return ls;
  }

  /** Get list of active lane IDs for Ctrl+L cycling. */
  function getActiveLaneIds(): string[] {
    const ids: string[] = [];
    for (const [id, ls] of laneStates) {
      if (ls.status === 'active') ids.push(id);
    }
    return ids;
  }

  function update(event: StreamEvent, driverName?: string, laneId?: string): void {
    if (cleaned) return;

    // When laneId is provided, route to per-lane state
    if (laneId) {
      const ls = getOrCreateLaneState(laneId);
      ls.lastActivityTime = Date.now();

      switch (event.type) {
        case 'tool-start':
          promoteActiveTool(false, ls);
          ls.activeTool = { name: event.name };
          ls.activeToolArgs = '';
          ls.activeDriverName = driverName ?? null;
          ls.lastThought = null;
          ls.retryInfo = null;
          break;

        case 'tool-input':
          ls.activeToolArgs += event.partial;
          // Skip rerender for tool-input (same as single-lane)
          return;

        case 'tool-complete':
          if (ls.activeTool) {
            if (['Agent', 'Skill'].includes(ls.activeTool.name)) break;
            promoteActiveTool(true, ls);
          }
          break;

        case 'text':
          ls.lastThought = event.text;
          ls.retryInfo = null;
          break;

        case 'retry':
          ls.retryInfo = { attempt: event.attempt, delay: event.delay };
          break;

        case 'result':
          if (event.cost > 0 && state.sprintInfo) {
            state.sprintInfo = {
              ...state.sprintInfo,
              totalCost: (state.sprintInfo.totalCost ?? 0) + event.cost,
            };
          }
          if (event.cost > 0 && driverName) {
            state.driverCosts = {
              ...state.driverCosts,
              [driverName]: (state.driverCosts[driverName] ?? 0) + event.cost,
            };
            currentStoryCosts = {
              ...currentStoryCosts,
              [driverName]: (currentStoryCosts[driverName] ?? 0) + event.cost,
            };
          }
          break;
      }

      // Auto-switch to most recently active lane (unless user pinned)
      if (!pinnedLane && state.activeLaneId !== laneId) {
        state.activeLaneId = laneId;
      }
      // Reset pin when a new event arrives from a different lane (AC #4)
      if (pinnedLane && state.activeLaneId !== laneId) {
        pinnedLane = false;
      }
      // If this is the displayed lane, copy to top-level
      if (state.activeLaneId === laneId) {
        copyLaneToDisplay(laneId);
      }

      state.laneCount = laneStates.size;
      rerender();
      return;
    }

    // Single-lane mode (no laneId) — behave exactly as before
    switch (event.type) {
      case 'tool-start':
        // Promote current thought to log before clearing
        if (state.lastThought) {
          const textEntry: CompletedToolEntry = { name: '', args: state.lastThought, isText: true };
          const updated = [...state.completedTools, textEntry];
          state.completedTools = updated.length > MAX_COMPLETED_TOOLS
            ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
        }
        promoteActiveTool(false);
        state.activeTool = { name: event.name };
        state.activeToolArgs = '';
        state.activeDriverName = driverName ?? null;
        state.lastThought = null;
        state.retryInfo = null;
        break;

      case 'tool-input':
        state.activeToolArgs += event.partial;
        return; // Skip rerender

      case 'tool-complete':
        if (state.activeTool) {
          if (['Agent', 'Skill'].includes(state.activeTool.name)) break;
          promoteActiveTool(true);
        }
        break;

      case 'text':
        // Add previous thought to completed log before replacing
        if (state.lastThought) {
          const textEntry: CompletedToolEntry = { name: '', args: state.lastThought, isText: true };
          const updated = [...state.completedTools, textEntry];
          state.completedTools = updated.length > MAX_COMPLETED_TOOLS
            ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
        }
        state.lastThought = event.text;
        state.retryInfo = null;
        break;

      case 'retry':
        state.retryInfo = { attempt: event.attempt, delay: event.delay };
        break;

      case 'result':
        if (event.cost > 0 && state.sprintInfo) {
          state.sprintInfo = {
            ...state.sprintInfo,
            totalCost: (state.sprintInfo.totalCost ?? 0) + event.cost,
          };
        }
        if (event.cost > 0 && driverName) {
          state.driverCosts = {
            ...state.driverCosts,
            [driverName]: (state.driverCosts[driverName] ?? 0) + event.cost,
          };
          currentStoryCosts = {
            ...currentStoryCosts,
            [driverName]: (currentStoryCosts[driverName] ?? 0) + event.cost,
          };
        }
        break;
    }

    rerender();
  }

  function processLaneEvent(event: LaneEvent): void {
    if (cleaned) return;

    switch (event.type) {
      case 'lane-started': {
        const ls = getOrCreateLaneState(event.epicId);
        ls.status = 'active';
        ls.lastActivityTime = Date.now();
        // If this is the first lane, set it as active display
        if (state.activeLaneId == null) {
          state.activeLaneId = event.epicId;
          copyLaneToDisplay(event.epicId);
        }
        state.laneCount = laneStates.size;
        break;
      }

      case 'lane-completed': {
        const ls = laneStates.get(event.epicId);
        if (ls) {
          ls.status = 'completed';
        }
        // Update summaryBar: mark epic as done, remove from pending
        if (state.summaryBar) {
          const epicId = event.epicId;
          const newDone = [...state.summaryBar.doneStories];
          if (!newDone.includes(epicId)) newDone.push(epicId);
          const newPending = state.summaryBar.pendingEpics.filter(e => e !== epicId);
          state.summaryBar = {
            ...state.summaryBar,
            doneStories: newDone,
            pendingEpics: newPending,
          };
        }
        state.laneCount = laneStates.size;
        break;
      }

      case 'lane-failed': {
        const ls = laneStates.get(event.epicId);
        if (ls) {
          ls.status = 'failed';
        } else {
          // Defensive: create lane state for unknown laneId
          const newLs = getOrCreateLaneState(event.epicId);
          newLs.status = 'failed';
        }
        // Do NOT freeze TUI — continue rendering other lanes (NFR6)
        // If the failed lane was active, switch to next active lane
        if (state.activeLaneId === event.epicId) {
          const activeIds = getActiveLaneIds();
          if (activeIds.length > 0) {
            state.activeLaneId = activeIds[0];
            copyLaneToDisplay(activeIds[0]);
          }
        }
        state.laneCount = laneStates.size;
        break;
      }

      case 'epic-queued': {
        // Update summaryBar pendingEpics
        if (state.summaryBar) {
          if (!state.summaryBar.pendingEpics.includes(event.epicId)) {
            state.summaryBar = {
              ...state.summaryBar,
              pendingEpics: [...state.summaryBar.pendingEpics, event.epicId],
            };
          }
        }
        break;
      }
    }

    rerender();
  }

  function updateMergeState(mergeState: MergeState | null): void {
    if (cleaned) return;
    state.mergeState = mergeState;
    // Clear summaryBar mergingEpic when mergeState is null
    if (state.summaryBar && !mergeState) {
      state.summaryBar = { ...state.summaryBar, mergingEpic: null };
    }
    // Also update summaryBar mergingEpic
    if (state.summaryBar && mergeState) {
      const mergingStatus = mergeState.outcome === 'clean' || mergeState.outcome === 'resolved'
        ? 'complete' as const
        : mergeState.outcome === 'escalated'
          ? 'complete' as const
          : 'in-progress' as const;
      state.summaryBar = {
        ...state.summaryBar,
        mergingEpic: {
          epicId: mergeState.epicId,
          status: mergingStatus,
          conflictCount: mergeState.conflictCount,
        },
      };
    }
    rerender();
  }

  /** Cycle to the next active lane (Ctrl+L). */
  function cycleLane(): void {
    if (cleaned) return;
    const activeIds = getActiveLaneIds();
    if (activeIds.length <= 1) return; // Nothing to cycle to

    const currentIndex = state.activeLaneId ? activeIds.indexOf(state.activeLaneId) : -1;
    const nextIndex = (currentIndex + 1) % activeIds.length;
    state.activeLaneId = activeIds[nextIndex];
    copyLaneToDisplay(activeIds[nextIndex]);
    pinnedLane = true;
    rerender();
  }

  function cleanupFull() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    try { inkInstance.unmount(); } catch { /* IGNORE: may already be unmounted */ }
    try { inkInstance.cleanup(); } catch { /* IGNORE: cleanup error */ }
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }

  function updateSprintState(sprintState: SprintInfo | undefined): void {
    if (cleaned) return;
    if (sprintState && state.sprintInfo) {
      state.sprintInfo = {
        ...sprintState,
        totalCost: sprintState.totalCost ?? state.sprintInfo.totalCost,
        acProgress: sprintState.acProgress ?? state.sprintInfo.acProgress,
        currentCommand: sprintState.currentCommand ?? state.sprintInfo.currentCommand,
      };
    } else {
      state.sprintInfo = sprintState ?? null;
    }

    const newKey = state.sprintInfo?.storyKey ?? null;
    if (newKey && lastStoryKey && newKey !== lastStoryKey) {
      if (Object.keys(currentStoryCosts).length > 0) {
        pendingStoryCosts.set(lastStoryKey, { ...currentStoryCosts });
      }
      currentStoryCosts = {};
      lastStoryKey = newKey;
    } else if (newKey && !lastStoryKey) {
      lastStoryKey = newKey;
    }

    rerender();
  }

  function updateStories(stories: StoryStatusEntry[]): void {
    if (cleaned) return;
    const currentKey = state.sprintInfo?.storyKey ?? null;
    const hasCurrentCosts = Object.keys(currentStoryCosts).length > 0;
    const updatedStories = stories.map(s => {
      if (s.status !== 'done' || s.costByDriver) return s;
      const pending = pendingStoryCosts.get(s.key);
      if (pending) {
        pendingStoryCosts.delete(s.key);
        return { ...s, costByDriver: pending };
      }
      if (hasCurrentCosts && s.key === (lastStoryKey ?? currentKey)) {
        const snap = { ...currentStoryCosts };
        currentStoryCosts = {};
        return { ...s, costByDriver: snap };
      }
      return s;
    });
    if (currentKey && currentKey !== lastStoryKey) {
      if (lastStoryKey && Object.keys(currentStoryCosts).length > 0) {
        pendingStoryCosts.set(lastStoryKey, { ...currentStoryCosts });
      }
      currentStoryCosts = {};
      lastStoryKey = currentKey;
    } else if (currentKey && !lastStoryKey) {
      lastStoryKey = currentKey;
    }
    state.stories = updatedStories;

    // Compute story context (prev/current/next)
    const ctx: import('./ink-components.js').StoryContextEntry[] = [];
    const currentStory = currentKey ?? '';
    const currentTask = state.currentTaskName ?? '';
    let foundCurrent = false;
    let prevKey: string | null = null;
    for (const s of updatedStories) {
      if (s.key === currentStory) {
        if (prevKey) ctx.push({ key: prevKey, role: 'prev' });
        ctx.push({ key: s.key, role: 'current', task: currentTask });
        foundCurrent = true;
      } else if (foundCurrent && s.status === 'pending') {
        ctx.push({ key: s.key, role: 'next' });
        break;
      } else if (s.status === 'done') {
        prevKey = s.key;
      }
    }
    state.storyContext = ctx;

    rerender();
  }

  function addMessage(msg: StoryMessage): void {
    if (cleaned) return;
    state.messages = [...state.messages, msg];
    rerender();
  }

  function updateWorkflowState(flow: FlowStep[], currentTask: string | null, taskStates: Record<string, TaskNodeState>, taskMeta?: Record<string, TaskNodeMeta>): void {
    if (cleaned) return;
    state.workflowFlow = flow;
    state.currentTaskName = currentTask;
    state.taskStates = { ...taskStates };
    state.taskMeta = taskMeta ? { ...taskMeta } : state.taskMeta;
    rerender();
  }

  return {
    update,
    updateSprintState,
    updateStories,
    addMessage,
    updateWorkflowState,
    processLaneEvent,
    updateMergeState,
    cleanup: cleanupFull,
    _getState: () => state,
    _getLaneStates: () => laneStates,
    _cycleLane: () => cycleLane(),
  };
}

// Re-export types that consumers may need
export type { SprintInfo, CompletedToolEntry, RetryInfo, RendererState, StoryStatusEntry, StoryStatusValue, StoryMessage, TaskNodeState, TaskNodeMeta } from './ink-components.js';
