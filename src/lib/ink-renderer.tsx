/**
 * Ink Terminal Renderer — live terminal UI for Claude activity display.
 * Exports startRenderer() which returns a RendererHandle for feeding events.
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

// --- Public Types ---

export interface RendererOptions {
  quiet?: boolean;
  sprintState?: SprintInfo;
  /** @internal Force TTY mode for testing. Not part of the public API. */
  _forceTTY?: boolean;
}

export interface RendererHandle {
  update(event: StreamEvent, driverName?: string): void;
  updateSprintState(state: SprintInfo | undefined): void;
  updateStories(stories: StoryStatusEntry[]): void;
  addMessage(msg: StoryMessage): void;
  updateWorkflowState(flow: FlowStep[], currentTask: string | null, taskStates: Record<string, TaskNodeState>, taskMeta?: Record<string, TaskNodeMeta>): void;
  cleanup(): void;
  /** @internal Expose state for testing. Not part of the public API. */
  _getState?(): RendererState;
}

// --- No-op handle for quiet mode ---

const noopHandle: RendererHandle = {
  update(_event: StreamEvent, _driverName?: string) {},
  updateSprintState() {},
  updateStories() {},
  addMessage() {},
  updateWorkflowState() {},
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
  };

  // Per-story cost tracking (not part of RendererState — internal to controller)
  let currentStoryCosts: Record<string, number> = {};
  let lastStoryKey: string | null = state.sprintInfo?.storyKey ?? null;
  // Costs finalized for completed stories, awaiting snapshot into StoryStatusEntry
  const pendingStoryCosts: Map<string, Record<string, number>> = new Map();

  let cleaned = false;

  // Mount Ink with performance options
  const inkInstance = inkRender(<App state={state} />, {
    exitOnCtrlC: false,
    patchConsole: !options?._forceTTY,
    maxFps: 15,
  });

  function rerender() {
    if (!cleaned) {
      // Create a new state object reference to trigger React re-render
      state = { ...state };
      inkInstance.rerender(<App state={state} />);
    }
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try { inkInstance.unmount(); } catch { /* may already be unmounted */ }
    try { inkInstance.cleanup(); } catch { /* ignore */ }
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }

  function onSigint() { cleanup(); process.kill(process.pid, 'SIGINT'); }
  function onSigterm() { cleanup(); process.kill(process.pid, 'SIGTERM'); }
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  /** Promote active tool to completed list, bounded to MAX_COMPLETED_TOOLS. */
  function promoteActiveTool(clearActive: boolean) {
    if (!state.activeTool) return;
    const entry: CompletedToolEntry = {
      name: state.activeTool.name, args: state.activeToolArgs,
      driver: state.activeDriverName ?? undefined,
    };
    const updated = [...state.completedTools, entry];
    state.completedTools = updated.length > MAX_COMPLETED_TOOLS
      ? updated.slice(updated.length - MAX_COMPLETED_TOOLS) : updated;
    if (clearActive) { state.activeTool = null; state.activeToolArgs = ''; state.activeDriverName = null; }
  }

  function update(event: StreamEvent, driverName?: string): void {
    if (cleaned) return;

    switch (event.type) {
      case 'tool-start':
        promoteActiveTool(false); // promote any lingering long-running tool
        state.activeTool = { name: event.name };
        state.activeToolArgs = '';
        state.activeDriverName = driverName ?? null;
        state.lastThought = null;
        state.retryInfo = null;
        break;

      case 'tool-input':
        state.activeToolArgs += event.partial;
        return; // Skip rerender — args only shown on completion

      case 'tool-complete':
        // Only promote if there's an active tool (parser emits tool-complete for text blocks too).
        // Long-running tools (Agent, Skill) stay active until next tool-start.
        if (state.activeTool) {
          if (['Agent', 'Skill'].includes(state.activeTool.name)) break;
          promoteActiveTool(true);
        }
        break;

      case 'text':
        state.lastThought = event.text;
        state.retryInfo = null;
        break;

      case 'retry':
        state.retryInfo = { attempt: event.attempt, delay: event.delay };
        break;

      case 'result':
        // Accumulate cost from result events (AC #7)
        if (event.cost > 0 && state.sprintInfo) {
          state.sprintInfo = {
            ...state.sprintInfo,
            totalCost: (state.sprintInfo.totalCost ?? 0) + event.cost,
          };
        }
        // Accumulate per-driver cost (run-level)
        if (event.cost > 0 && driverName) {
          state.driverCosts = {
            ...state.driverCosts,
            [driverName]: (state.driverCosts[driverName] ?? 0) + event.cost,
          };
          // Accumulate per-story cost
          currentStoryCosts = {
            ...currentStoryCosts,
            [driverName]: (currentStoryCosts[driverName] ?? 0) + event.cost,
          };
        }
        break;
    }

    rerender();
  }

  function updateSprintState(sprintState: SprintInfo | undefined): void {
    if (cleaned) return;
    if (sprintState && state.sprintInfo) {
      // Preserve accumulated fields (totalCost, acProgress, currentCommand)
      // that are set by event handlers but not by the polling caller.
      state.sprintInfo = {
        ...sprintState,
        totalCost: sprintState.totalCost ?? state.sprintInfo.totalCost,
        acProgress: sprintState.acProgress ?? state.sprintInfo.acProgress,
        currentCommand: sprintState.currentCommand ?? state.sprintInfo.currentCommand,
      };
    } else {
      state.sprintInfo = sprintState ?? null;
    }

    // When story key changes, freeze current costs for the old story
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
    // Snapshot per-story costs onto done stories (immutable — don't mutate caller objects).
    // Check both pendingStoryCosts (from prior stories) and currentStoryCosts (active story).
    const hasCurrentCosts = Object.keys(currentStoryCosts).length > 0;
    const updatedStories = stories.map(s => {
      if (s.status !== 'done' || s.costByDriver) return s;
      // Check pending costs first (costs frozen when story key changed)
      const pending = pendingStoryCosts.get(s.key);
      if (pending) {
        pendingStoryCosts.delete(s.key);
        return { ...s, costByDriver: pending };
      }
      // Check current costs (story completing without key change)
      if (hasCurrentCosts && s.key === (lastStoryKey ?? currentKey)) {
        const snap = { ...currentStoryCosts };
        currentStoryCosts = {};
        return { ...s, costByDriver: snap };
      }
      return s;
    });
    // Track story key changes for per-story cost reset
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

  return { update, updateSprintState, updateStories, addMessage, updateWorkflowState, cleanup, _getState: () => state };
}

// Re-export types that consumers may need
export type { SprintInfo, CompletedToolEntry, RetryInfo, RendererState, StoryStatusEntry, StoryStatusValue, StoryMessage, TaskNodeState, TaskNodeMeta } from './ink-components.js';
