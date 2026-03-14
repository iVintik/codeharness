---
description: Remove all harness artifacts without touching project source code.
---

# Harness Teardown

Cleanly remove all codeharness artifacts from the project. Project source code is NEVER modified (NFR13).

## Step 1: Confirm

Ask the user to confirm teardown:

```
Harness Teardown — this will remove:
- Docker observability stack (VictoriaMetrics, OTel Collector)
- Harness state file (.claude/codeharness.local.md)
- Harness hooks (unregistered via plugin removal)

This will NOT remove:
- _bmad/ directory (BMAD artifacts preserved)
- docs/ directory (documentation preserved)
- Project source code (never touched)
- verification/ directory (proof documents preserved)

Proceed? (y/n)
```

## Step 2: Stop Docker Stack

If `docker-compose.harness.yml` exists:

```bash
docker compose -f docker-compose.harness.yml down -v
```

Output: `[OK] Docker stack: stopped and removed`

If no compose file: `[INFO] Docker stack: not running`

## Step 3: Remove Harness State

Remove the state file:
- Delete `.claude/codeharness.local.md`

Output: `[OK] State file: removed`

## Step 4: Remove Generated Compose File

If `docker-compose.harness.yml` exists at project root:
- Delete `docker-compose.harness.yml`

Output: `[OK] Compose file: removed`

## Step 5: Report

```
Harness Teardown — complete

[OK] Docker stack: {stopped|not running}
[OK] State file: removed
[OK] Compose file: {removed|not present}
[INFO] Hooks: will be inactive after plugin removal
[INFO] BMAD artifacts: preserved (_bmad/)
[INFO] Documentation: preserved (docs/)
[INFO] Source code: untouched

→ To fully remove codeharness, uninstall the plugin.
```
