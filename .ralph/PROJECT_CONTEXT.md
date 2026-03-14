# project — Project Context

## Project Goals

codeharness is a Claude Code plugin that combines the BMAD methodology, Ralph's autonomous execution loop, and Harness Engineering into a single tool that makes autonomous coding agents produce software that actually works — not software that passes tests. It replaces bmalph by providing BMAD installation (with harness-aware patches), a vendored Ralph loop (with verification gates), and mechanical enforcement of real-world verification and observability.

Two problems kill autonomous development today. First, agents write code that "passes tests" but breaks when used — UI features that don't render, APIs that return 200 but do nothing, data operations that silently fail. Second, agents are blind to runtime behavior — they can't see logs, traces, or application state, so they guess at fixes instead of diagnosing root causes.

codeharness solves both. It enforces real-world verification — the agent must use what it built (agent-browser for UI, real API calls, DB state inspection) and capture reproducible proof via Showboat. It gives the agent eyes — an ephemeral VictoriaMetrics observability stack with OpenTelemetry instrumentation, so the agent queries logs, traces, and metrics during development. Both are enforced mechanically through Claude Code hooks, not documentation the agent can ignore.

The result: when codeharness says "done," the feature actually works. The user has a Showboat proof document with real screenshots, actual API responses, and confirmed database state — re-runnable by anyone.

## Success Metrics

### User Success

- **Verification trust:** When codeharness marks a story "verified," the feature works when the user tries it. Target: >95% of verified stories hold up under manual spot-check.
- **Happy path verified via real usage:** agent-browser interaction, real API calls with side-effect checks, DB state confirmation — captured in Showboat proof
- **Edge cases verified via automated tests:** Unit tests and E2E tests cover edge cases the AC defines — in addition to real-world verification, not a replacement
- **No manual re-checking needed:** User trusts the Showboat proof document without opening the browser themselves
- **Debug efficiency:** When something fails, the agent has enough visibility (logs, traces, metrics) to identify root cause on first attempt. Target: >70%

### Business Success

- **GitHub stars:** Target: 500+ in first 6 months
- **Plugin installs:** Claude Code marketplace. Target: 100+ active in first 6 months
- **3-month goal:** Creator can produce complex prototypes autonomously with real verification
- **6-month goal:** Public release, community adoption begins
- **12-month goal:** Contributors, integrations with other methodologies, growing ecosystem

### Technical Success

- **Showboat verify pass rate:** `showboat verify` confirms outputs match on re-run. Target: >98%
- **Install-to-first-verification:** Under 15 minutes from `claude plugin install` to first verified task
- **Iteration cycles per story:** Average implement→verify→fix loops before AC pass. Target: <3
- **Sustained autonomous run time:** Agent works without human intervention. Target: >4 hours
- **Observability stack flexibility:** VictoriaMetrics for full projects. Future: OpenSearch, remote logging solutions.
- **Harness overhead:** OTLP instrumentation and verification must not noticeably slow development

### Measurable Outcomes

| Metric | Target | Method |
|--------|--------|--------|
| Verified stories that actually work | >95% | Manual spot-check by user |
| Showboat verify pass rate | >98% | Automated re-run |
| Root cause on first attempt | >70% | Agent debug logs |
| Install to first verification | <15 min | Timed |
| Iterations per story | <3 | Loop counter |
| Sustained autonomous run | >4h | Session duration |
| GitHub stars (6 months) | 500+ | GitHub |
| Plugin installs (6 months) | 100+ | Marketplace |

## Non-Functional Requirements

### Performance

- NFR1: Hook execution (PreToolUse, PostToolUse) must complete within 500ms as measured by hook script timer
- NFR2: VictoriaLogs queries must return results within 2 seconds as measured by curl request round-trip time
- NFR3: `showboat verify` must complete re-run within 5 minutes for a typical story (10-15 verification steps)
- NFR4: VictoriaMetrics Docker stack must start within 30 seconds during `/harness-init`
- NFR5: OTLP auto-instrumentation must add <5% latency overhead to the developed application as measured by load test comparison with and without instrumentation enabled

### Integration

- NFR6: Plugin must coexist with other Claude Code plugins without hook conflicts (detect and warn)
- NFR7: Plugin must work with Claude Code plugin system version as of March 2026
- NFR8: VictoriaMetrics stack must use pinned Docker image versions for reproducibility
- NFR9: agent-browser and Showboat versions must be pinned and tested for compatibility
- NFR10: OTLP instrumentation must work with standard OpenTelemetry SDK versions
- NFR11: Database MCP must support PostgreSQL, MySQL, and SQLite at minimum
- NFR12: BMAD integration must work with BMAD Method v6+ artifact format
- NFR13: Plugin must not modify project source code during `/harness-teardown`

### Reliability

- NFR14: If VictoriaMetrics stack crashes, the harness must detect and report it (not silently fail)
- NFR15: If agent-browser is unavailable, the harness must fall back gracefully (skip UI verification with warning)
- NFR16: Hook failures must produce clear error messages, not silent blocks
- NFR17: State file (`.claude/codeharness.local.md`) must be recoverable if corrupted
- NFR18: BMAD installation via `npx bmad-method init` must complete within 60 seconds
- NFR19: BMAD harness patches must be idempotent — applying patches twice produces the same result
- NFR20: Retrospective report generation must complete within 30 seconds using sprint verification data

### Testing & Coverage

- NFR21: Test suite must complete execution within 5 minutes for per-commit quality gates as measured by test runner wall-clock time
- NFR22: Coverage measurement must include all application source code (excluding test files, configuration, and generated code) as reported by the stack's native coverage tool (c8/istanbul for Node.js, coverage.py for Python)

### Documentation

- NFR23: Doc-gardener subagent must complete a full documentation scan within 60 seconds as measured by subagent execution time
- NFR24: AGENTS.md files must not exceed 100 lines — content beyond that must be in referenced docs (progressive disclosure)
- NFR25: `docs/index.md` must reference BMAD planning artifacts by relative path to `_bmad-output/planning-artifacts/` — never copy content
- NFR26: Doc freshness check must compare file modification timestamps against git log for corresponding source files
- NFR27: Generated documentation (`docs/generated/`, `docs/quality/`) must be clearly marked as auto-generated with "DO NOT EDIT MANUALLY" headers

## Design Guidelines

Foundation

### Design System Choice

**N/A — CLI Plugin (No Visual UI)**

codeharness has no graphical interface. No web frontend, no desktop UI, no mobile app. Traditional design systems (Material Design, Tailwind, etc.) do not apply.

The equivalent for a CLI plugin is an **Output Format System** — consistent patterns for how all terminal output and markdown documents are structured across the entire plugin.

### Rationale for Selection

- **Platform:** Terminal-only. All output is plain text (terminal) or markdown (proof docs, status reports).
- **Team:** Solo developer. No design team. No visual design needed.
- **Brand:** None. Developer tool. Clarity and density over visual identity.
- **Constraints:** Claude Code plugin system. Output is text rendered in the user's terminal with their font/color preferences.

### Implementation Approach

**Terminal Output System:**

All command and hook output follows consistent patterns:

1. **Status lines:** `[OK] Component name — detail` / `[FAIL] Component name — what went wrong`
2. **Section headers:** Bold text (markdown-style) separating logical groups
3. **Actionable hints:** Indented lines starting with `→` showing what to do next
4. **Error format:** What failed → Why it matters → How to fix it (exact command)

**Example — `/harness-init` output:**
```
Harness Init — codeharness v0.1.0

[OK] Stack detected: Node.js (package.json)
[OK] Docker: running
[OK] VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)
[OK] OTLP instrumentation: installed (@opentelemetry/auto-instrumentations-node)
[OK] BMAD: installed (v6.1.0), harness patches applied
[OK] Hooks: 4 registered (session-start, pre-commit, post-write, post-test)
[OK] MCP: agent-browser + postgres configured

Harness ready. Run /harness-run to start autonomous execution.
```

**Example — Hook block message:**
```
[BLOCKED] Commit blocked — story US-003 has no verification proof.

→ Run /harness-verify to verify US-003 acceptance criteria
→ Or run /harness-status to see all pending verifications
```

**Markdown Document System:**

All generated markdown documents (Showboat proofs, status reports) follow:

1. **Frontmatter:** YAML with structured metadata (story ID, timestamp, pass/fail counts)
2. **Summary section:** First section is always a pass/fail summary — scannable without reading the full doc
3. **AC sections:** One `### AC` section per acceptance criterion with evidence blocks
4. **Evidence blocks:** Labeled with type (screenshot, curl output, DB query, log query)

### Customization Strategy

No visual customization needed. The output format system is internal — consistent patterns enforced across all commands, hooks, and generated documents. Customization is limited to:

- **Enforcement level** — configured in `.claude/codeharness.local.md` (which components are active)
- **Proof document template** — `templates/showboat-template.md` defines the structure
- **Hook message templates** — embedded in hook scripts, follow canonical format from architecture doc
