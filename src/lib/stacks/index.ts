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
import { registerProvider } from './registry.js';
import { NodejsProvider } from './nodejs.js';
import { PythonProvider } from './python.js';
import { RustProvider } from './rust.js';

registerProvider(new NodejsProvider());
registerProvider(new PythonProvider());
registerProvider(new RustProvider());
