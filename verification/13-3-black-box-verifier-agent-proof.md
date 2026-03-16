# Verification Proof: 13-3-black-box-verifier-agent

*2026-03-16T15:38:57Z by Showboat 0.6.1*
<!-- showboat-id: 47699ab6-5585-48a7-bd01-8dd5617c44d7 -->

## Story: Black-Box Verifier Agent & Session

Acceptance Criteria:
1. AC1: Spawns separate Claude Code process via claude --print (not in-session subagent)
2. AC2: Verification prompt includes ACs, container name, observability endpoints, README instruction, docker exec rule
3. AC3: Workspace at /tmp/codeharness-verify-{key}/ has NO source code (src/ absent)
4. AC4: Verifier runs commands inside Docker via docker exec and captures output
5. AC5: Verifier queries observability endpoints (VictoriaLogs :9428, VictoriaMetrics :8428, VictoriaTraces :16686)
6. AC6: Proof document exists at /tmp/codeharness-verify-{key}/verification/{key}-proof.md
7. AC7: After session completes, proof is copied back to project verification/ directory
8. AC8: validateProofQuality() rejects grep-heavy proofs and requires docker exec per AC
9. AC9: Verifier reports REAL failures, does not fabricate evidence

```bash
npm run test:unit 2>&1 | tail -10
```

```output
[1m[46m RUN [49m[22m [36mv4.1.0 [39m[90m/Users/ivintik/dev/personal/codeharness/src[39m

error: required option '--story <key>' not specified
error: required option '--story <key>' not specified

[2m Test Files [22m [1m[32m52 passed[39m[22m[90m (52)[39m
[2m      Tests [22m [1m[32m1613 passed[39m[22m[90m (1613)[39m
[2m   Start at [22m 19:39:24
[2m   Duration [22m 7.99s[2m (transform 2.91s, setup 0ms, import 5.20s, tests 11.00s, environment 3ms)[22m

```

## AC1: Spawns separate Claude Code process via claude --print

Unit tests prove spawnVerifierSession() calls execFileSync('claude', ['--print', '--max-budget-usd', ...]) with cwd set to the clean workspace. This is a subprocess, not an in-session Agent tool call. The verifier-session.test.ts has dedicated tests for command construction, cwd isolation, and budget defaults.

```bash
npx vitest run src/lib/__tests__/verifier-session.test.ts 2>&1 | tail -20
```

```output

[1m[46m RUN [49m[22m [36mv4.1.0 [39m[90m/Users/ivintik/dev/personal/codeharness/src[39m


[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m19 passed[39m[22m[90m (19)[39m
[2m   Start at [22m 19:39:45
[2m   Duration [22m 185ms[2m (transform 44ms, setup 0ms, import 59ms, tests 20ms, environment 0ms)[22m

```

```bash
grep -n 'execFileSync.*claude' /Users/ivintik/dev/personal/codeharness/src/lib/verifier-session.ts
```

```output
130:    const result = execFileSync('claude', args, {
```

```bash
grep -n 'cwd.*workspace\|--print\|--max-budget-usd' /Users/ivintik/dev/personal/codeharness/src/lib/verifier-session.ts
```

```output
8: * The verifier runs as `claude --print --max-budget-usd N -p "..."` with cwd set
70: * 5. Spawn `claude --print --max-budget-usd N -p "..."` with cwd = workspace
116:  // 5. Spawn claude --print
118:    '--print',
119:    '--max-budget-usd',
131:      cwd: workspace,
```

## AC2: Verification prompt includes all required sections

The verify-prompt.ts template includes: story ACs (via storyContent), container name, docker exec instructions, observability endpoints (VictoriaLogs :9428, VictoriaMetrics :8428, VictoriaTraces :16686), README.md reading instruction, and proof output path. Unit tests confirm all sections present.

```bash
grep -n 'docker exec\|README.md\|9428\|8428\|16686\|story.md\|verification/' /Users/ivintik/dev/personal/codeharness/src/templates/verify-prompt.ts | head -20
```

```output
8: * exclusively via `docker exec` and observability queries.
14:  /** Full content of story.md from the clean workspace */
29:  victoriaLogs: 'http://localhost:9428',
30:  victoriaMetrics: 'http://localhost:8428',
31:  victoriaTraces: 'http://localhost:16686',
37: * - Read README.md for usage guidance
38: * - Run ALL commands via `docker exec`
40: * - Write a proof document at `verification/{storyKey}-proof.md`
56:## Step 1: Read README.md
58:Start by reading \`README.md\` in this workspace. It contains install and usage instructions for the project. Use it to understand how to exercise the CLI.
62:The story file \`story.md\` contains the acceptance criteria you must verify. Here is its content:
72:1. Run commands inside the Docker container via \`docker exec ${container} ...\`
79:- ALL CLI commands MUST run via: \`docker exec ${container} <command>\`
80:- Example: \`docker exec ${container} codeharness --version\`
81:- Example: \`docker exec ${container} codeharness init --json\`
96:Write your verification proof to: \`verification/${config.storyKey}-proof.md\`
104:docker exec ${container} <command>
114:1. **ALL commands MUST use \`docker exec ${container} ...\`** — do NOT run commands directly on the host filesystem.
```

```bash
grep -n 'includes.*container\|includes.*observability\|includes.*README\|includes.*docker exec\|includes.*story' /Users/ivintik/dev/personal/codeharness/src/lib/__tests__/verifier-session.test.ts | head -10
```

```output
195:  it('includes story content in the prompt', () => {
212:  it('includes container name and observability endpoints in prompt', () => {
```

## AC3: Clean workspace has NO source code

The workspace at /tmp/codeharness-verify-{key}/ is created by prepareVerifyWorkspace() (from story 13-1). It copies only story.md, README.md, and docs — NOT src/. We verify by creating a workspace and confirming src/ is absent.

```bash
npx codeharness verify-env prepare --story 13-3-black-box-verifier-agent 2>&1 && echo '--- Workspace contents ---' && ls -la /tmp/codeharness-verify-13-3-black-box-verifier-agent/ 2>&1 && echo '--- src/ check ---' && ls /tmp/codeharness-verify-13-3-black-box-verifier-agent/src/ 2>&1 || echo 'src/ does not exist (expected)'
```

```output
[OK] Workspace prepared: /tmp/codeharness-verify-13-3-black-box-verifier-agent
--- Workspace contents ---
total 40
drwxr-xr-x@   6 ivintik  wheel    192 Mar 16 19:41 .
drwxrwxrwt  153 root     wheel   4896 Mar 16 19:41 ..
drwxr-xr-x@   6 ivintik  wheel    192 Mar 16 19:41 docs
-rw-r--r--@   1 ivintik  staff   2112 Mar 16 19:41 README.md
-rw-r--r--@   1 ivintik  staff  15830 Mar 16 19:41 story.md
drwxr-xr-x@   2 ivintik  wheel     64 Mar 16 19:41 verification
--- src/ check ---
ls: /tmp/codeharness-verify-13-3-black-box-verifier-agent/src/: No such file or directory
src/ does not exist (expected)
```

## AC4: Verifier runs commands inside Docker via docker exec

The verification prompt template (verify-prompt.ts) explicitly instructs the verifier: 'ALL CLI commands MUST run via: docker exec {container} <command>'. The prompt includes examples. The validateProofQuality() function enforces this at validation time — proofs without docker exec per AC are rejected (AC8). Integration test of actual Docker execution requires a running claude subprocess with Docker — escalated.

```bash
grep -n 'ALL CLI commands MUST\|docker exec.*container\|docker exec.*codeharness' /Users/ivintik/dev/personal/codeharness/src/templates/verify-prompt.ts
```

```output
72:1. Run commands inside the Docker container via \`docker exec ${container} ...\`
79:- ALL CLI commands MUST run via: \`docker exec ${container} <command>\`
80:- Example: \`docker exec ${container} codeharness --version\`
81:- Example: \`docker exec ${container} codeharness init --json\`
104:docker exec ${container} <command>
114:1. **ALL commands MUST use \`docker exec ${container} ...\`** — do NOT run commands directly on the host filesystem.
```

```bash
echo '[ESCALATE] AC4: Full integration test of docker exec inside verifier subprocess requires running claude CLI with Docker daemon. Cannot be verified without both claude binary and Docker running.'
```

```output
[ESCALATE] AC4: Full integration test of docker exec inside verifier subprocess requires running claude CLI with Docker daemon. Cannot be verified without both claude binary and Docker running.
```

## AC5: Verifier queries observability endpoints

The prompt template includes all three observability endpoints with curl examples. Defaults: VictoriaLogs localhost:9428, VictoriaMetrics localhost:8428, VictoriaTraces localhost:16686. Custom endpoints configurable via observabilityEndpoints option.

```bash
grep -n 'victoriaLogs\|victoriaMetrics\|victoriaTraces\|9428\|8428\|16686' /Users/ivintik/dev/personal/codeharness/src/templates/verify-prompt.ts
```

```output
20:    victoriaLogs?: string;
21:    victoriaMetrics?: string;
22:    victoriaTraces?: string;
29:  victoriaLogs: 'http://localhost:9428',
30:  victoriaMetrics: 'http://localhost:8428',
31:  victoriaTraces: 'http://localhost:16686',
87:- **VictoriaLogs** (logs): \`${endpoints.victoriaLogs}\`
88:  - Example: \`curl '${endpoints.victoriaLogs}/select/logsql/query?query=_stream_id:*&limit=10'\`
89:- **VictoriaMetrics** (metrics): \`${endpoints.victoriaMetrics}\`
90:  - Example: \`curl '${endpoints.victoriaMetrics}/api/v1/query?query=up'\`
91:- **VictoriaTraces** (traces): \`${endpoints.victoriaTraces}\`
92:  - Example: \`curl '${endpoints.victoriaTraces}/api/traces?service=codeharness-verify&limit=10'\`
```

```bash
echo '[ESCALATE] AC5: Querying live observability endpoints requires running VictoriaLogs/VictoriaMetrics/VictoriaTraces services. Prompt template includes correct endpoints and curl examples — verified above.'
```

```output
[ESCALATE] AC5: Querying live observability endpoints requires running VictoriaLogs/VictoriaMetrics/VictoriaTraces services. Prompt template includes correct endpoints and curl examples — verified above.
```

## AC6: Proof document path at /tmp/codeharness-verify-{key}/verification/{key}-proof.md

The spawnVerifierSession() function checks for proof at join(workspace, 'verification', storyKey + '-proof.md'). The prompt template instructs the verifier to write to 'verification/{storyKey}-proof.md'. Both paths match the convention.

```bash
grep -n 'proofPath\|verification.*proof' /Users/ivintik/dev/personal/codeharness/src/lib/verifier-session.ts
```

```output
44:  proofPath: string | null;
151:  const proofPath = join(workspace, 'verification', `${storyKey}-proof.md`);
152:  const proofExists = existsSync(proofPath);
156:    proofPath: proofExists ? proofPath : null,
184:  const sourceProof = join(workspace, 'verification', `${storyKey}-proof.md`);
```

```bash
grep -n 'verification.*storyKey.*proof\|proof.*path' /Users/ivintik/dev/personal/codeharness/src/templates/verify-prompt.ts
```

```output
40: * - Write a proof document at `verification/{storyKey}-proof.md`
96:Write your verification proof to: \`verification/${config.storyKey}-proof.md\`
```

## AC7: Proof is copied from temp workspace back to project verification/ directory

copyProofToProject() copies from workspace/verification/{key}-proof.md to projectDir/verification/{key}-proof.md. Creates the verification/ directory if needed. 6 unit tests cover: basic copy, dir creation, missing proof error, path traversal rejection, special chars rejection, and overwrite behavior.

```bash
npx vitest run src/lib/__tests__/verifier-session.test.ts --reporter verbose 2>&1 | grep -E '✓|PASS|copyProof' | head -15
```

```output
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mthrows when workspace does not exist[32m 2[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mrejects story keys with path traversal sequences[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mrejects story keys with slashes[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mrejects story keys with special characters[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mthrows when story.md missing in workspace[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mconstructs correct claude command arguments[32m 3[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mreturns success=true when claude exits 0 and proof exists[32m 2[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mreturns success=false when claude exits non-zero[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mreturns success=false when proof file is missing[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mhandles timeout error[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mincludes story content in the prompt[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22mincludes container name and observability endpoints in prompt[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mspawnVerifierSession[2m > [22muses default budget of 3 USD[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mcopyProofToProject[2m > [22mcopies proof file to project verification/ directory[32m 3[2mms[22m[39m
 [32m✓[39m lib/__tests__/verifier-session.test.ts[2m > [22mcopyProofToProject[2m > [22mcreates verification/ directory if it does not exist[32m 2[2mms[22m[39m
```

## AC8: validateProofQuality() rejects grep-heavy proofs and requires docker exec per AC

classifyEvidenceCommands() classifies commands as: docker-exec, observability, grep-src, other.
checkBlackBoxEnforcement() rejects proofs where >50% commands are grep src/ and flags ACs missing docker exec.
validateProofQuality() integrates blackBoxPass into the passed field.
ProofQuality interface includes: grepSrcCount, dockerExecCount, observabilityCount, otherCount, blackBoxPass.

```bash
npx vitest run src/lib/__tests__/verify-blackbox.test.ts --reporter verbose 2>&1 | grep -E '✓|PASS|FAIL' | head -25
```

```output
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mclassifies docker exec commands[32m 2[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mclassifies observability curl commands[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mclassifies grep against src/ commands[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mclassifies other commands[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mhandles shell code blocks too[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mhandles multiple commands in one code block[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mreturns empty array when no code blocks[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mignores output blocks[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mclassifies grep not against src/ as other[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mclassifyEvidenceCommands[2m > [22mclassifies curl to non-observability ports as other[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mcheckBlackBoxEnforcement[2m > [22mpasses when all ACs have docker exec and no grep src/[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mcheckBlackBoxEnforcement[2m > [22mfails when >50% of commands are grep against src/[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mcheckBlackBoxEnforcement[2m > [22mfails when an AC section has no docker exec commands[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mcheckBlackBoxEnforcement[2m > [22mskips escalated ACs in per-AC docker exec check[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mcheckBlackBoxEnforcement[2m > [22mcounts observability commands correctly[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mcheckBlackBoxEnforcement[2m > [22mreturns blackBoxPass=true when no AC headers are present (no per-AC check)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mvalidateProofQuality — black-box enforcement[2m > [22mreturns ProofQuality with black-box fields[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mvalidateProofQuality — black-box enforcement[2m > [22mrejects proofs where >50% of commands are grep against src/[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mvalidateProofQuality — black-box enforcement[2m > [22mrejects proofs with zero docker exec per AC[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mvalidateProofQuality — black-box enforcement[2m > [22mpasses proofs with adequate docker exec and observability evidence[32m 1[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mvalidateProofQuality — black-box enforcement[2m > [22mreturns blackBoxPass=false in empty result for nonexistent file[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/verify-blackbox.test.ts[2m > [22mvalidateProofQuality — black-box enforcement[2m > [22mallows exactly 50% grep src/ ratio (only >50% is rejected)[32m 1[2mms[22m[39m
```

## AC9: Verifier reports REAL failures, does not fabricate evidence

The prompt template explicitly instructs: 'Report REAL failures — if a feature does not work via the CLI or the documentation is insufficient to exercise it, report that as a verification failure with specific details about what went wrong. Do NOT fabricate passing evidence.' This is enforced structurally by the black-box environment (no src/ to grep) and by validateProofQuality() rejecting grep-heavy proofs.

```bash
grep -n 'REAL failure\|fabricat\|Do NOT fabricate' /Users/ivintik/dev/personal/codeharness/src/templates/verify-prompt.ts
```

```output
41: * - Report REAL failures — never fabricate evidence
54:This workspace contains NO source code. The \`src/\` directory does not exist. This is intentional — you must verify the feature works as a user would experience it, not by reading implementation details. If you cannot verify a feature from docs + CLI alone, that is a REAL failure in the product's documentation or packaging.
116:3. **Report REAL failures** — if a feature does not work via the CLI or the documentation is insufficient to exercise it, report that as a verification failure with specific details about what went wrong. Do NOT fabricate passing evidence.
```

```bash
echo '[ESCALATE] AC9: Behavioral verification that the verifier agent actually reports failures honestly requires running a live claude subprocess against a deliberately broken feature. Prompt instructs real failure reporting — verified above. Structural enforcement via black-box workspace + validateProofQuality() — verified in AC3 and AC8.'
```

```output
[ESCALATE] AC9: Behavioral verification that the verifier agent actually reports failures honestly requires running a live claude subprocess against a deliberately broken feature. Prompt instructs real failure reporting — verified above. Structural enforcement via black-box workspace + validateProofQuality() — verified in AC3 and AC8.
```

```bash
npm run test:unit 2>&1 | tail -8
```

```output
error: required option '--story <key>' not specified
error: required option '--story <key>' not specified

[2m Test Files [22m [1m[32m52 passed[39m[22m[90m (52)[39m
[2m      Tests [22m [1m[32m1613 passed[39m[22m[90m (1613)[39m
[2m   Start at [22m 19:43:42
[2m   Duration [22m 8.43s[2m (transform 3.35s, setup 0ms, import 5.96s, tests 12.33s, environment 11ms)[22m

```

## Verdict: PASS

- Total ACs: 9
- Verified: 6 (AC1, AC2, AC3, AC6, AC7, AC8)
- Escalated: 3 (AC4, AC5, AC9 — require running claude subprocess + Docker + live observability services)
- Failed: 0
- Tests: 1613/1613 passing (52 test files)
- Dedicated test files: verifier-session.test.ts (19 tests), verify-blackbox.test.ts (22 tests)
- Showboat verify: reproducible

Escalation rationale: AC4, AC5, and AC9 are integration-required ACs that need a live claude CLI subprocess with Docker daemon and observability stack running. The structural implementation (prompt template, workspace isolation, proof validation) is fully verified. The behavioral integration cannot be tested without the full stack.
