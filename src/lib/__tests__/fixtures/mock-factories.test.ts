import { describe, it, expect, vi } from 'vitest';
import {
  createFsMock,
  createChildProcessMock,
  createDockerMock,
  createStateMock,
  createSprintStateMock,
} from './mock-factories.js';

describe('createFsMock', () => {
  it('returns object with vi.fn() stubs for common fs functions', () => {
    const mock = createFsMock();
    expect(typeof mock.readFileSync).toBe('function');
    expect(typeof mock.writeFileSync).toBe('function');
    expect(typeof mock.existsSync).toBe('function');
    expect(typeof mock.mkdirSync).toBe('function');
    expect(typeof mock.mkdtempSync).toBe('function');
    expect(typeof mock.rmSync).toBe('function');
    expect(typeof mock.readdirSync).toBe('function');
    expect(typeof mock.statSync).toBe('function');
    expect(typeof mock.unlinkSync).toBe('function');
    expect(typeof mock.copyFileSync).toBe('function');
    expect(typeof mock.renameSync).toBe('function');
  });

  it('existsSync defaults to returning true', () => {
    const mock = createFsMock();
    expect(mock.existsSync()).toBe(true);
  });

  it('readdirSync defaults to returning empty array', () => {
    const mock = createFsMock();
    expect(mock.readdirSync()).toEqual([]);
  });

  it('returns a fresh mock on each call', () => {
    const a = createFsMock();
    const b = createFsMock();
    expect(a).not.toBe(b);
    expect(a.readFileSync).not.toBe(b.readFileSync);
  });
});

describe('createChildProcessMock', () => {
  it('returns object with vi.fn() stubs for child_process functions', () => {
    const mock = createChildProcessMock();
    expect(typeof mock.execFileSync).toBe('function');
    expect(typeof mock.execSync).toBe('function');
    expect(typeof mock.spawn).toBe('function');
    expect(typeof mock.exec).toBe('function');
  });

  it('returns a fresh mock on each call', () => {
    const a = createChildProcessMock();
    const b = createChildProcessMock();
    expect(a).not.toBe(b);
  });
});

describe('createDockerMock', () => {
  it('returns object with vi.fn() stubs for docker functions', () => {
    const mock = createDockerMock();
    expect(typeof mock.isDockerAvailable).toBe('function');
    expect(typeof mock.isDockerComposeAvailable).toBe('function');
    expect(typeof mock.isStackRunning).toBe('function');
    expect(typeof mock.startStack).toBe('function');
    expect(typeof mock.stopStack).toBe('function');
    expect(typeof mock.getStackHealth).toBe('function');
    expect(typeof mock.isSharedStackRunning).toBe('function');
    expect(typeof mock.startSharedStack).toBe('function');
    expect(typeof mock.stopSharedStack).toBe('function');
    expect(typeof mock.startCollectorOnly).toBe('function');
    expect(typeof mock.isCollectorRunning).toBe('function');
    expect(typeof mock.stopCollectorOnly).toBe('function');
    expect(typeof mock.getCollectorHealth).toBe('function');
    expect(typeof mock.checkRemoteEndpoint).toBe('function');
    expect(typeof mock.cleanupOrphanedContainers).toBe('function');
    expect(typeof mock.cleanupVerifyEnv).toBe('function');
  });

  it('isDockerAvailable defaults to returning true', () => {
    const mock = createDockerMock();
    expect(mock.isDockerAvailable()).toBe(true);
  });

  it('startStack returns sensible default result', () => {
    const mock = createDockerMock();
    const result = mock.startStack();
    expect(result).toEqual({ started: true, services: [], error: undefined });
  });

  it('returns a fresh mock on each call', () => {
    const a = createDockerMock();
    const b = createDockerMock();
    expect(a).not.toBe(b);
  });
});

describe('createStateMock', () => {
  it('returns object with vi.fn() stubs for HarnessState functions', () => {
    const mock = createStateMock();
    expect(typeof mock.readState).toBe('function');
    expect(typeof mock.writeState).toBe('function');
    expect(typeof mock.readStateWithBody).toBe('function');
    expect(typeof mock.getStatePath).toBe('function');
  });

  it('getStatePath defaults to returning .claude/codeharness.local.md', () => {
    const mock = createStateMock();
    expect(mock.getStatePath()).toBe('.claude/codeharness.local.md');
  });

  it('returns a fresh mock on each call', () => {
    const a = createStateMock();
    const b = createStateMock();
    expect(a).not.toBe(b);
  });
});

describe('createSprintStateMock', () => {
  it('returns object with vi.fn() stubs for SprintState functions', () => {
    const mock = createSprintStateMock();
    expect(typeof mock.getSprintState).toBe('function');
    expect(typeof mock.updateStoryStatus).toBe('function');
    expect(typeof mock.writeStateAtomic).toBe('function');
    expect(typeof mock.computeSprintCounts).toBe('function');
  });

  it('getSprintState defaults to returning success result', () => {
    const mock = createSprintStateMock();
    expect(mock.getSprintState()).toEqual({ success: true, data: undefined });
  });

  it('returns a fresh mock on each call', () => {
    const a = createSprintStateMock();
    const b = createSprintStateMock();
    expect(a).not.toBe(b);
  });
});
