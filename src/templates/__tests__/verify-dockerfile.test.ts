import { describe, it, expect } from 'vitest';
import { verifyDockerfileTemplate } from '../verify-dockerfile.js';

describe('verifyDockerfileTemplate', () => {
  describe('Node.js stack', () => {
    it('generates a valid Dockerfile', () => {
      const result = verifyDockerfileTemplate({
        stack: 'nodejs',
        tarballName: 'codeharness-0.13.2.tgz',
      });

      expect(result).toContain('FROM node:20-slim');
      expect(result).toContain('COPY codeharness-0.13.2.tgz');
      expect(result).toContain('npm install -g');
    });

    it('includes curl and jq', () => {
      const result = verifyDockerfileTemplate({ stack: 'nodejs' });
      expect(result).toContain('curl');
      expect(result).toContain('jq');
    });

    it('includes showboat', () => {
      const result = verifyDockerfileTemplate({ stack: 'nodejs' });
      expect(result).toContain('showboat');
    });

    it('sets OTEL environment variables', () => {
      const result = verifyDockerfileTemplate({ stack: 'nodejs' });
      expect(result).toContain('OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318');
      expect(result).toContain('OTEL_SERVICE_NAME=codeharness-verify');
    });

    it('does NOT reference source code', () => {
      const result = verifyDockerfileTemplate({ stack: 'nodejs' });
      expect(result).not.toContain('COPY src/');
      expect(result).not.toContain('COPY . ');
      expect(result).not.toContain('.git');
      expect(result).not.toContain('node_modules');
    });

    it('uses default tarball name when not specified', () => {
      const result = verifyDockerfileTemplate({ stack: 'nodejs' });
      expect(result).toContain('COPY package.tgz');
    });
  });

  describe('Python stack', () => {
    it('generates a valid Dockerfile', () => {
      const result = verifyDockerfileTemplate({
        stack: 'python',
        distFileName: 'mypackage-0.1.0.tar.gz',
      });

      expect(result).toContain('FROM python:3.12-slim');
      expect(result).toContain('COPY mypackage-0.1.0.tar.gz');
      expect(result).toContain('pip install');
    });

    it('includes curl, jq, and showboat', () => {
      const result = verifyDockerfileTemplate({ stack: 'python' });
      expect(result).toContain('curl');
      expect(result).toContain('jq');
      expect(result).toContain('showboat');
    });

    it('sets OTEL environment variables', () => {
      const result = verifyDockerfileTemplate({ stack: 'python' });
      expect(result).toContain('OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318');
      expect(result).toContain('OTEL_SERVICE_NAME=codeharness-verify');
    });

    it('does NOT reference source code', () => {
      const result = verifyDockerfileTemplate({ stack: 'python' });
      expect(result).not.toContain('COPY src/');
      expect(result).not.toContain('COPY . ');
      expect(result).not.toContain('.git');
    });
  });

  describe('unsupported stack', () => {
    it('throws for unsupported stack', () => {
      expect(() => verifyDockerfileTemplate({ stack: 'rust' })).toThrow('Unsupported stack: rust');
    });
  });

  describe('filename injection protection', () => {
    it('rejects tarball name with newline', () => {
      expect(() => verifyDockerfileTemplate({
        stack: 'nodejs',
        tarballName: 'foo.tgz\nRUN malicious',
      })).toThrow('Unsafe tarball name');
    });

    it('rejects tarball name with shell metacharacters', () => {
      expect(() => verifyDockerfileTemplate({
        stack: 'nodejs',
        tarballName: 'foo.tgz; rm -rf /',
      })).toThrow('Unsafe tarball name');
    });

    it('rejects tarball name with path traversal', () => {
      expect(() => verifyDockerfileTemplate({
        stack: 'nodejs',
        tarballName: '../etc/passwd',
      })).toThrow('Unsafe tarball name');
    });

    it('rejects dist filename with newline', () => {
      expect(() => verifyDockerfileTemplate({
        stack: 'python',
        distFileName: 'pkg.tar.gz\nRUN evil',
      })).toThrow('Unsafe dist filename');
    });

    it('rejects dist filename with shell metacharacters', () => {
      expect(() => verifyDockerfileTemplate({
        stack: 'python',
        distFileName: 'pkg$(evil).tar.gz',
      })).toThrow('Unsafe dist filename');
    });

    it('rejects empty filename', () => {
      expect(() => verifyDockerfileTemplate({
        stack: 'nodejs',
        tarballName: '',
      })).toThrow('Unsafe tarball name');
    });

    it('accepts valid tarball names', () => {
      const result = verifyDockerfileTemplate({
        stack: 'nodejs',
        tarballName: 'my-package-1.2.3.tgz',
      });
      expect(result).toContain('COPY my-package-1.2.3.tgz');
    });

    it('accepts valid dist filenames', () => {
      const result = verifyDockerfileTemplate({
        stack: 'python',
        distFileName: 'mypackage-0.1.0-py3-none-any.whl',
      });
      expect(result).toContain('COPY mypackage-0.1.0-py3-none-any.whl');
    });
  });
});
