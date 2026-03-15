# Onboarding Epic: Bring Project to Harness Compliance

Generated: 2026-03-15T14:02:25Z

## Epic 0: Onboarding

### Story 0.1: Create ARCHITECTURE.md

As a developer, I want an ARCHITECTURE.md documenting the project's architecture.

**Given** no ARCHITECTURE.md exists
**When** the agent analyzes the codebase
**Then** ARCHITECTURE.md is created with module overview and dependencies

### Story 0.2: Create dist/AGENTS.md

As an agent, I want AGENTS.md for dist so I have local context.

**Given** dist has 3 source files and no AGENTS.md
**When** the agent reads the module
**Then** dist/AGENTS.md is created with module purpose and key files

### Story 0.3: Create src/commands/AGENTS.md

As an agent, I want AGENTS.md for src/commands so I have local context.

**Given** src/commands has 13 source files and no AGENTS.md
**When** the agent reads the module
**Then** src/commands/AGENTS.md is created with module purpose and key files

### Story 0.4: Create src/lib/AGENTS.md

As an agent, I want AGENTS.md for src/lib so I have local context.

**Given** src/lib has 20 source files and no AGENTS.md
**When** the agent reads the module
**Then** src/lib/AGENTS.md is created with module purpose and key files

### Story 0.5: Create src/templates/AGENTS.md

As an agent, I want AGENTS.md for src/templates so I have local context.

**Given** src/templates has 5 source files and no AGENTS.md
**When** the agent reads the module
**Then** src/templates/AGENTS.md is created with module purpose and key files

### Story 0.6: Add test coverage for dist

As a developer, I want tests for dist to ensure correctness.

**Given** dist has 0 uncovered files at 0% coverage
**When** the agent writes tests
**Then** dist has 100% test coverage

### Story 0.7: Add test coverage for src/commands

As a developer, I want tests for src/commands to ensure correctness.

**Given** src/commands has 0 uncovered files at 0% coverage
**When** the agent writes tests
**Then** src/commands has 100% test coverage

### Story 0.8: Add test coverage for src/lib

As a developer, I want tests for src/lib to ensure correctness.

**Given** src/lib has 0 uncovered files at 0% coverage
**When** the agent writes tests
**Then** src/lib has 100% test coverage

### Story 0.9: Add test coverage for src/templates

As a developer, I want tests for src/templates to ensure correctness.

**Given** src/templates has 0 uncovered files at 0% coverage
**When** the agent writes tests
**Then** src/templates has 100% test coverage

### Story 0.10: Update stale documentation

As a developer, I want up-to-date documentation reflecting the current codebase.

**Given** the following documents are stale: AGENTS.md, docs/index.md
**When** the agent reviews them against current source
**Then** all stale documents are updated to reflect the current codebase

### Story 0.fc1: Add test coverage for src/commands/query.ts

As a developer, I want tests for src/commands/query.ts to ensure correctness.

**Given** src/commands/query.ts has 72.07% statement coverage (below 80% floor)
**When** the agent writes tests
**Then** src/commands/query.ts reaches at least 80% statement coverage

### Story 0.fc2: Add test coverage for src/commands/stack.ts

As a developer, I want tests for src/commands/stack.ts to ensure correctness.

**Given** src/commands/stack.ts has 79.38% statement coverage (below 80% floor)
**When** the agent writes tests
**Then** src/commands/stack.ts reaches at least 80% statement coverage

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

**Total stories:** 14

Review and approve before execution.
