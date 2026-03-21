# Story 6-3: Create Dockerfile for Containerized Deployment

## Status: backlog

## Description
Create a Dockerfile so the infrastructure audit dimension passes.

## Acceptance Criteria
- [ ] A Dockerfile exists at the project root
- [ ] It builds successfully with `docker build .`
- [ ] `codeharness audit` infrastructure check passes

## Technical Notes
- Scanner flagged: "No Dockerfile found"
- The infrastructure dimension requires a Dockerfile for containerized deployment
- Can use `codeharness` Dockerfile template generation (epic 4) to bootstrap
