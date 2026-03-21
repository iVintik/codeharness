# Story 6-1: Install Semgrep for Static Analysis

## Status: backlog

## Description
Install and configure Semgrep so the observability static analysis dimension passes during audit.

## Acceptance Criteria
- [ ] Semgrep is listed as a dev dependency or documented as a required tool
- [ ] `codeharness audit` observability static analysis check passes
- [ ] CI pipeline includes semgrep in its environment

## Technical Notes
- Scanner flagged: "static analysis skipped -- install semgrep"
- Fix: `pip install semgrep` or add to project tooling
- The observability dimension uses semgrep rules to check for proper instrumentation
