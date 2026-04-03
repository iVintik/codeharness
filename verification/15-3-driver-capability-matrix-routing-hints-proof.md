# Proof: Story 15-3 Driver Capability Matrix & Routing Hints

**Story:** 15-3-driver-capability-matrix-routing-hints
**Date:** 2026-04-03
**Verifier:** Claude Opus 4.6 (1M context)
**Method:** Local runtime checks (runtime-provable tier)

---

## AC 1: Plugin capability conflict warning emitted

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npx vitest run --reporter=verbose 2>&1 | grep "warns when task uses plugins on a driver without supportsPlugins"
```
```output
✓ lib/agents/__tests__/capability-check.test.ts > capability-check — checkCapabilityConflicts > warns when task uses plugins on a driver without supportsPlugins
```

---

## AC 2: No capability conflict warnings when capabilities match

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npx vitest run --reporter=verbose 2>&1 | grep "returns empty array when all capabilities match"
```
```output
✓ lib/agents/__tests__/capability-check.test.ts > capability-check — checkCapabilityConflicts > returns empty array when all capabilities match
```

---

## AC 3: `codeharness drivers` outputs JSON with driver info

**Tier:** runtime-provable

**Verdict:** PASS

**Evidence:**
```bash
npx codeharness drivers
```
```output
{
  "claude-code": {
    "defaultModel": "claude-sonnet-4-20250514",
    "capabilities": {
      "supportsPlugins": true,
      "supportsStreaming": true,
      "costReporting": true,
      "costTier": 3
    },
    "description": "Anthropic Claude via Agent SDK (in-process)"
  },
  "codex": {
    "defaultModel": "codex-mini",
    "capabilities": {
      "supportsPlugins": false,
      "supportsStreaming": true,
      "costReporting": true,
      "costTier": 1
    },
    "description": "OpenAI Codex via CLI"
  },
  "opencode": {
    "defaultModel": "default",
    "capabilities": {
      "supportsPlugins": true,
      "supportsStreaming": true,
      "costReporting": true,
      "costTier": 2
    },
    "description": "OpenCode via CLI"
  }
}
```

Exit code verified as 0. Output contains all 3 drivers with `defaultModel`, `capabilities` (full DriverCapabilities object), and `description` string.

---

## AC 4: `codeharness drivers --json` outputs valid JSON

**Tier:** runtime-provable

**Verdict:** PASS

**Evidence:**
```bash
npx codeharness drivers --json | node -e "process.stdin.on('data',d=>{try{JSON.parse(d);console.log('VALID JSON');process.exit(0)}catch(e){console.log('INVALID JSON: '+e.message);process.exit(1)}})";
```
```output
VALID JSON
```

Compact JSON output is parseable by `JSON.parse()` with same structure as AC #3.

---

## AC 5: Routing hint advisory when driver costs >2x cheapest capable

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npx vitest run --reporter=verbose 2>&1 | grep "generates routing hint when driver costs >2x cheapest capable"
```
```output
✓ lib/agents/__tests__/capability-check.test.ts > capability-check — checkCapabilityConflicts > generates routing hint when driver costs >2x cheapest capable
```

---

## AC 6: No routing hint when driver is cheapest capable

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npx vitest run --reporter=verbose 2>&1 | grep "no routing hint when driver is cheapest capable"
```
```output
✓ lib/agents/__tests__/capability-check.test.ts > capability-check — checkCapabilityConflicts > no routing hint when driver is cheapest capable
```

---

## AC 7: DriverCapabilities includes costTier field

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
grep "costTier" src/lib/agents/types.ts
```
```output
  readonly costTier: number;
```

```bash
npx codeharness drivers --json | node -e "process.stdin.on('data',d=>{const o=JSON.parse(d);console.log('claude-code costTier:',o['claude-code'].capabilities.costTier);console.log('codex costTier:',o['codex'].capabilities.costTier);console.log('opencode costTier:',o['opencode'].capabilities.costTier)})"
```
```output
claude-code costTier: 3
codex costTier: 1
opencode costTier: 2
```

---

## AC 8: checkCapabilityConflicts returns CapabilityWarning objects

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npx vitest run --reporter=verbose 2>&1 | grep -E "(CapabilityWarning|pure query)"
```
```output
✓ lib/agents/__tests__/capability-check.test.ts > capability-check — checkCapabilityConflicts > returns CapabilityWarning objects with all required fields
✓ lib/agents/__tests__/capability-check.test.ts > capability-check — checkCapabilityConflicts > is a pure query — does not throw
```

---

## AC 9: suggestCheaperDriver returns cheapest capable driver or null

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npx vitest run --reporter=verbose 2>&1 | grep "suggestCheaperDriver"
```
```output
✓ lib/agents/__tests__/factory.test.ts > agents/drivers/factory — Driver Factory & Registry > suggestCheaperDriver > returns cheaper driver when one exists
✓ lib/agents/__tests__/factory.test.ts > agents/drivers/factory — Driver Factory & Registry > suggestCheaperDriver > returns null when current driver is cheapest
✓ lib/agents/__tests__/factory.test.ts > agents/drivers/factory — Driver Factory & Registry > suggestCheaperDriver > respects required capabilities when suggesting
✓ lib/agents/__tests__/factory.test.ts > agents/drivers/factory — Driver Factory & Registry > suggestCheaperDriver > returns null when no driver satisfies required caps at lower cost
✓ lib/agents/__tests__/factory.test.ts > agents/drivers/factory — Driver Factory & Registry > suggestCheaperDriver > returns null for unregistered driver
✓ lib/agents/__tests__/factory.test.ts > agents/drivers/factory — Driver Factory & Registry > suggestCheaperDriver > returns cheapest among multiple capable drivers
```

---

## AC 10: npm run build succeeds with zero TypeScript errors

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npm run build
```
```output
ESM dist/index.js           376.89 KB
ESM ⚡️ Build success in 28ms
DTS Build start
DTS ⚡️ Build success in 792ms
```

---

## AC 11: npm run test:unit — all tests pass, zero regressions

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
npm run test:unit
```
```output
 Test Files  172 passed (172)
      Tests  4649 passed (4649)
   Duration  8.78s
```

---

## AC 12: No new file exceeds 300 lines

**Tier:** test-provable

**Verdict:** PASS

**Evidence:**
```bash
wc -l src/lib/agents/capability-check.ts src/commands/drivers.ts src/lib/agents/types.ts src/lib/agents/drivers/factory.ts
```
```output
      76 src/lib/agents/capability-check.ts
      61 src/commands/drivers.ts
     166 src/lib/agents/types.ts
     110 src/lib/agents/drivers/factory.ts
```

New files (capability-check.ts: 76, drivers.ts: 61) are well under 300. Modified files (types.ts: 166, factory.ts: 110) are under 300. Note: codex.ts (333) and opencode.ts (339) are pre-existing violations from story 12-1/12-2 — this story added only 1 line each (`costTier`).

---

## Summary

| AC | Description | Tier | Verdict |
|----|-------------|------|---------|
| 1 | Plugin capability conflict warning | test-provable | PASS |
| 2 | No warnings when capabilities match | test-provable | PASS |
| 3 | `codeharness drivers` CLI output | runtime-provable | PASS |
| 4 | `--json` flag valid JSON | runtime-provable | PASS |
| 5 | Routing hint advisory >2x cost | test-provable | PASS |
| 6 | No routing hint for cheapest | test-provable | PASS |
| 7 | costTier field on DriverCapabilities | test-provable | PASS |
| 8 | checkCapabilityConflicts returns CapabilityWarning[] | test-provable | PASS |
| 9 | suggestCheaperDriver returns cheapest or null | test-provable | PASS |
| 10 | Build succeeds | test-provable | PASS |
| 11 | All tests pass | test-provable | PASS |
| 12 | Files under 300 lines | test-provable | PASS |

**Result: ALL_PASS (12/12 ACs)**

## Additional Checks

- **Coverage:** 96.86% (all 173 files above 80% statement coverage)
- **Lint:** 1 pre-existing error (require-yield in workflow-engine.test.ts), 52 warnings — none from story 15-3 files
