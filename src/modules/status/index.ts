/**
 * Status module — aggregates harness status, formats output, builds endpoints.
 *
 * Public API:
 *   handleFullStatus(isJson)       — full status display
 *   handleDockerCheck(isJson)      — --check-docker mode
 *   handleHealthCheck(isJson)      — --check mode
 *   handleStoryDrillDown(id, json) — --story <key> mode
 *   buildScopedEndpoints(...)      — URL builders for scoped dashboards
 *   resolveEndpoints(state)        — resolve correct endpoints for OTLP mode
 *   DEFAULT_ENDPOINTS              — default local endpoint URLs
 */

// Re-export endpoint utilities (public API)
export {
  buildScopedEndpoints,
  resolveEndpoints,
  DEFAULT_ENDPOINTS,
} from './endpoints.js';
export type { EndpointUrls, ScopedEndpointUrls } from './endpoints.js';

// Re-export formatters (command handlers)
export {
  handleFullStatus,
  handleDockerCheck,
  handleHealthCheck,
} from './formatters.js';

// Re-export drill-down handler
export { handleStoryDrillDown } from './drill-down.js';
