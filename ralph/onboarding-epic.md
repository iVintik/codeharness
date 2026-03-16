# Onboarding Epic: Bring Project to Harness Compliance

Generated: 2026-03-16T18:07:15Z

## Epic 0: Onboarding

### Story 0.1: Add test coverage for src/commands

As a developer, I want tests for src/commands to ensure correctness.

**Given** src/commands has 0 uncovered files at 95.44% coverage
**When** the agent writes tests
**Then** src/commands has 100% test coverage

### Story 0.2: Add test coverage for src/lib

As a developer, I want tests for src/lib to ensure correctness.

**Given** src/lib has 0 uncovered files at 95.44% coverage
**When** the agent writes tests
**Then** src/lib has 100% test coverage

### Story 0.3: Add test coverage for src/templates

As a developer, I want tests for src/templates to ensure correctness.

**Given** src/templates has 0 uncovered files at 95.44% coverage
**When** the agent writes tests
**Then** src/templates has 100% test coverage

### Story 0.4: Update stale documentation

As a developer, I want up-to-date documentation reflecting the current codebase.

**Given** the following documents are stale: README.md, AGENTS.md, ARCHITECTURE.md, docs/index.md
**When** the agent reviews them against current source
**Then** all stale documents are updated to reflect the current codebase

### Story 0.o1: Configure OTLP instrumentation

As a developer, I want observability infrastructure configured so the harness can monitor runtime behavior.

**Given** observability is enabled but OTLP is not configured
**When** onboard runs
**Then** OTLP instrumentation must be configured with endpoint and service name

### Story 0.o2: Start Docker observability stack

As a developer, I want observability infrastructure configured so the harness can monitor runtime behavior.

**Given** observability is enabled but Docker compose file is not configured
**When** onboard runs
**Then** Docker observability stack must be configured and started

---

**Total stories:** 6

Review and approve before execution.
