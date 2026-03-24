/**
 * Public API for the stacks subsystem.
 */

// Types
export type {
  StackName,
  AppType,
  CoverageToolName,
  CoverageToolInfo,
  OtlpResult,
  TestCounts,
  StackProvider,
} from './types.js';

// Registry
export {
  registerProvider,
  getStackProvider,
  detectStack,
  detectStacks,
  type StackDetection,
  _resetRegistry,
} from './registry.js';

// Auto-register built-in providers
import { registerProvider, getStackProvider } from './registry.js';
import { NodejsProvider } from './nodejs.js';
import { PythonProvider } from './python.js';
import { RustProvider } from './rust.js';
import type { AppType, StackName } from './types.js';

registerProvider(new NodejsProvider());
registerProvider(new PythonProvider());
registerProvider(new RustProvider());

/**
 * Detect the application type for a given directory and stack.
 * Delegates to the registered StackProvider if one exists,
 * otherwise returns 'generic'.
 */
export function detectAppType(dir: string, stack: string | null): AppType {
  if (!stack) return 'generic';
  const provider = getStackProvider(stack as StackName);
  if (!provider) return 'generic';
  return provider.detectAppType(dir);
}
