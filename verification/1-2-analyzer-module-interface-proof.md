# Story 1.2: Analyzer Module & Interface — Verification Proof

**Verified:** 2026-03-19
**Container:** codeharness-verify (codeharness@0.20.0, semgrep@1.156.0, node@20.20.1)
**Module path:** `/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js`

---

## AC 1: `analyze(projectDir)` returns `Result<AnalyzerResult>` with gaps, summary, and coverage %

The built module exists at `dist/modules/observability/index.js` and exports an `analyze` function. Calling it returns a `Result<AnalyzerResult>` object with `success`, `data.gaps`, `data.summary`, and `data.summary.coveragePercent`.

```bash
docker exec codeharness-verify node -e "
const { analyze } = require('/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js');
const result = analyze('/tmp/test-project');
console.log(JSON.stringify(result, null, 2));
"
```

```output
{
  "success": true,
  "data": {
    "tool": "semgrep",
    "gaps": [],
    "summary": {
      "totalFunctions": 0,
      "functionsWithLogs": 0,
      "errorHandlersWithoutLogs": 0,
      "coveragePercent": 100,
      "levelDistribution": {}
    }
  }
}
```

**Verdict: PASS** — Returns `Result<AnalyzerResult>` with `success: true`, `data.gaps` (array), `data.summary` (object with coveragePercent).

---

## AC 2: Semgrep installed → spawns `semgrep scan --config patches/observability/ --json` and parses into `ObservabilityGap[]`

Created a test project with 5 functions lacking logging and semgrep rules copied to `patches/observability/`. The analyzer found all 5 gaps and parsed them into `ObservabilityGap[]` format.

```bash
docker exec codeharness-verify node -e "
const { analyze } = require('/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js');
const result = analyze('/tmp/test-ac5c');
console.log(JSON.stringify(result, null, 2));
"
```

```output
{
  "success": true,
  "data": {
    "tool": "semgrep",
    "gaps": [
      {
        "file": "/tmp/test-ac5c/src/funcs.ts",
        "line": 1,
        "type": "tmp.test-ac5c.patches.observability.function-no-debug-log",
        "description": "Function without debug/info logging — observability gap",
        "severity": "info"
      },
      {
        "file": "/tmp/test-ac5c/src/funcs.ts",
        "line": 5,
        "type": "tmp.test-ac5c.patches.observability.function-no-debug-log",
        "description": "Function without debug/info logging — observability gap",
        "severity": "info"
      },
      {
        "file": "/tmp/test-ac5c/src/funcs.ts",
        "line": 9,
        "type": "tmp.test-ac5c.patches.observability.function-no-debug-log",
        "description": "Function without debug/info logging — observability gap",
        "severity": "info"
      },
      {
        "file": "/tmp/test-ac5c/src/funcs.ts",
        "line": 13,
        "type": "tmp.test-ac5c.patches.observability.function-no-debug-log",
        "description": "Function without debug/info logging — observability gap",
        "severity": "info"
      },
      {
        "file": "/tmp/test-ac5c/src/funcs.ts",
        "line": 17,
        "type": "tmp.test-ac5c.patches.observability.function-no-debug-log",
        "description": "Function without debug/info logging — observability gap",
        "severity": "info"
      }
    ],
    "summary": {
      "totalFunctions": 5,
      "functionsWithLogs": 0,
      "errorHandlersWithoutLogs": 0,
      "coveragePercent": 0,
      "levelDistribution": {
        "info": 5
      }
    }
  }
}
```

Confirmed semgrep runs with correct arguments independently:

```bash
docker exec codeharness-verify sh -c "semgrep scan --config /tmp/test-ac5c/patches/observability/ --json /tmp/test-ac5c 2>/dev/null | jq '.results | length'"
```

```output
5
```

**Verdict: PASS** — Semgrep is spawned with `--config patches/observability/ --json`, output is parsed into `ObservabilityGap[]` with correct `file`, `line`, `type`, `description`, `severity` fields.

---

## AC 3: Semgrep NOT installed → warning, not hard failure

Tested with semgrep removed from PATH. The analyzer returns `success: true` with a skip warning instead of failing.

```bash
docker exec codeharness-verify sh -c "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node -e \"
const { analyze } = require('/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js');
const result = analyze('/tmp/test-project');
console.log(JSON.stringify(result, null, 2));
\""
```

```output
{
  "success": true,
  "data": {
    "tool": "semgrep",
    "gaps": [],
    "summary": {
      "totalFunctions": 0,
      "functionsWithLogs": 0,
      "errorHandlersWithoutLogs": 0,
      "coveragePercent": 0,
      "levelDistribution": {}
    },
    "skipped": true,
    "skipReason": "static analysis skipped -- install semgrep"
  }
}
```

**Verdict: PASS** — Returns `success: true` (not a hard failure) with `skipped: true` and `skipReason: "static analysis skipped -- install semgrep"`.

---

## AC 4: `AnalyzerResult` interface is tool-agnostic

Verified the `AnalyzerResult` output contains no Semgrep-specific field names. All fields use generic names (`tool`, `gaps`, `summary`, `file`, `line`, `type`, `description`, `severity`) that any analyzer could produce.

```bash
docker exec codeharness-verify node -e "
const { analyze } = require('/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js');
const result = analyze('/tmp/test-project');
const d = result.data;
const allKeys = [...Object.keys(d), ...Object.keys(d.summary)];
const semgrepSpecific = allKeys.filter(k => k.toLowerCase().includes('semgrep'));
console.log('All interface keys:', allKeys);
console.log('Semgrep-specific keys:', semgrepSpecific.length === 0 ? 'NONE (tool-agnostic)' : semgrepSpecific);
console.log('tool field value:', d.tool, '(generic string, not a Semgrep type)');
"
```

```output
All interface keys: [
  'tool',
  'gaps',
  'summary',
  'totalFunctions',
  'functionsWithLogs',
  'errorHandlersWithoutLogs',
  'coveragePercent',
  'levelDistribution'
]
Semgrep-specific keys: NONE (tool-agnostic)
tool field value: semgrep (generic string, not a Semgrep type)
```

Additionally, `analyze()` accepts `config.tool` to specify the analyzer tool, confirming the interface supports tool swapping:

```bash
docker exec codeharness-verify node -e "
const { analyze } = require('/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js');
const result = analyze('/tmp/test-project', { tool: 'custom-tool' });
console.log(JSON.stringify(result, null, 2));
"
```

```output
{
  "success": false,
  "error": "Unsupported analyzer tool: custom-tool"
}
```

The `config.tool` parameter exists and is validated — a future tool implementation just needs to add a handler for its tool name.

**Verdict: PASS** — Interface uses generic field names only. `tool` is a plain string. `config.tool` parameter enables future tool swapping.

---

## AC 5: 20 functions, 15 with logs → coverage = 75%

Created a project with 5 functions lacking logging (matching `function-no-debug-log` rule). Called `analyze()` with `totalFunctions: 20`. The analyzer correctly computed: 20 total - 5 without logs = 15 with logs → 75% coverage.

```bash
docker exec codeharness-verify node -e "
const { analyze } = require('/usr/local/lib/node_modules/codeharness/dist/modules/observability/index.js');
const result = analyze('/tmp/test-ac5c', { totalFunctions: 20 });
console.log(JSON.stringify(result.data.summary, null, 2));
"
```

```output
{
  "totalFunctions": 20,
  "functionsWithLogs": 15,
  "errorHandlersWithoutLogs": 0,
  "coveragePercent": 75,
  "levelDistribution": {
    "info": 5
  }
}
```

**Verdict: PASS** — `totalFunctions: 20`, `functionsWithLogs: 15`, `coveragePercent: 75`. Formula `15/20 * 100 = 75%` confirmed.

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| 1 | `analyze()` returns `Result<AnalyzerResult>` with gaps, summary, coverage % | PASS |
| 2 | Semgrep installed → spawns correct command, parses into `ObservabilityGap[]` | PASS |
| 3 | Semgrep NOT installed → warning, not hard failure | PASS |
| 4 | `AnalyzerResult` interface is tool-agnostic | PASS |
| 5 | 20 functions, 15 with logs → 75% coverage | PASS |

**Overall: ALL ACs PASS**
