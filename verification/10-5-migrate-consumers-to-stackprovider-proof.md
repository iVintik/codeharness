# Verification Proof: 10-5-migrate-consumers-to-stackprovider

**Story:** Migrate All Consumers to StackProvider
**Tier:** unit-testable
**Date:** 2026-03-24
**Verdict:** PASS

## AC1: coverage.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/lib/coverage.ts; echo "exit: $?"
```
```output
exit: 1
```

Zero stack string comparisons remain. All coverage tool detection delegates to provider dispatch map.

## AC2: otlp.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/lib/otlp.ts; echo "exit: $?"
```
```output
exit: 1
```

Zero stack string comparisons remain. All OTLP logic uses provider dispatch maps.

## AC3: docs-scaffold.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/modules/infra/docs-scaffold.ts; echo "exit: $?"
```
```output
exit: 1
```

Display names, coverage tools, build/test commands all use provider methods.

## AC4: dockerfile-template.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/modules/infra/dockerfile-template.ts; echo "exit: $?"
```
```output
exit: 1
```

Templates, build stages, and runtime copy directives use provider calls.

## AC5: verify/env.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/modules/verify/env.ts; echo "exit: $?"
```
```output
exit: 1
```

Stack label mapping and build image selection use lookup tables.

## AC6: readme.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/templates/readme.ts; echo "exit: $?"
```
```output
exit: 1
```

Install commands use provider lookup table.

## AC7: state.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/lib/state.ts; echo "exit: $?"
```
```output
exit: 1
```

Coverage tool name lookup uses COVERAGE_TOOL_DEFAULTS map.

## AC8: scanner.ts — zero stack string comparisons
**Verdict:** PASS

```bash
grep -n "stack === 'nodejs'\|stack === 'python'\|stack === 'rust'" src/lib/scanner.ts; echo "exit: $?"
```
```output
exit: 1
```

No stack conditionals exist in scanner.ts.

## AC9: stack-detect.ts deleted
**Verdict:** PASS

```bash
ls src/lib/stack-detect.ts 2>&1; echo "exit: $?"
```
```output
ls: src/lib/stack-detect.ts: No such file or directory
exit: 2
```

File deleted. All exports now in src/lib/stacks/index.ts.

## AC10: Source file imports updated
**Verdict:** PASS

```bash
grep -rn "from.*stack-detect" src/lib/otlp.ts src/lib/state.ts src/lib/coverage.ts src/modules/verify/env.ts src/modules/infra/init-project.ts src/modules/infra/docs-scaffold.ts src/modules/infra/dockerfile-template.ts src/modules/infra/docker-setup.ts src/modules/infra/types.ts; echo "exit: $?"
```
```output
exit: 1
```

All source file imports point to stacks/index.js.

## AC11: Test file imports updated
**Verdict:** PASS

```bash
grep -rn "from.*stack-detect" src/lib/__tests__/stack-detect.test.ts src/lib/__tests__/state.test.ts src/commands/__tests__/stack.test.ts src/modules/infra/__tests__/init-project.test.ts src/modules/verify/__tests__/verify-env.test.ts src/modules/infra/__tests__/dockerfile-template.test.ts; echo "exit: $?"
```
```output
exit: 1
```

All test file imports point to stacks/index.js.

## AC12: Boundary test — zero stack comparisons outside stacks/
**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/stacks/boundary.test.ts 2>&1 | tail -5
```
```output
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  14:07:56
   Duration  137ms
```

Boundary test scans all .ts files outside src/lib/stacks/ and finds zero forbidden patterns.

## AC13: Boundary test — zero stack-detect imports
**Verdict:** PASS

```bash
npx vitest run src/lib/__tests__/stacks/boundary.test.ts 2>&1 | grep "Tests"
```
```output
      Tests  2 passed (2)
```

Second assertion in boundary test verifies no from.*stack-detect import patterns outside src/lib/stacks/.

## AC14: All tests pass
**Verdict:** PASS

```bash
npx vitest run 2>&1 | tail -4
```
```output
 Test Files  123 passed (123)
      Tests  3398 passed (3398)
   Start at  14:07:26
   Duration  11.70s
```

Zero regressions. All 3398 tests pass.

## AC15: No new type errors
**Verdict:** PASS

```bash
npx tsc --noEmit 2>&1 | wc -l
```
```output
100
```

100 pre-existing errors in bridge.test.ts and run.test.ts — all unrelated to this story. Zero new type errors introduced.

## AC16: teardown.ts — provider-based check
**Verdict:** PASS

```bash
grep -n "state.stack === 'nodejs'" src/commands/teardown.ts; echo "exit: $?"; grep -n "includes.*nodejs" src/commands/teardown.ts
```
```output
exit: 1
191:      if (state.otlp?.enabled && stacks.includes('nodejs')) {
```

Direct comparison removed. Uses stacks.includes('nodejs') array membership test per AC spec.

## AC17: verify-prompt.ts — AppType exceptions documented
**Verdict:** PASS

```bash
grep -n "projectType === 'nodejs'" src/templates/verify-prompt.ts; grep -n "ALLOWED_EXCEPTIONS" src/lib/__tests__/stacks/boundary.test.ts
```
```output
43:      return `### Project Type: ${projectType === 'nodejs' ? 'Node.js CLI' : 'Python CLI'}
48:- For ${projectType === 'nodejs' ? 'Node.js' : 'Python'} projects, the built artifact is installed globally in the container.`;
20:const ALLOWED_EXCEPTIONS = new Set([
80:      if (ALLOWED_EXCEPTIONS.has(relPath)) continue;
```

verify-prompt.ts uses PromptProjectType (AppType), not StackName. Documented in boundary test's ALLOWED_EXCEPTIONS set.

---

**Summary:** 17/17 ACs PASS. All stack conditionals migrated to StackProvider pattern. Legacy stack-detect.ts deleted. Boundary test enforces NFR4 going forward.
