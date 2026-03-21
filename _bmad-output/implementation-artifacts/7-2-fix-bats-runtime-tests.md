# Story 6-2: Fix BATS Runtime Test Infrastructure

## Status: backlog

## Description
Ensure BATS (Bash Automated Testing System) is available so the observability runtime validation passes during audit.

## Acceptance Criteria
- [ ] BATS is installed and available on PATH
- [ ] `npm test` runs without "bats: command not found" error
- [ ] `codeharness audit` observability runtime check passes

## Technical Notes
- Scanner flagged: "Runtime validation failed: sh: bats: command not found"
- Fix: Install bats-core (`brew install bats-core` on macOS)
- CI pipeline needs bats in its environment
