/**
 * Public API for the docker subsystem.
 */

// Types
export type {
  DockerServiceStatus,
  DockerStartResult,
  DockerHealthService,
  DockerHealthResult,
  RemoteEndpointCheckResult,
} from './health.js';

// Health checks
export {
  isDockerAvailable,
  isDockerComposeAvailable,
  getStackHealth,
  getCollectorHealth,
  checkRemoteEndpoint,
} from './health.js';

// Compose operations
export {
  isStackRunning,
  isSharedStackRunning,
  startStack,
  startSharedStack,
  stopStack,
  stopSharedStack,
  startCollectorOnly,
  isCollectorRunning,
  stopCollectorOnly,
} from './compose.js';

// Cleanup
export {
  cleanupOrphanedContainers,
  cleanupVerifyEnv,
} from './cleanup.js';
