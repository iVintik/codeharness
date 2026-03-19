import { describe, it, expect, vi } from 'vitest';
import { createObservabilityBackend } from '../observability.js';
import { VictoriaBackend } from '../victoria-backend.js';
import { OpenSearchBackend } from '../opensearch-backend.js';

// Mock fetch for OpenSearchBackend (it uses fetch internally)
vi.stubGlobal('fetch', vi.fn());

describe('createObservabilityBackend', () => {
  it('returns VictoriaBackend by default (AC#7)', () => {
    const backend = createObservabilityBackend();
    expect(backend).toBeInstanceOf(VictoriaBackend);
    expect(backend.type).toBe('victoria');
  });

  it('returns VictoriaBackend when no opensearch URL configured', () => {
    const backend = createObservabilityBackend({});
    expect(backend).toBeInstanceOf(VictoriaBackend);
  });

  it('passes victoria config through to VictoriaBackend', () => {
    const backend = createObservabilityBackend({
      victoria: {
        logsUrl: 'http://custom:1111',
        metricsUrl: 'http://custom:2222',
        tracesUrl: 'http://custom:3333',
      },
    });
    expect(backend).toBeInstanceOf(VictoriaBackend);
  });

  it('returns OpenSearchBackend when opensearch URL is provided (AC#7)', () => {
    const backend = createObservabilityBackend({
      opensearchUrl: 'http://opensearch:9200',
    });
    expect(backend).toBeInstanceOf(OpenSearchBackend);
    expect(backend.type).toBe('opensearch');
  });

  it('passes opensearch index config through to OpenSearchBackend', () => {
    const backend = createObservabilityBackend({
      opensearchUrl: 'http://opensearch:9200',
      opensearch: {
        logsIndex: 'custom-logs',
        metricsIndex: 'custom-metrics',
        tracesIndex: 'custom-traces',
      },
    });
    expect(backend).toBeInstanceOf(OpenSearchBackend);
    expect(backend.type).toBe('opensearch');
  });
});
