---
stepsCompleted: [1, 2]
---

# Sample Project - Epic Breakdown

## Overview

This is a sample epics file for testing the BMAD parser.

## Epic 1: Foundation

User can set up the project foundation.

### Story 1.1: Project Setup

As a developer,
I want to initialize the project,
So that I can start building features.

**Acceptance Criteria:**

**Given** a developer runs `project init`
**When** the initialization completes
**Then** the project structure is created
**And** configuration files are generated

**Given** a project is already initialized
**When** the developer runs `project init` again
**Then** it is idempotent and does not overwrite existing files

**Technical notes:**
- Use TypeScript for all source files
- Target Node.js 18+

### Story 1.2: Configuration System

As a developer,
I want a configuration system,
So that I can customize project behavior.

**Acceptance Criteria:**

**Given** a config file exists
**When** the system reads it
**Then** all settings are applied correctly

---

## Epic 2: Core Features

User can use core features of the system.

### Story 2.1: Feature Alpha

As a user,
I want feature alpha,
So that I can do alpha things.

**Acceptance Criteria:**

**Given** the system is running
**When** the user activates feature alpha
**Then** alpha functionality is available

**Technical notes:**
- Performance target: <100ms response time

### Story 2.2: Feature Beta

As a user,
I want feature beta,
So that I can do beta things.

**Acceptance Criteria:**

**Given** feature alpha is active
**When** the user activates feature beta
**Then** beta functionality extends alpha

**Given** feature beta encounters an error
**When** the error is recoverable
**Then** the system retries automatically

## Epic 3: Polish

Final polish and cleanup.

### Story 3.1: Story Without ACs

As a developer,
I want to clean up the codebase,
So that it is maintainable.
