import type { ExecutionScope, ExecutionTarget } from './workflow-types.js';

export function inferExecutionScope(key: string): ExecutionScope {
  if (key === '__run__' || key === '__sprint__') return 'run';
  if (key.startsWith('__epic_')) return 'epic';
  return 'story';
}

export function normalizeExecutionTarget(key: string, target?: ExecutionTarget): ExecutionTarget {
  return target ?? { scope: inferExecutionScope(key), key };
}

export function describeExecutionTarget(target: ExecutionTarget): string {
  switch (target.scope) {
    case 'run':
      return 'run';
    case 'epic':
      return `epic ${target.key}`;
    case 'story':
    default:
      return `story ${target.key}`;
  }
}
