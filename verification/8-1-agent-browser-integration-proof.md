# Story 8.1: Agent-Browser Integration — Verification Proof

**Date:** 2026-03-19
**Verifier:** Claude Opus 4.6 (black-box)
**Container:** codeharness-verify

---

## AC 1: BrowserVerifier class exports with correct methods and return types

BrowserVerifier is an internal class in `src/modules/verify/browser.ts`. It is tree-shaken from the CLI bundle and not exposed via any CLI command.

```bash
docker exec codeharness-verify sh -c 'grep -c "BrowserVerifier" /tmp/codeharness-dist/index.js'
```

```output
0
```

Verdict: **[ESCALATE]** — BrowserVerifier is an internal type, tree-shaken from the compiled JS bundle. Cannot verify class exports, method signatures, or `Result<BrowserActionResult>` return types without source code access.

---

## AC 2: navigate(url) executes docker exec agent-browser navigate

Internal method behavior — requires source code or unit test output to verify.

```bash
docker exec codeharness-verify sh -c 'grep "agent-browser navigate" /tmp/codeharness-dist/index.js || echo "not found in bundle"'
```

```output
not found in bundle
```

Verdict: **[ESCALATE]** — BrowserVerifier.navigate() is an internal method on a tree-shaken class. Cannot verify command construction or return value without source code.

---

## AC 3: screenshot(label) executes docker exec agent-browser screenshot

Internal method behavior — same tree-shaking applies.

```bash
docker exec codeharness-verify sh -c 'grep "agent-browser screenshot" /tmp/codeharness-dist/index.js || echo "not found in bundle"'
```

```output
not found in bundle
```

Verdict: **[ESCALATE]** — BrowserVerifier.screenshot() is tree-shaken from the CLI bundle. Cannot verify command construction or screenshot path logic without source code.

---

## AC 4: Error handling — methods return fail() and never throw

Internal behavior of the BrowserVerifier class.

Verdict: **[ESCALATE]** — Error handling behavior of tree-shaken internal class cannot be verified in a black-box environment. Requires source code review or unit test output.

---

## AC 5: Dockerfile.verify installs agent-browser via npm install -g @anthropic-ai/agent-browser

The Dockerfile in the container does NOT contain an agent-browser install line. The tool registry in the compiled code references `@anthropic/agent-browser` (not `@anthropic-ai/agent-browser`).

```bash
docker exec codeharness-verify sh -c 'grep "agent-browser" /workspace/Dockerfile || echo "not in Dockerfile"'
```

```output
not in Dockerfile
```

```bash
docker exec codeharness-verify sh -c 'sed -n "848,853p" /tmp/codeharness-dist/index.js'
```

```output
    name: "agent-browser",
    displayName: "agent-browser",
    installCommands: [
      { cmd: "npm", args: ["install", "-g", "@anthropic/agent-browser"] }
    ],
    checkCommand: { cmd: "agent-browser", args: ["--version"] },
```

Note: The tool registry uses `@anthropic/agent-browser` but the AC specifies `@anthropic-ai/agent-browser`. The Dockerfile.verify template is not present in the container (only the generic Dockerfile used to build the image is at `/workspace/Dockerfile`). Additionally, `@anthropic-ai/agent-browser` is not yet published on npm.

Verdict: **[ESCALATE]** — The Dockerfile.verify template is not available inside the container for inspection. The tool registry references `@anthropic/agent-browser` (different package name than AC specifies `@anthropic-ai/agent-browser`). Cannot verify the template without source access. Integration testing would require the npm package to be published.

---

## AC 6: Dockerfile.verify.generic installs agent-browser

Same situation as AC 5 — the generic Dockerfile template is not present in the container for inspection.

```bash
docker exec codeharness-verify sh -c 'find / -name "Dockerfile.verify.generic" 2>/dev/null || echo "not found"'
```

```output
not found
```

Verdict: **[ESCALATE]** — Dockerfile.verify.generic template is not available inside the container. Cannot verify its contents without source access. Integration testing would require the npm package to be published.

---

## AC 7: Screenshot paths listed in proof document under ## Screenshots section

The proof document assembly code in the compiled bundle does render a `## Screenshots` section when screenshots are present.

```bash
docker exec codeharness-verify sh -c 'sed -n "3665,3672p" /tmp/codeharness-dist/index.js'
```

```output
  if (config.screenshots && config.screenshots.length > 0) {
    sections.push("## Screenshots");
    sections.push("");
    for (const entry of config.screenshots) {
      sections.push(`- **${entry.label}**: ${entry.path}`);
    }
    sections.push("");
  }
```

The code pushes a `## Screenshots` heading, then iterates over screenshot entries rendering `- **{label}**: {path}` for each. This matches the AC requirement of listing label and relative path.

Verdict: **[PASS]** — Compiled code confirms proof document assembly includes a `## Screenshots` section with label and path for each screenshot entry.

---

## AC 8: diffScreenshots(beforePath, afterPath) returns Result<DiffResult>

Internal method on the tree-shaken BrowserVerifier class.

```bash
docker exec codeharness-verify sh -c 'grep -c "diffScreenshot" /tmp/codeharness-dist/index.js'
```

```output
0
```

Verdict: **[ESCALATE]** — diffScreenshots is an internal method on BrowserVerifier, tree-shaken from the CLI bundle. Cannot verify method signature, return type, or behavior without source code.

---

## AC 9: browser.ts does not exceed 300 lines, all public functions return Result<T>

Source file `src/modules/verify/browser.ts` is not available in the container (tree-shaken from compiled bundle).

Verdict: **[ESCALATE]** — Cannot verify line count or return types of source file without source code access.

---

## AC 10: 100% unit test coverage on browser.ts

Unit test results and coverage data are not available in the black-box container.

Verdict: **[ESCALATE]** — Cannot verify test coverage without running the test suite, which requires the source repository and dev dependencies.

---

## AC 11: verify module index.ts re-exports BrowserVerifier, BrowserActionResult, DiffResult

These types are tree-shaken from the CLI bundle.

```bash
docker exec codeharness-verify sh -c 'grep -c "BrowserVerifier\|BrowserActionResult\|DiffResult" /tmp/codeharness-dist/index.js'
```

```output
0
```

Verdict: **[ESCALATE]** — Internal types are tree-shaken from the compiled CLI bundle. Cannot verify module re-exports without source code.

---

## AC 12: isAvailable() checks agent-browser presence in container

Internal method on the tree-shaken BrowserVerifier class. However, the tool registry does include agent-browser with a checkCommand:

```bash
docker exec codeharness-verify sh -c 'sed -n "853p" /tmp/codeharness-dist/index.js'
```

```output
    checkCommand: { cmd: "agent-browser", args: ["--version"] },
```

The tool registry has a check mechanism, but the specific `isAvailable()` method using `docker exec <container> which agent-browser` cannot be verified as BrowserVerifier is tree-shaken.

Verdict: **[ESCALATE]** — isAvailable() is an internal method on the tree-shaken BrowserVerifier class. Cannot verify its implementation without source code.

---

## Summary

| AC | Verdict | Reason |
|----|---------|--------|
| 1 | ESCALATE | Internal class, tree-shaken from bundle |
| 2 | ESCALATE | Internal method, tree-shaken from bundle |
| 3 | ESCALATE | Internal method, tree-shaken from bundle |
| 4 | ESCALATE | Internal error handling, tree-shaken |
| 5 | ESCALATE | Dockerfile template not in container; package name mismatch |
| 6 | ESCALATE | Dockerfile template not in container |
| 7 | **PASS** | Compiled code confirms ## Screenshots section with label + path |
| 8 | ESCALATE | Internal method, tree-shaken from bundle |
| 9 | ESCALATE | Source file not accessible |
| 10 | ESCALATE | Test suite not available |
| 11 | ESCALATE | Internal types, tree-shaken from bundle |
| 12 | ESCALATE | Internal method, tree-shaken from bundle |

**Overall: 1 PASS, 11 ESCALATE**

All ESCALATE verdicts are due to BrowserVerifier being an internal module that is tree-shaken from the CLI bundle. These ACs require source code access (TypeScript source, unit test results, coverage reports, Dockerfile templates) which are not available in the black-box verification container.

Notable finding: The tool registry references `@anthropic/agent-browser` but the AC specifies `@anthropic-ai/agent-browser` — this package name discrepancy should be investigated.
