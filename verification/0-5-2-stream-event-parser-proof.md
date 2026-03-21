# Verification Proof: 0-5-2 Stream Event Parser

**Date:** 2026-03-21
**Verifier:** Claude (black-box)
**Container:** codeharness-verify
**Result:** ALL 6 ACs PASS

---

## AC 1: content_block_start with tool_use emits tool-start

```bash
docker exec codeharness-verify sh -c 'VITEST=1 node --input-type=module -e "
import { parseStreamLine } from \"/usr/local/lib/node_modules/codeharness/dist/index.js\";
const input = JSON.stringify({\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_start\",\"content_block\":{\"type\":\"tool_use\",\"name\":\"Bash\",\"id\":\"toolu_xxx\"}}});
const result = parseStreamLine(input);
console.log(JSON.stringify(result));
"'
```

```output
{"type":"tool-start","name":"Bash","id":"toolu_xxx"}
```

**PASS** -- Output matches expected `{ type: 'tool-start', name: 'Bash', id: 'toolu_xxx' }`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC 2: content_block_delta with input_json_delta emits tool-input

```bash
docker exec codeharness-verify sh -c 'VITEST=1 node --input-type=module -e "
import { parseStreamLine } from \"/usr/local/lib/node_modules/codeharness/dist/index.js\";
const input = JSON.stringify({\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"hello\"}}});
const result = parseStreamLine(input);
console.log(JSON.stringify(result));
"'
```

```output
{"type":"tool-input","partial":"hello"}
```

**PASS** -- Output matches expected `{ type: 'tool-input', partial: 'hello' }`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC 3: content_block_stop emits tool-complete

```bash
docker exec codeharness-verify sh -c 'VITEST=1 node --input-type=module -e "
import { parseStreamLine } from \"/usr/local/lib/node_modules/codeharness/dist/index.js\";
const input = JSON.stringify({\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_stop\"}});
const result = parseStreamLine(input);
console.log(JSON.stringify(result));
"'
```

```output
{"type":"tool-complete"}
```

**PASS** -- Output matches expected `{ type: 'tool-complete' }`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC 4: content_block_delta with text_delta emits text

```bash
docker exec codeharness-verify sh -c 'VITEST=1 node --input-type=module -e "
import { parseStreamLine } from \"/usr/local/lib/node_modules/codeharness/dist/index.js\";
const input = JSON.stringify({\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello world\"}}});
const result = parseStreamLine(input);
console.log(JSON.stringify(result));
"'
```

```output
{"type":"text","text":"Hello world"}
```

**PASS** -- Output matches expected `{ type: 'text', text: 'Hello world' }`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC 5: system/api_retry emits retry

```bash
docker exec codeharness-verify sh -c 'VITEST=1 node --input-type=module -e "
import { parseStreamLine } from \"/usr/local/lib/node_modules/codeharness/dist/index.js\";
const input = JSON.stringify({\"type\":\"system\",\"subtype\":\"api_retry\",\"attempt\":2,\"retry_delay_ms\":5000});
const result = parseStreamLine(input);
console.log(JSON.stringify(result));
"'
```

```output
{"type":"retry","attempt":2,"delay":5000}
```

**PASS** -- Output matches expected `{ type: 'retry', attempt: 2, delay: 5000 }`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC 6: result event emits result

```bash
docker exec codeharness-verify sh -c 'VITEST=1 node --input-type=module -e "
import { parseStreamLine } from \"/usr/local/lib/node_modules/codeharness/dist/index.js\";
const input = JSON.stringify({\"type\":\"result\",\"cost_usd\":0.05,\"session_id\":\"sess_123\"});
const result = parseStreamLine(input);
console.log(JSON.stringify(result));
"'
```

```output
{"type":"result","cost":0.05,"sessionId":"sess_123"}
```

**PASS** -- Output matches expected `{ type: 'result', cost: 0.05, sessionId: 'sess_123' }`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## Summary

| AC | Description | Result |
|----|-------------|--------|
| 1 | tool_use -> tool-start | PASS |
| 2 | input_json_delta -> tool-input | PASS |
| 3 | content_block_stop -> tool-complete | PASS |
| 4 | text_delta -> text | PASS |
| 5 | api_retry -> retry | PASS |
| 6 | result -> result | PASS |

**Overall: PASS (6/6)**
