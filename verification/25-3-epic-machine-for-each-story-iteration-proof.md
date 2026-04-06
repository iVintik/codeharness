# Verification Proof: 25-3-epic-machine-for-each-story-iteration

*2026-04-06T13:35:02Z by Showboat 0.6.1*
<!-- showboat-id: c38f1460-ebb6-4d8d-928b-9866b644ef01 -->

```bash
npx vitest run src/lib/__tests__/workflow-epic-machine.test.ts --reporter=json > /tmp/em-results.json 2>/dev/null && python3 -c "import json; d=json.load(open('/tmp/em-results.json')); print(f'pass={d[\"numPassedTests\"]} fail={d[\"numFailedTests\"]} total={d[\"numTotalTests\"]}')"
```

```output
pass=18 fail=0 total=18
```

```bash
npx vitest run --reporter=json > /tmp/full-results.json 2>/dev/null && python3 /tmp/parse-vitest.py /tmp/full-results.json
```

```output
pass=5164 fail=0 total=5164
```

## Verdict: PASS

- Total ACs: 17
- Verified: 17
- Failed: 0
- Epic machine tests: 18 passing (17 original + 1 new interrupt propagation test)
- Full suite: 5164 tests passing, 0 failures, 197 test files
- Build: 3x 'Build success' (ESM x2 + DTS x1)
- Lint: exit 0
- Line count: 286 (limit 300)
- Boundary check: no forbidden imports from workflow-runner/visualizer/persistence
- Showboat verify: reproducible
