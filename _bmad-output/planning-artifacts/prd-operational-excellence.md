---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - product-brief-operational-excellence-2026-03-19.md
  - prd-overhaul.md
  - architecture-overhaul.md
  - ux-design-specification.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 13
workflowType: 'prd'
classification:
  projectType: developer_tool
  domain: general
  complexity: medium-high
  projectContext: brownfield
  designPhilosophy: executable-first
---

# Product Requirements Document - codeharness Operational Excellence

**Author:** BMad
**Date:** 2026-03-19

## Executive Summary

codeharness enforces that autonomous agents produce working software through real-world verification, observability enforcement, and mechanical constraints. The architecture overhaul sprint (23/25 stories done) established the module structure, unified state, and stable sprint execution.

This sprint addresses the gap exposed during self-validation: codeharness can verify that code works, but can't verify that code is *diagnosable*. When something breaks in a project managed by codeharness, is there enough telemetry to find out why? Today the answer is "we don't know" — there's no measurement.

Three capabilities close this gap:

1. **Observability enforcement** — three layers of measurement. Static analysis scans source for log coverage. Runtime validation confirms telemetry flows during test runs. An observability coverage metric (% of code paths with telemetry) gives a trackable number, enforced like test coverage.

2. **`codeharness audit`** — comprehensive compliance check replacing `onboard`. Runs anytime, checks everything (observability, testing, docs, verification, infrastructure), generates fix stories for gaps. `onboard` becomes an alias.

3. **Infrastructure development guidelines** — verification Dockerfile is a project artifact with formalized rules, validated by audit. The agent maintains it during development. Eliminates the recurring "container doesn't have the binary" class of bugs.

### What Makes This Special

- **Observability as a number.** 73% means 27% of error paths are invisible. Like test coverage, but for diagnosability.
- **Continuous compliance.** Not a one-time onboard — audit runs anytime, project is always either compliant or has stories to fix it.
- **Three-layer enforcement.** Static catches missing log statements. Runtime catches silent code paths. Coverage metric tracks it over time.

## Project Classification

- **Project Type:** Developer tool — npm CLI + Claude Code plugin (brownfield)
- **Domain:** General software development tooling
- **Complexity:** Medium-High
- **Context:** Extends existing codeharness with new audit and observability capabilities

## Success Criteria

### User Success

- **Observability has a number.** Every project gets an observability coverage % from `codeharness audit`.
- **Audit is instant.** `codeharness audit` returns full compliance report in <30 seconds.
- **Gaps become stories.** `codeharness audit --fix` generates implementable stories for every gap.
- **Infrastructure stays correct.** Zero "container missing binary" failures when Dockerfile is a maintained project artifact.

### Technical Success

- **Static analysis detects missing logs.** Scans source, flags error handlers without log statements, flags functions without entry logging at debug level.
- **Runtime validation confirms data flows.** After test runs, telemetry exists in Victoria/OpenSearch for exercised code paths.
- **Coverage metric is accurate.** Observability coverage % correlates with actual diagnosability.

### Measurable Outcomes

| Metric | Target |
|--------|--------|
| Observability coverage metric exists | Yes — every audit produces a % |
| Audit covers all dimensions | Observability + testing + docs + verification + infra |
| Audit runtime | <30 seconds |
| Audit --fix generates stories | Stories with ACs for each gap |
| Infrastructure audit catches Dockerfile drift | Before verification fails |
| Static analysis flags per code review | Missing logs flagged during review |

## Product Scope

### MVP

1. Observability static analysis (scan, count, coverage %)
2. Observability runtime validation (test run → telemetry check)
3. Observability coverage metric (configurable target, hook enforcement)
4. `codeharness audit` command (replaces onboard, all dimensions)
5. Infrastructure guidelines & Dockerfile validation
6. Observability enforcement in dev/review workflows

### Out of Scope

- Custom observability backends beyond Victoria*/OpenSearch
- APM dashboards
- Log aggregation or alerting rules
- Distributed tracing visualization

## Functional Requirements

### Observability Static Analysis

- **FR1:** System can scan project source files and count log/trace/metric statements per function.
- **FR2:** System can identify error handlers (catch blocks, error callbacks) without log statements and flag them as observability gaps.
- **FR3:** System can classify log statements by level (debug, info, warn, error) and report the distribution.
- **FR4:** System can compute observability coverage as: (functions with at least one log statement / total functions) × 100.
- **FR5:** System supports configurable observability coverage target (default 80%).

### Observability Runtime Validation

- **FR6:** During black-box verification, verifier queries observability backend after each `docker exec` command to check if log events were emitted.
- **FR7:** If a user interaction (docker exec command) produces zero log events, verifier flags it as `[OBSERVABILITY GAP]` in the proof document.
- **FR8:** Runtime observability coverage = (ACs with at least one log event / total ACs verified) × 100. Reported in proof and audit.
- **FR9:** For standalone runtime check (outside verification), system can run tests with OTLP enabled and query backend for module-level telemetry.

### Observability Coverage Metric

- **FR10:** System reports static coverage and runtime coverage as separate numbers — not combined.
- **FR11:** System enforces observability coverage target via hooks — blocks commits below target.
- **FR12:** System tracks observability coverage trend over time in state file.

### Audit Command

- **FR13:** Operator can run `codeharness audit` to get a full compliance report covering: observability, testing, documentation, verification, infrastructure.
- **FR14:** Each audit dimension produces a status (pass/fail/warn) and a metric (% or grade).
- **FR15:** Operator can run `codeharness audit --fix` to generate epics/stories for all gaps found.
- **FR16:** `onboard` command becomes an alias for `audit` — same functionality, backward compatible.
- **FR17:** Audit checks verification Dockerfile exists, builds successfully, and contains required tools.
- **FR18:** Audit checks Docker observability stack health (shared or remote).
- **FR19:** Audit checks test coverage meets project target.
- **FR20:** Audit checks documentation freshness (AGENTS.md, README, exec-plans).
- **FR21:** Audit reports all results in a single structured output (human-readable and --json).

### Infrastructure Guidelines & Validation

- **FR22:** System provides a Dockerfile template as a starting point based on detected project type.
- **FR23:** System defines formalized rules for verification Dockerfiles: must include project binary, verification tools, no source code, proper cleanup.
- **FR24:** Audit validates the project's Dockerfile against the formalized rules and reports non-compliance.
- **FR25:** When a story adds new dependencies, the dev workflow prompts the agent to update the Dockerfile.

### Observability Enforcement in Workflows

- **FR26:** During code review, static analysis results are included — missing log statements flagged as review issues.
- **FR27:** During verification, runtime validation runs — observability gaps reported in proof document.
- **FR28:** Patches for dev and review workflows updated with observability enforcement rules.

## Non-Functional Requirements

- **NFR1:** Audit completes in <30 seconds for projects up to 100K lines of code.
- **NFR2:** Static analysis supports Node.js/TypeScript and Python source files.
- **NFR3:** Runtime validation works with both VictoriaMetrics and OpenSearch backends.
- **NFR4:** Observability coverage metric is stored in state file alongside test coverage.
- **NFR5:** Audit output follows the UX spec format (structured sections, status prefixes, actionable remedies).
- **NFR6:** Generated stories from `audit --fix` follow the BMAD story format with Given/When/Then ACs.
- **NFR7:** Infrastructure guidelines are stored as markdown in `patches/infra/` — editable without rebuilding.
- **NFR8:** All new code has 100% test coverage.
- **NFR9:** No source file exceeds 300 lines.
