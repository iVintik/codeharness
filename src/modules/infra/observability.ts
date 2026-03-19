/**
 * Observability backend factory.
 * Returns the appropriate ObservabilityBackend based on configuration.
 */

import type { ObservabilityBackend } from '../../types/observability.js';
import { VictoriaBackend } from './victoria-backend.js';
import type { VictoriaConfig } from './victoria-backend.js';
import { OpenSearchBackend } from './opensearch-backend.js';
import type { OpenSearchConfig } from './opensearch-backend.js';

/** Configuration for the observability backend factory */
export interface ObservabilityConfig {
  opensearchUrl?: string;
  opensearch?: Omit<OpenSearchConfig, 'url'>;
  victoria?: VictoriaConfig;
}

/**
 * Create the appropriate observability backend.
 * Returns OpenSearchBackend when opensearchUrl is configured; VictoriaBackend otherwise.
 */
export function createObservabilityBackend(config?: ObservabilityConfig): ObservabilityBackend {
  if (config?.opensearchUrl) {
    return new OpenSearchBackend({
      url: config.opensearchUrl,
      logsIndex: config.opensearch?.logsIndex,
      metricsIndex: config.opensearch?.metricsIndex,
      tracesIndex: config.opensearch?.tracesIndex,
    });
  }
  return new VictoriaBackend(config?.victoria);
}
