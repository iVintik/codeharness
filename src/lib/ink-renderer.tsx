/**
 * Ink Terminal Renderer — live terminal UI for Claude activity display.
 *
 * Exports a controller API: startRenderer(), which returns a RendererHandle
 * with update(), updateSprintState(), and cleanup() methods.
 *
 * The renderer accumulates state from StreamEvent objects and renders
 * tool calls, thoughts, and sprint progress using Ink (React for terminals).
 */

import React from 'react';
import { render as inkRender } from 'ink';
import type { StreamEvent } from './stream-parser.js';
import {
  App,
  type SprintInfo,
  type CompletedToolEntry,
  type RetryInfo,
  type RendererState,
  type StoryStatusEntry,
  type StoryMessage,
} from './ink-components.js';

// --- Public Types ---

export interface RendererOptions {
  quiet?: boolean;
  sprintState?: SprintInfo;
  /** @internal Force TTY mode for testing. Not part of the public API. */
  _forceTTY?: boolean;
}

export interface RendererHandle {
  update(event: StreamEvent): void;
  updateSprintState(state: SprintInfo | undefined): void;
  updateStories(stories: StoryStatusEntry[]): void;
  addMessage(msg: StoryMessage): void;
  cleanup(): void;
}

// --- No-op handle for quiet mode ---

const noopHandle: RendererHandle = {
  update() {},
  updateSprintState() {},
  updateStories() {},
  addMessage() {},
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

  // Clear screen so dashboard renders from top
  process.stdout.write('\x1b[2J\x1b[H');

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
  };

  let cleaned = false;

  // Mount Ink with performance optimizations
  const inkInstance = inkRender(<App state={state} />, {
    exitOnCtrlC: false,
    patchConsole: false,
    incrementalRendering: true,  // Only redraw changed lines (v6.5+)
    maxFps: 15,                  // Dashboard doesn't need 30fps
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
    try {
      inkInstance.unmount();
    } catch {
      // Ignore — may already be unmounted
    }
    try {
      inkInstance.cleanup();
    } catch {
      // Ignore
    }
    // Remove our signal handlers
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }

  function onSigint() {
    cleanup();
    // Re-raise signal so the default handler runs (allows caller to handle exit)
    process.kill(process.pid, 'SIGINT');
  }

  function onSigterm() {
    cleanup();
    process.kill(process.pid, 'SIGTERM');
  }

  // Register signal handlers
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  function update(event: StreamEvent): void {
    if (cleaned) return;

    switch (event.type) {
      case 'tool-start':
        state.activeTool = { name: event.name };
        state.activeToolArgs = '';
        state.lastThought = null;
        state.retryInfo = null;
        break;

      case 'tool-input':
        state.activeToolArgs += event.partial;
        break;

      case 'tool-complete':
        // CRITICAL: Only promote if there's an active tool.
        // The parser emits tool-complete for ALL content_block_stop events
        // (both tool and text blocks). Ignore if no activeTool is set.
        if (state.activeTool) {
          const entry: CompletedToolEntry = {
            name: state.activeTool.name,
            args: state.activeToolArgs,
          };
          const updated = [...state.completedTools, entry];
          // Bound the list to prevent unbounded memory growth in long sessions
          state.completedTools = updated.length > MAX_COMPLETED_TOOLS
            ? updated.slice(updated.length - MAX_COMPLETED_TOOLS)
            : updated;
          state.activeTool = null;
          state.activeToolArgs = '';
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
    rerender();
  }

  function updateStories(stories: StoryStatusEntry[]): void {
    if (cleaned) return;
    state.stories = [...stories];
    rerender();
  }

  function addMessage(msg: StoryMessage): void {
    if (cleaned) return;
    state.messages = [...state.messages, msg];
    rerender();
  }

  return { update, updateSprintState, updateStories, addMessage, cleanup };
}

// Re-export types that consumers may need
export type { SprintInfo, CompletedToolEntry, RetryInfo, RendererState, StoryStatusEntry, StoryStatusValue, StoryMessage } from './ink-components.js';
