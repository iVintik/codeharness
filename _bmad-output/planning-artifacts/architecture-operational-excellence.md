---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - prd-operational-excellence.md
  - architecture-overhaul.md
  - product-brief-operational-excellence-2026-03-19.md
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-03-19'
---

# Architecture Decision Document — Operational Excellence

_Extends the overhaul architecture (architecture-overhaul.md) with observability analysis, audit, and infrastructure validation capabilities._

## Project Context Analysis

### Requirements Overview

28 FRs across 5 capability areas:
- **Observability Static Analysis (FR1-5):** Source scanning, log coverage, gap detection
- **Observability Runtime Validation (FR6-9):** Test telemetry verification, gap detection
- **Observability Coverage Metric (FR10-12):** Metric computation, enforcement, tracking
- **Audit Command (FR13-21):** Comprehensive compliance check, story generation
- **Infrastructure Guidelines (FR22-25):** Dockerfile rules, validation, templates
- **Workflow Enforcement (FR26-28):** Integration with dev/review workflows

### How This Extends the Overhaul Architecture

The overhaul established 5 modules: infra, sprint, verify, dev, review. This sprint adds:
- **New module: `observability/`** — static analysis, runtime validation, coverage metric
- **Expanded module: `audit/`** — replaces onboard, uses observability module + existing checks
- **Extended: `infra/`** — Dockerfile guidelines and validation
- **Extended: `patches/`** — observability enforcement rules for dev/review

### Technical Constraints

- Existing Result<T> pattern applies to all new functions
- Module boundary rules from overhaul apply (index.ts exports only, no circular imports)
- Atomic write pattern for state updates
- <300 line file limit
- Must work with both VictoriaMetrics and OpenSearch backends (ObservabilityBackend interface)

### Research Inputs

Technical research (2026-03-19) established:
- No industry-standard observability coverage metric exists — report static and runtime separately
- Semgrep is the right static analysis tool — YAML rules, `pattern-not-inside` detects absence of logging
- Analyzer interface allows tool flexibility — harness cares about gap report format, not which tool produces it
- Runtime validation matches test coverage paths to telemetry events by module/service, not line-level

## Starter: N/A (Brownfield)

All technology decisions preserved from overhaul architecture. New dependencies: Semgrep (static analysis tool, installed as project dev dependency).

## Core Architectural Decisions

### Decision 1: Static Analysis via Configurable Analyzer (Not Custom AST)

**Decision:** Use Semgrep with custom YAML rules. Do NOT build a custom AST scanner.

**Rationale (from research):**
- Semgrep's `pattern-not-inside` detects the absence of logging — exactly what we need
- YAML rules are editable project files — users customize for their logging library
- 30+ language support — works for TypeScript, Python, and future stacks
- 10-second median CI scan — fast enough for code review integration
- Building a custom AST scanner is high effort, single-language, and we'd be reinventing what Semgrep does

**Interface:**

```typescript
interface AnalyzerResult {
  tool: string;  // 'semgrep' | 'eslint' | 'custom'
  gaps: ObservabilityGap[];
  summary: {
    totalFunctions: number;
    functionsWithLogs: number;
    errorHandlersWithoutLogs: number;
    coveragePercent: number;
    levelDistribution: Record<string, number>;
  };
}

interface ObservabilityGap {
  file: string;
  line: number;
  type: string;  // rule ID from analyzer
  description: string;
  severity: 'error' | 'warning' | 'info';
}
```

**The harness defines the gap report format. Any tool that produces this format works.** Default: Semgrep. Users can configure ESLint, SonarQube, or custom tools.

**Rule storage:** `patches/observability/*.yaml` — Semgrep rule files. Shipped with defaults, users customize per project.

### Decision 2: Separate Metrics, Not Combined

**Decision:** Report static coverage and runtime coverage as separate numbers. No weighted combination.

**Rationale (from research):**
- "Static: 85%, Runtime: 42%" tells you static analysis is mostly passing but telemetry isn't flowing — the problem is in instrumentation setup
- "Combined: 68%" hides that distinction
- Different problems, different fixes — combining them loses diagnostic value

**Metric storage in state:**

```typescript
interface ObservabilityCoverage {
  static: {
    coveragePercent: number;    // functions with logs / total functions
    errorHandlerCoverage: number; // error handlers with logs / total error handlers
    lastScanTimestamp: string;
  };
  runtime: {
    telemetryDetected: boolean;  // any telemetry appeared during test run
    modulesWithTelemetry: number;
    totalModules: number;
    coveragePercent: number;     // modules with telemetry / total modules
    lastValidationTimestamp: string;
  };
  targets: {
    staticTarget: number;   // default 80
    runtimeTarget: number;  // default 60 (lower — harder to achieve)
  };
}
```

### Decision 3: Runtime Validation — Verification IS the Runtime Check

**Decision:** Runtime observability validation happens DURING black-box verification, not as a separate step. Every user interaction with the software during verification must produce at least one log entry in the observability stack.

**Rationale:**
- The verifier already runs commands via `docker exec` — each command IS a user interaction
- The observability stack is already running during verification
- If a `docker exec codeharness init` produces zero logs, that's both a functional concern AND an observability gap
- No separate "runtime validation" step needed — verification validates both functional correctness and observability simultaneously

**Approach:**
1. Verifier runs `docker exec` command for an AC (existing)
2. After each command, verifier queries the observability backend for log events in the time window of that command
3. If zero log events appeared → add observability gap note to the AC proof section
4. Proof document includes both functional evidence AND observability evidence
5. A story with all ACs passing functionally but zero observability can still fail if the observability target isn't met

**Verification prompt update:** The verify-prompt.ts template adds an instruction:
```
After each docker exec command, query the observability endpoint for log events
from the last 30 seconds. If zero events appeared, note this in the AC section as:
[OBSERVABILITY GAP] No log events detected for this user interaction.
```

**Coverage from verification:**
- Runtime coverage = (ACs with at least one log event / total ACs verified) × 100
- This is more meaningful than module-level matching — it directly measures "does user interaction produce logs?"
- Reported alongside static coverage in audit results

**Standalone runtime check (audit mode):**
For projects that want runtime validation outside of verification, `codeharness audit` can also:
1. Run `npm test` with OTLP enabled
2. Query observability backend for events during test window
3. Report module-level coverage: did each module emit any telemetry during tests?
This is the fallback for projects not yet going through full verification.

### Decision 4: Audit Module — Coordinator Pattern

**Decision:** Audit is a coordinator that calls existing modules + new observability module. Not a monolith.

```typescript
// audit/index.ts
export function runAudit(projectDir: string): Result<AuditResult> {
  const observability = observabilityModule.analyze(projectDir);
  const testing = coverageModule.check(projectDir);
  const documentation = docHealth.scan(projectDir);
  const verification = verifyModule.getStatus(projectDir);
  const infrastructure = infraModule.validateDockerfile(projectDir);

  return ok({
    dimensions: { observability, testing, documentation, verification, infrastructure },
    overallStatus: computeOverall(...),
    gapCount: countGaps(...),
  });
}

export function generateFixStories(auditResult: AuditResult): Result<Story[]> {
  // Uses existing epic-generator pattern from onboard
}
```

**`onboard` becomes alias:** Same action handler, different command name. Backward compatible.

### Decision 5: Infrastructure Validation — Rules as Markdown

**Decision:** Dockerfile rules stored in `patches/infra/dockerfile-rules.md`. Validator parses the Dockerfile and checks against rules. Rules are human-readable and editable.

**Rules format:**

```markdown
## Required Elements

1. FROM statement must use a pinned version (not :latest)
2. Project binary must be installed and on PATH
3. Verification tools must be present: showboat, claude, curl, jq
4. No COPY of source directories (src/, lib/, test/)
5. Non-root user for runtime
6. Cache cleanup (apt, npm, pip)

## Project-Type Specific

### Node.js
- node and npm available
- Project installed via tarball (npm pack + npm install -g)

### Python
- python and pip available
- Project installed via wheel or sdist

### Plugin
- claude CLI available with ANTHROPIC_API_KEY
```

**Validator approach:** Parse Dockerfile line by line. Check for required patterns. Report missing as gaps. Simple regex matching — no Docker build required for validation.

### Decision 6: Module Structure

```
src/modules/
├── observability/              # NEW
│   ├── index.ts                # analyze, validateRuntime, getCoverage
│   ├── analyzer.ts             # Runs Semgrep (or configured tool), parses output
│   ├── runtime-validator.ts    # Post-test telemetry check via ObservabilityBackend
│   ├── coverage.ts             # Computes and tracks coverage metrics
│   ├── types.ts                # AnalyzerResult, ObservabilityGap, ObservabilityCoverage
│   └── __tests__/
├── audit/                      # NEW — replaces onboard
│   ├── index.ts                # runAudit, generateFixStories
│   ├── dimensions.ts           # Per-dimension check functions
│   ├── report.ts               # Human-readable + JSON formatting
│   └── __tests__/
├── infra/                      # EXTENDED
│   ├── ...existing...
│   ├── dockerfile-validator.ts # NEW — rule-based Dockerfile checking
│   └── __tests__/
└── ...existing modules unchanged...

patches/
├── observability/              # NEW — Semgrep rules
│   ├── catch-without-logging.yaml
│   ├── function-no-debug-log.yaml
│   └── error-path-no-log.yaml
├── infra/
│   ├── ...existing...
│   └── dockerfile-rules.md     # NEW
├── dev/
│   └── dev-enforcement.md      # UPDATED — add "run Semgrep before commit"
└── review/
    └── review-enforcement.md   # UPDATED — add "check observability gaps"

commands/
├── audit.ts                    # NEW — codeharness audit [--fix] [--json]
├── onboard.ts                  # MODIFIED — becomes alias for audit
└── ...existing unchanged...
```

### Decision 7: Semgrep Integration

**Decision:** Semgrep is a dev dependency, not bundled. The observability module spawns `semgrep` as a subprocess.

```typescript
// observability/analyzer.ts
function runSemgrep(projectDir: string, rulesDir: string): Result<AnalyzerResult> {
  const args = ['scan', '--config', rulesDir, '--json', projectDir];
  const result = execFileSync('semgrep', args, { ... });
  return parseResult(JSON.parse(result));
}
```

**If Semgrep is not installed:** Audit reports "static analysis skipped — install semgrep" as a warning. Not a hard failure. Users who don't want static analysis can skip it.

**Semgrep output → AnalyzerResult mapping:** Semgrep's JSON output includes file, line, rule_id, message, severity. Maps directly to our `ObservabilityGap` interface.

## Implementation Patterns

All patterns from overhaul architecture apply (Result<T>, module boundaries, atomic writes, <300 lines, index.ts exports). Additional:

### Semgrep Rule Pattern

Rules in `patches/observability/` follow Semgrep YAML format. Users can:
- Edit existing rules (change logging function names)
- Add rules (custom patterns for their framework)
- Disable rules (remove the file)

### Audit Dimension Pattern

Each dimension check follows the same signature:

```typescript
function checkDimension(projectDir: string): Result<DimensionResult> {
  // ... check logic ...
  return ok({
    status: 'pass' | 'fail' | 'warn',
    metric: number | string,
    gaps: Gap[],
  });
}
```

Audit coordinator calls all dimensions, collects results, formats report.

## Validation

### FR Coverage

| FR | Module | Decision |
|----|--------|----------|
| FR1-5 | observability/ | Decision 1 (Semgrep), Decision 2 (separate metrics) |
| FR6-9 | observability/ | Decision 3 (module-level matching) |
| FR10-12 | observability/ | Decision 2 (separate metrics, enforcement via hooks) |
| FR13-21 | audit/ | Decision 4 (coordinator pattern) |
| FR22-25 | infra/ | Decision 5 (rules as markdown) |
| FR26-28 | patches/ | Decisions 1, 4 (Semgrep in review, audit in workflows) |

### Gaps: None

All 28 FRs covered. All 9 NFRs addressed by existing patterns (Result<T>, <300 lines, both backends, UX format).

### Readiness: YES

Implementation order:
1. Semgrep rules in `patches/observability/` (no code — just YAML)
2. `observability/analyzer.ts` (run Semgrep, parse output)
3. `observability/coverage.ts` (compute static coverage)
4. `audit/` module (coordinator, replaces onboard)
5. `infra/dockerfile-validator.ts` (rule-based checking)
6. `observability/runtime-validator.ts` (post-test telemetry check)
7. Update patches for dev/review workflows
8. `commands/audit.ts` (CLI command)
