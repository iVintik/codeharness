# Story 1.2: Core Libraries — State, Stack Detection, Templates — Verification Proof

## AC 1: writeState creates YAML frontmatter with snake_case, native bools/nulls

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac1.mjs << "ENDSCRIPT"
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
const mod = await import("./ch-lib.mjs");
const ac1Dir = "/tmp/ac1-test";
rmSync(ac1Dir, { recursive: true, force: true });
mkdirSync(ac1Dir, { recursive: true });
const state = mod.getDefaultState("nodejs");
mod.writeState(state, ac1Dir);
const content = readFileSync(join(ac1Dir, ".claude", "codeharness.local.md"), "utf-8");
console.log(content);
const yamlSection = content.split("---")[1] || "";
console.log("File exists:", existsSync(join(ac1Dir, ".claude", "codeharness.local.md")));
console.log("Has --- delimiters:", content.startsWith("---"));
console.log("snake_case harness_version:", yamlSection.includes("harness_version"));
console.log("snake_case session_flags:", yamlSection.includes("session_flags"));
console.log("No camelCase:", !/[a-z][A-Z]/.test(yamlSection));
console.log("Native true:", yamlSection.includes("true"));
console.log("Native false:", yamlSection.includes("false"));
console.log("Native null:", yamlSection.includes("null"));
ENDSCRIPT
node dist/test-ac1.mjs'
```

```output
---
harness_version: 0.1.0
initialized: false
stack: nodejs
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 90
  baseline: null
  current: null
  tool: c8
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---

# Codeharness State

This file is managed by the codeharness CLI. Do not edit manually.

File exists: true
Has --- delimiters: true
snake_case harness_version: true
snake_case session_flags: true
No camelCase: true
Native true: true
Native false: true
Native null: true
```

**PASS** — writeState creates `.claude/codeharness.local.md` with YAML frontmatter delimited by `---`, all field names are `snake_case` (harness_version, session_flags, verification_log), booleans are native YAML `true`/`false`, and null values are native YAML `null`.

Note: `enforcement.observability` field is missing from the default state and `coverage.target` defaults to 90 instead of 100 — these are minor deviations from the story's canonical interface definition but do not affect the core AC requirement (YAML format, snake_case, native types).

## AC 2: readState parses YAML and preserves markdown body

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac2.mjs << "ENDSCRIPT"
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
const mod = await import("./ch-lib.mjs");
const ac2Dir = "/tmp/ac2-test";
rmSync(ac2Dir, { recursive: true, force: true });
mkdirSync(join(ac2Dir, ".claude"), { recursive: true });
const testYaml = "---\nharness_version: \"0.1.0\"\ninitialized: true\nstack: nodejs\nenforcement:\n  frontend: true\n  database: true\n  api: true\ncoverage:\n  target: 100\n  baseline: null\n  current: null\n  tool: c8\nsession_flags:\n  logs_queried: false\n  tests_passed: false\n  coverage_met: false\n  verification_run: false\nverification_log: []\n---\n\n# My Custom Body\n\nKeep this text.\n";
writeFileSync(join(ac2Dir, ".claude", "codeharness.local.md"), testYaml, "utf-8");
const readResult = mod.readState(ac2Dir);
console.log("State object:", JSON.stringify(readResult, null, 2));
console.log("initialized is true:", readResult.initialized === true);
console.log("stack is nodejs:", readResult.stack === "nodejs");
console.log("baseline is null:", readResult.coverage.baseline === null);
console.log("tests_passed is false:", readResult.session_flags.tests_passed === false);
const bodyResult = mod.readStateWithBody(ac2Dir);
mod.writeState(readResult, ac2Dir, bodyResult.body);
const after = readFileSync(join(ac2Dir, ".claude", "codeharness.local.md"), "utf-8");
console.log("Round-trip file:");
console.log(after);
console.log("Body preserved:", after.includes("My Custom Body"));
ENDSCRIPT
node dist/test-ac2.mjs'
```

```output
State object: {
  "harness_version": "0.1.0",
  "initialized": true,
  "stack": "nodejs",
  "enforcement": {
    "frontend": true,
    "database": true,
    "api": true
  },
  "coverage": {
    "target": 100,
    "baseline": null,
    "current": null,
    "tool": "c8"
  },
  "session_flags": {
    "logs_queried": false,
    "tests_passed": false,
    "coverage_met": false,
    "verification_run": false
  },
  "verification_log": []
}
initialized is true: true
stack is nodejs: true
baseline is null: true
tests_passed is false: true
Round-trip file:
---
harness_version: 0.1.0
initialized: true
stack: nodejs
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 100
  baseline: null
  current: null
  tool: c8
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---


# My Custom Body

Keep this text.

Body preserved: true
```

**PASS** — readState correctly parses YAML frontmatter into a typed object (booleans as booleans, nulls as null, numbers as numbers). The markdown body ("# My Custom Body / Keep this text.") is preserved after a read-write round-trip via readStateWithBody + writeState.

## AC 3: Corrupted YAML recovery

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac3.mjs << "ENDSCRIPT"
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
const mod = await import("./ch-lib.mjs");
const ac3Dir = "/tmp/ac3-test";
rmSync(ac3Dir, { recursive: true, force: true });
mkdirSync(join(ac3Dir, ".claude"), { recursive: true });
writeFileSync(join(ac3Dir, ".claude", "codeharness.local.md"), "---\n: : : invalid {{{\n---\n", "utf-8");
const recovered = mod.readState(ac3Dir);
console.log("Recovered state:", JSON.stringify(recovered, null, 2));
console.log("Has harness_version:", recovered.harness_version !== undefined);
console.log("File recreated:", existsSync(join(ac3Dir, ".claude", "codeharness.local.md")));
const recreated = readFileSync(join(ac3Dir, ".claude", "codeharness.local.md"), "utf-8");
console.log("Recreated file:");
console.log(recreated);
ENDSCRIPT
node dist/test-ac3.mjs'
```

```output
[WARN] State file corrupted — recreating from detected config
[WARN] No recognized stack detected
Recovered state: {
  "harness_version": "0.1.0",
  "initialized": false,
  "stack": null,
  "enforcement": {
    "frontend": true,
    "database": true,
    "api": true
  },
  "coverage": {
    "target": 90,
    "baseline": null,
    "current": null,
    "tool": "c8"
  },
  "session_flags": {
    "logs_queried": false,
    "tests_passed": false,
    "coverage_met": false,
    "verification_run": false
  },
  "verification_log": []
}
Has harness_version: true
File recreated: true
Recreated file:
---
harness_version: 0.1.0
initialized: false
stack: null
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 90
  baseline: null
  current: null
  tool: c8
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---

# Codeharness State

This file is managed by the codeharness CLI. Do not edit manually.
```

**PASS** — When given corrupted YAML (`---\n: : : invalid {{{\n---`), readState logs exactly `[WARN] State file corrupted — recreating from detected config`, calls detectStack (which logs `[WARN] No recognized stack detected` since /tmp has no indicator files), rebuilds a valid default state, and writes a clean state file.

## AC 4: detectStack returns "nodejs" for package.json

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac4.mjs << "ENDSCRIPT"
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
const mod = await import("./ch-lib.mjs");
const dir = "/tmp/ac4-test";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "package.json"), "{}", "utf-8");
console.log("detectStack:", mod.detectStack(dir));
ENDSCRIPT
node dist/test-ac4.mjs'
```

```output
detectStack: nodejs
```

**PASS** — detectStack returns `"nodejs"` when `package.json` exists in the directory.

## AC 5: detectStack returns "python" for requirements.txt or pyproject.toml

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac5.mjs << "ENDSCRIPT"
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
const mod = await import("./ch-lib.mjs");
const dir5a = "/tmp/ac5a-test";
rmSync(dir5a, { recursive: true, force: true });
mkdirSync(dir5a, { recursive: true });
writeFileSync(join(dir5a, "requirements.txt"), "", "utf-8");
console.log("detectStack(requirements.txt):", mod.detectStack(dir5a));
const dir5b = "/tmp/ac5b-test";
rmSync(dir5b, { recursive: true, force: true });
mkdirSync(dir5b, { recursive: true });
writeFileSync(join(dir5b, "pyproject.toml"), "", "utf-8");
console.log("detectStack(pyproject.toml):", mod.detectStack(dir5b));
ENDSCRIPT
node dist/test-ac5.mjs'
```

```output
detectStack(requirements.txt): python
detectStack(pyproject.toml): python
```

**PASS** — detectStack returns `"python"` for both `requirements.txt` and `pyproject.toml`.

## AC 6: detectStack returns null with warning for no indicators

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac6.mjs << "ENDSCRIPT"
import { mkdirSync, rmSync } from "fs";
const mod = await import("./ch-lib.mjs");
const dir = "/tmp/ac6-test";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const result = mod.detectStack(dir);
console.log("detectStack:", result);
console.log("is null:", result === null);
ENDSCRIPT
node dist/test-ac6.mjs'
```

```output
[WARN] No recognized stack detected
detectStack: null
is null: true
```

**PASS** — detectStack returns `null` and logs `[WARN] No recognized stack detected` when no indicator files are found.

## AC 7: generateFile writes content to target path with parent dirs

```bash
docker exec codeharness-verify bash -c 'cd /usr/local/lib/node_modules/codeharness && cat > dist/test-ac7.mjs << "ENDSCRIPT"
import { readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
const mod = await import("./ch-lib.mjs");
const dir = "/tmp/ac7-test";
rmSync(dir, { recursive: true, force: true });
const targetPath = join(dir, "nested", "dir", "output.txt");
mod.generateFile(targetPath, "Hello World from template");
console.log("File content:", readFileSync(targetPath, "utf-8"));
console.log("File exists:", existsSync(targetPath));
console.log("Parent dirs created:", existsSync(join(dir, "nested", "dir")));
ENDSCRIPT
node dist/test-ac7.mjs'
```

```output
File content: Hello World from template
File exists: true
Parent dirs created: true
```

**PASS** — generateFile writes content to the target path and creates parent directories as needed. Templates are TypeScript string literals (no external file reads — the function takes a content string directly).

Note: The `renderTemplate` function mentioned in the story's dev notes does not exist in the compiled bundle. The generateFile function takes pre-rendered content strings. Template variable interpolation may be handled inline at call sites rather than through a dedicated function. This is a minor implementation detail that doesn't affect the AC requirement.

## AC 8: Unit tests pass with 100% coverage

```bash
docker exec codeharness-verify bash -c 'ls /usr/local/lib/node_modules/codeharness/src/ 2>&1; find /usr/local/lib/node_modules/codeharness -name "*.test.*" 2>&1'
```

```output
ls: cannot access '/usr/local/lib/node_modules/codeharness/src/': No such file or directory
```

**[ESCALATE]** — Cannot verify directly. The installed npm package ships only compiled dist bundles (`dist/index.js`, `dist/chunk-CVXXI3N6.js`). Source files and test files are not included in the published package (standard npm practice). Running `vitest` requires the source repository with `src/lib/__tests__/*.test.ts` files, which are not available in this black-box verification environment.

However, all library behaviors that the unit tests would validate have been functionally verified through ACs 1-7:
- writeState: YAML frontmatter, snake_case, native types (AC1)
- readState: parsing, body preservation (AC2)
- Corruption recovery (AC3)
- detectStack: nodejs (AC4), python (AC5), null with warning (AC6)
- generateFile: file writing with dir creation (AC7)

## Additional CLI Verification: state subcommands

```bash
docker exec codeharness-verify bash -c 'mkdir -p /tmp/cli-test/.claude && cat > /tmp/cli-test/.claude/codeharness.local.md << "END"
---
harness_version: 0.1.0
initialized: true
stack: nodejs
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 100
  baseline: null
  current: null
  tool: c8
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---
END
cd /tmp/cli-test && echo "=== state show ===" && codeharness state show && echo "=== state get ===" && codeharness state get session_flags.tests_passed && echo "=== state set ===" && codeharness state set session_flags.tests_passed true && echo "=== verify set ===" && codeharness state get session_flags.tests_passed'
```

```output
=== state show ===
[INFO] Current state:
harness_version: 0.1.0
initialized: true
stack: nodejs
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 100
  baseline: null
  current: null
  tool: c8
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
=== state get ===
false
=== state set ===
[INFO] Set session_flags.tests_passed = true
=== verify set ===
true
```

**PASS** — CLI state subcommands (show, get, set) work correctly with dot-notation key paths.

```bash
docker exec codeharness-verify bash -c 'cd /tmp && rm -rf no-state-test && mkdir no-state-test && cd no-state-test && codeharness state show 2>&1; echo "EXIT:$?"'
```

```output
[FAIL] No state file found. Run 'codeharness init' first.
EXIT:1
```

**PASS** — Error handling works: shows `[FAIL] No state file found. Run 'codeharness init' first.` and exits with code 1 when no state file exists.

## Summary

| AC | Status | Notes |
|----|--------|-------|
| 1  | PASS   | YAML frontmatter, snake_case, native true/false/null |
| 2  | PASS   | Parses YAML, returns typed object, preserves markdown body |
| 3  | PASS   | Logs exact warning message, recreates from detected state |
| 4  | PASS   | Returns "nodejs" for package.json |
| 5  | PASS   | Returns "python" for requirements.txt and pyproject.toml |
| 6  | PASS   | Returns null, logs "[WARN] No recognized stack detected" |
| 7  | PASS   | Writes file, creates parent dirs, content from string literals |
| 8  | ESCALATE | Source/tests not in npm package; all behaviors verified via ACs 1-7 |

### Minor Deviations Noted

1. `enforcement.observability` field is absent from the default state (story spec includes it)
2. `coverage.target` defaults to 90, not 100 as specified in the story's canonical interface
3. `renderTemplate()` function does not exist in the bundle — template interpolation may be handled differently
