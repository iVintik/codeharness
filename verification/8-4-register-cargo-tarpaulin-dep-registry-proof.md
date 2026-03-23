# Story 8.4: Register cargo-tarpaulin in dependency registry — Verification Proof

**Verified by:** Claude Opus 4.6 (black-box verifier)
**Date:** 2026-03-23
**Container:** codeharness-verify
**CLI version:** 0.23.1

---

## AC1: Registry contains cargo-tarpaulin with correct spec

**Criteria:** Given the dependency registry, when inspected for `cargo-tarpaulin`, then it has `critical: false`, install command `cargo install cargo-tarpaulin`, and check command `cargo tarpaulin --version`.

**Method:** Inspected the bundled DEPENDENCY_REGISTRY in the installed CLI artifact.

```bash
docker exec codeharness-verify sed -n '933,945p' /usr/local/lib/node_modules/codeharness/dist/index.js
```

```output
  },
  {
    name: "cargo-tarpaulin",
    displayName: "cargo-tarpaulin",
    installCommands: [{ cmd: "cargo", args: ["install", "cargo-tarpaulin"] }],
    checkCommand: { cmd: "cargo", args: ["tarpaulin", "--version"] },
    critical: false
  }
];
```

**Verdict: PASS**
- `critical: false` — confirmed
- `installCommands`: `cargo install cargo-tarpaulin` — confirmed
- `checkCommand`: `cargo tarpaulin --version` — confirmed

---

## AC2: Installs cargo-tarpaulin when not present and cargo is available

**Criteria:** Given `cargo-tarpaulin` is not installed and `cargo` is available, when `installDependency()` is called, then it runs `cargo install cargo-tarpaulin` and verifies installation via `cargo tarpaulin --version`.

**Method:** Created a mock `cargo` binary that simulates tarpaulin not being installed initially, then reporting it as installed after `cargo install cargo-tarpaulin` is executed. Ran `codeharness init --no-observability` on a Rust project.

```bash
docker exec codeharness-verify sh -c "
cat > /usr/local/bin/cargo << 'SCRIPT'
#!/bin/sh
if [ \"\$1\" = \"tarpaulin\" ] && [ \"\$2\" = \"--version\" ]; then
  if [ -f /tmp/tarpaulin_installed ]; then
    echo \"cargo-tarpaulin 0.27.1\"
    exit 0
  else
    echo \"error: no such subcommand: tarpaulin\" >&2
    exit 101
  fi
fi
if [ \"\$1\" = \"install\" ] && [ \"\$2\" = \"cargo-tarpaulin\" ]; then
  touch /tmp/tarpaulin_installed
  echo \"Installing cargo-tarpaulin v0.27.1\"
  exit 0
fi
echo \"cargo 1.75.0\"
exit 0
SCRIPT
chmod +x /usr/local/bin/cargo
rm -f /tmp/tarpaulin_installed"
```

```bash
docker exec codeharness-verify sh -c "cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability 2>&1"
```

```output
[INFO] Stack detected: Rust (Cargo.toml)
[INFO] App type: generic
[INFO] Dockerfile already exists -- skipping template generation.
[OK] Showboat: already installed (v0.4.0)
[FAIL] agent-browser: install failed. Install failed. Try: npm install -g @anthropic/agent-browser
[INFO] agent-browser is optional — continuing without it
[FAIL] beads: install failed. Install failed. Try: pip install beads or pipx install beads
[INFO] beads is optional — continuing without it
[OK] Semgrep: already installed (v1.156.0)
[OK] BATS: already installed (v1.13.0)
[OK] cargo-tarpaulin: installed (v0.27.1)
[WARN] Beads init failed: Beads failed: spawnSync bd ENOENT. Command: bd init
[INFO] Beads is optional — continuing without it
[FAIL] BMAD install failed: BMAD failed: _bmad/ directory was not created after successful npx bmad-method install. Command: npx bmad-method install --yes --tools claude-code
[OK] State file: .claude/codeharness.local.md created
[INFO] OTLP: skipped (--no-observability)
[INFO] Observability: disabled, skipping Docker stack
[OK] Enforcement: frontend:ON database:ON api:ON observability:ON
[INFO] Harness initialized. Run: codeharness bridge --epics <path>
```

JSON confirmation:

```bash
docker exec codeharness-verify sh -c "rm -f /tmp/tarpaulin_installed && cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability --json 2>&1" | python3 -c "import sys,json; d=json.load(sys.stdin); ct=[x for x in d['dependencies'] if x['name']=='cargo-tarpaulin']; print(json.dumps(ct, indent=2))"
```

```output
[
  {
    "name": "cargo-tarpaulin",
    "displayName": "cargo-tarpaulin",
    "status": "installed",
    "version": "0.27.1"
  }
]
```

**Verdict: PASS**
- Status `installed` (not `already-installed`) confirms it ran the install command first
- Version `0.27.1` confirms post-install verification via `cargo tarpaulin --version` succeeded
- The mock proved that `cargo install cargo-tarpaulin` was called (marker file created), then `cargo tarpaulin --version` was called to verify

---

## AC3: Returns already-installed when cargo-tarpaulin is present

**Criteria:** Given `cargo-tarpaulin` is already installed, when `installDependency()` is called, then it returns `{ status: 'already-installed' }` without attempting reinstall.

**Method:** With the mock `cargo` binary where `cargo tarpaulin --version` succeeds immediately (marker file present from prior install), ran `codeharness init --no-observability`.

```bash
docker exec codeharness-verify sh -c "cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability --json 2>&1" | python3 -c "import sys,json; d=json.load(sys.stdin); ct=[x for x in d['dependencies'] if x['name']=='cargo-tarpaulin']; print(json.dumps(ct, indent=2))"
```

```output
[
  {
    "name": "cargo-tarpaulin",
    "displayName": "cargo-tarpaulin",
    "status": "already-installed",
    "version": "0.27.1"
  }
]
```

Text output confirmation:

```bash
docker exec codeharness-verify sh -c "cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability 2>&1" | grep cargo-tarpaulin
```

```output
[OK] cargo-tarpaulin: already installed (v0.27.1)
```

**Verdict: PASS**
- Status `already-installed` — confirmed
- No reinstall attempted (check command succeeded, so install command was skipped)

---

## AC4: Graceful failure when cargo is not available

**Criteria:** Given `cargo` is not available on the system, when `installDependency()` is called with the cargo-tarpaulin spec, then it returns `{ status: 'failed' }` gracefully (not critical, does not abort init).

**Method:** Removed the mock `cargo` binary entirely, then ran `codeharness init --no-observability`.

```bash
docker exec codeharness-verify sh -c "rm -f /usr/local/bin/cargo /tmp/tarpaulin_installed && cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability --json 2>&1" | python3 -c "import sys,json; d=json.load(sys.stdin); ct=[x for x in d['dependencies'] if x['name']=='cargo-tarpaulin']; print(json.dumps(ct, indent=2))"
```

```output
[
  {
    "name": "cargo-tarpaulin",
    "displayName": "cargo-tarpaulin",
    "status": "failed",
    "version": null,
    "error": "Install failed. Try: cargo install cargo-tarpaulin"
  }
]
```

Full text output showing init completes successfully despite failure:

```bash
docker exec codeharness-verify sh -c "cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability 2>&1"
```

```output
[INFO] Stack detected: Rust (Cargo.toml)
[INFO] App type: generic
[INFO] Dockerfile already exists -- skipping template generation.
[OK] Showboat: already installed (v0.4.0)
[FAIL] agent-browser: install failed. Install failed. Try: npm install -g @anthropic/agent-browser
[INFO] agent-browser is optional — continuing without it
[FAIL] beads: install failed. Install failed. Try: pip install beads or pipx install beads
[INFO] beads is optional — continuing without it
[OK] Semgrep: already installed (v1.156.0)
[OK] BATS: already installed (v1.13.0)
[FAIL] cargo-tarpaulin: install failed. Install failed. Try: cargo install cargo-tarpaulin
[INFO] cargo-tarpaulin is optional — continuing without it
[WARN] Beads init failed: Beads failed: spawnSync bd ENOENT. Command: bd init
[INFO] Beads is optional — continuing without it
[FAIL] BMAD install failed: BMAD failed: _bmad/ directory was not created after successful npx bmad-method install. Command: npx bmad-method install --yes --tools claude-code
[OK] State file: .claude/codeharness.local.md created
[INFO] OTLP: skipped (--no-observability)
[INFO] Observability: disabled, skipping Docker stack
[OK] Enforcement: frontend:ON database:ON api:ON observability:ON
[INFO] Harness initialized. Run: codeharness bridge --epics <path>
```

**Verdict: PASS**
- Status `failed` with helpful error message — confirmed
- `cargo-tarpaulin is optional — continuing without it` — graceful, no abort
- Init completed successfully (exit message: `Harness initialized`) — not critical, does not abort

---

## AC5: Init on Rust project attempts cargo-tarpaulin install during dependency phase

**Criteria:** Given `codeharness init` runs on a Rust project where `cargo-tarpaulin` is not installed, when the dependency install phase executes, then it attempts `cargo install cargo-tarpaulin` as part of the normal registry iteration.

**Method:** Created a Rust project (Cargo.toml + src/main.rs), ran `codeharness init --no-observability`. Verified cargo-tarpaulin appears in the dependency results alongside all other registry entries.

```bash
docker exec codeharness-verify sh -c "cd /tmp/test-rust-project && rm -rf .codeharness .claude && codeharness init --no-observability --json 2>&1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Stack:', d['stack'])
print('Dependencies:')
for dep in d['dependencies']:
    print(f\"  {dep['name']}: {dep['status']}\")
"
```

```output
Stack: rust
Dependencies:
  showboat: already-installed
  agent-browser: failed
  beads: failed
  semgrep: already-installed
  bats: already-installed
  cargo-tarpaulin: failed
```

**Verdict: PASS**
- Stack correctly detected as `rust`
- `cargo-tarpaulin` is present in the dependency iteration (6th entry)
- It attempted installation as part of normal registry iteration (status `failed` because cargo is not available, which is expected)
- All 6 registry entries are iterated unconditionally, matching the design

---

## Observability Coverage

[OBSERVABILITY GAP] No log events detected from VictoriaLogs for any of the CLI interactions. The `codeharness init --no-observability` flag was used (required to bypass Docker check inside the container), which may explain the lack of telemetry. The observability stack itself is running on the host but the CLI was invoked without OTLP instrumentation active.

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| AC1 | Registry entry with correct spec | PASS |
| AC2 | Installs when not present, verifies via check command | PASS |
| AC3 | Returns already-installed without reinstall | PASS |
| AC4 | Graceful failure when cargo unavailable | PASS |
| AC5 | Attempted during init on Rust project | PASS |

**Overall: ALL 5 ACs PASS**
