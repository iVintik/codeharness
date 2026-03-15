# Onboarding Epic: Bring Project to Harness Compliance

Generated: 2026-03-14T18:17:49Z

### Story O.1: Create ARCHITECTURE.md

As a developer, I want an ARCHITECTURE.md documenting the project's architecture.

**Given** no ARCHITECTURE.md exists
**When** the agent analyzes the codebase
**Then** ARCHITECTURE.md is created with module overview and dependencies

### Story O.2: Create ralph/lib/AGENTS.md

As an agent, I want AGENTS.md for ralph/lib so I have local context.

**Given** ralph/lib has 3 source files and no AGENTS.md
**When** the agent reads the module
**Then** ralph/lib/AGENTS.md is created with module purpose and key files

### Story O.3: Create hooks/AGENTS.md

As an agent, I want AGENTS.md for hooks so I have local context.

**Given** hooks has 4 source files and no AGENTS.md
**When** the agent reads the module
**Then** hooks/AGENTS.md is created with module purpose and key files

### Story O.4: Add test coverage for ralph

As a developer, I want tests for ralph to ensure correctness.

**Given** ralph has 10 source files with no tests
**When** the agent writes tests
**Then** ralph has 100% test coverage

### Story O.5: Add test coverage for ralph/drivers

As a developer, I want tests for ralph/drivers to ensure correctness.

**Given** ralph/drivers has 1 source files with no tests
**When** the agent writes tests
**Then** ralph/drivers has 100% test coverage

### Story O.6: Add test coverage for ralph/lib

As a developer, I want tests for ralph/lib to ensure correctness.

**Given** ralph/lib has 3 source files with no tests
**When** the agent writes tests
**Then** ralph/lib has 100% test coverage

### Story O.7: Add test coverage for hooks

As a developer, I want tests for hooks to ensure correctness.

**Given** hooks has 4 source files with no tests
**When** the agent writes tests
**Then** hooks has 100% test coverage

---

**Total stories:** 7

Review and approve before execution.
