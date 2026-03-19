---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - product-brief-codeharness-arch-overhaul-2026-03-17.md
  - prd-overhaul.md
  - architecture-overhaul.md
  - ux-design-specification.md
date: 2026-03-19
author: BMad
---

# Product Brief: codeharness — Operational Excellence

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

codeharness enforces that autonomous agents produce working software. But "working" isn't just "tests pass" — it's "when something goes wrong, you can find out why in under 5 minutes." That requires observability in the target project. Not installing packages — proving that every code path emits enough telemetry to diagnose failures.

This sprint adds three capabilities:

1. **Observability enforcement for target projects** — static analysis (are log statements present?), runtime validation (does telemetry flow when tests run?), and an observability coverage metric (% of code paths with telemetry). The harness treats missing observability like missing test coverage — a defect.

2. **`codeharness audit`** — comprehensive compliance check that runs anytime. Covers observability, testing, documentation, verification, infrastructure. Generates epics/stories for gaps. Replaces `onboard` (which becomes an alias).

3. **Formalized infrastructure development** — Dockerfile for verification is a developed project artifact following harness guidelines, not a template stamped out and forgotten. Audited for compliance. Maintained as part of story development.

---

## Core Vision

### Problem Statement

The harness says "observability is mandatory" but can't answer: "does this project have enough logging to debug a production issue?" It installs OTLP packages and starts a Victoria stack, then hopes the developer added log statements. There's no measurement, no enforcement, no feedback loop.

Three gaps:

1. **No observability measurement.** Test coverage has a number (95%). Documentation has a grade. Observability has nothing. You can't enforce what you can't measure.

2. **No continuous compliance.** `codeharness onboard` runs once during setup. After that, the project drifts — tests get skipped, docs go stale, observability degrades. There's no "run the full health check again" command.

3. **No infrastructure ownership.** The verification Dockerfile was a template in the npm package — nobody owned it, nobody updated it when the project changed, it broke 9 times in one sprint. Infrastructure must be a developed project artifact with audit validation.

### Proposed Solution

**Observability enforcement through three layers:**

| Layer | What it checks | When it runs |
|-------|---------------|-------------|
| **Static analysis** | Log statements in error handlers, key functions have entry/exit logging, log levels are appropriate | During code review, as part of audit |
| **Runtime validation** | Tests emit telemetry to Victoria/OpenSearch. Code paths exercised by tests produce logs/traces/metrics | After test runs, during verification |
| **Coverage metric** | % of code paths that emit at least one telemetry event when exercised. Target: configurable, default 80% | Reported by `codeharness audit`, enforced by hooks |

**`codeharness audit` as the universal compliance check:**

Replaces `onboard`. Runs anytime — first time or hundredth time. Checks:
- Observability coverage (static + runtime)
- Test coverage
- Documentation freshness
- Verification status
- Infrastructure compliance (Dockerfile, Docker stack)
- Hook health

When gaps are found: `codeharness audit --fix` generates stories to fix them.

`onboard` becomes an alias for `audit` — same command, backward compatible.

**Infrastructure as a development practice:**

The Dockerfile for verification is part of the project's codebase — authored, committed, evolved:
- **Guidelines** define what it must include (project binary, verification tools, no source code)
- **A template** provides a starting point based on project type
- **Audit validates** the Dockerfile against guidelines and reports gaps
- **Development responsibility** — the agent writes and maintains the Dockerfile as part of story development, same as any other code

When a new dependency is added, the Dockerfile is updated as part of that story. The harness doesn't magically fix it — the harness enforces that the developer keeps it correct.

### Key Differentiators

- **Observability as a measurable metric.** Like test coverage but for telemetry. 73% observability coverage means 27% of your error paths are invisible.
- **Continuous compliance, not one-time onboard.** `codeharness audit` runs anytime. The project is always either compliant or has stories to fix it.
- **Infrastructure is developed, not generated.** Follows guidelines, validated by audit. Eliminates the "container doesn't have the binary" class of bugs.
- **Three-layer observability** — static analysis catches missing log statements, runtime validation catches silent code paths, coverage metric gives a number to track over time.

## Target Users

Same primary user as the overhaul brief: the developer running codeharness on their project.

**Audit check:** Runs `codeharness audit` anytime to see full project health — observability, testing, docs, verification, infrastructure. Single report with a number for each dimension and actionable gaps.

**Observability-aware development:** During story development, the agent adds appropriate logging. During code review, static analysis flags missing log statements. During verification, runtime validation checks telemetry flows. Observability is enforced like test coverage — not a separate concern.

## Success Metrics

- **Observability coverage metric exists and is measurable.** Every project has a number (e.g., 73%). Not "observability is configured" but "73% of code paths emit telemetry."
- **Audit runs in <30 seconds** and covers all dimensions: observability, testing, docs, verification, infrastructure.
- **Audit --fix generates actionable stories** that close the gaps. Run audit → fix → re-audit → compliant.
- **Zero "container doesn't have the binary" failures.** Infrastructure is a project artifact, audited, maintained by the agent during development.
- **Static analysis catches missing logs during code review.** Before code ships, not after deployment.
- **Runtime validation confirms telemetry flows during test runs.** If tests exercise a code path and no telemetry appears, that's a gap.

## MVP Scope

### Core Features

1. **Observability static analysis** — scan project source for log coverage. Count log statements per function/error handler. Report observability coverage %. Flag missing log statements at appropriate levels.

2. **Observability runtime validation** — after test runs, query Victoria/OpenSearch for telemetry. Compare exercised code paths (from test coverage) with telemetry events. Report gaps where code ran but no telemetry appeared.

3. **Observability coverage metric** — % of code paths with telemetry. Configurable target (default 80%). Reported by audit, enforced by hooks.

4. **`codeharness audit` command** — replaces `onboard`. Checks observability, testing, documentation, verification, infrastructure. Runs anytime. `--fix` generates stories for gaps. `onboard` becomes alias.

5. **Infrastructure guidelines & validation** — formalized rules for verification Dockerfile. Template as starting point. Audit validates compliance. Agent maintains Dockerfile during development.

6. **Observability enforcement in dev/review workflows** — static analysis runs during code review. Missing log statements flagged as review issues. Patches updated with observability requirements.

### Out of Scope

- Custom observability backends beyond Victoria*/OpenSearch (already supported)
- Application performance monitoring (APM) dashboards
- Log aggregation or alerting rules
- Distributed tracing visualization
