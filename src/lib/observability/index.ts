/**
 * Public API for the observability (OTLP) subsystem.
 *
 * NOTE: This directory (`src/lib/observability/`) contains low-level OTLP
 * configuration utilities (package installation, env var management, backend
 * query builders). It is distinct from `src/modules/observability/` which
 * contains the Semgrep-based static analysis audit module for detecting
 * missing observability instrumentation.
 */

// Types
export type { OtlpResult } from './instrument.js';
export type { ObservabilityBackend } from './backends.js';

// Instrument
export {
  installNodeOtlp,
  installPythonOtlp,
  installRustOtlp,
  instrumentProject,
  patchNodeStartScript,
} from './instrument.js';

// Config
export {
  configureOtlpEnvVars,
  ensureServiceNameEnvVar,
  ensureEndpointEnvVar,
  configureCli,
  configureWeb,
  configureAgent,
  WEB_OTLP_PACKAGES,
  AGENT_OTLP_PACKAGES_NODE,
  AGENT_OTLP_PACKAGES_PYTHON,
  NODE_REQUIRE_FLAG,
} from './config.js';

// Backends
export { VictoriaBackend, ElkBackend } from './backends.js';
