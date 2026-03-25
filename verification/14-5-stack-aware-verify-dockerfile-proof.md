# Verification Proof: 14-5-stack-aware-verify-dockerfile

**Story:** Stack-Aware Verification Dockerfile Generation
**Verified:** 2026-03-25
**Tier:** unit-testable

## AC 1: Rust project with Bevy — Dockerfile includes Rust toolchain, Bevy system libs, clippy, cargo-tarpaulin

**Verdict:** PASS

```bash
grep -n 'rustup\|clippy\|tarpaulin\|libudev\|libasound\|libwayland\|libxkbcommon\|libfontconfig\|libx11' src/lib/stacks/rust.ts
```
```output
203:      'RUN curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable',
204:      'ENV PATH="/root/.cargo/bin:$PATH"',
205:      'RUN rustup component add clippy',
206:      'RUN cargo install cargo-tarpaulin',
216:          '    libudev-dev libasound2-dev libwayland-dev libxkbcommon-dev \\',
217:          '    libfontconfig1-dev libx11-dev \\',
```

All required components present: rustup, clippy, cargo-tarpaulin, and all 6 Bevy system libs.

## AC 2: ENV PATH in Dockerfile — cargo tarpaulin works without manual source

**Verdict:** PASS

```bash
grep -n 'ENV PATH.*cargo' src/lib/stacks/rust.ts
```
```output
204:      'ENV PATH="/root/.cargo/bin:$PATH"',
```

PATH set at line 204, before clippy (205) and tarpaulin (206) installs.

## AC 3: Node.js project — Dockerfile includes Node.js 20, npm, Semgrep, showboat, claude-code

**Verdict:** PASS

```bash
grep -n 'nodesource\|showboat\|claude-code\|setup_20\|semgrep' src/lib/stacks/nodejs.ts src/modules/verify/dockerfile-generator.ts
```
```output
src/lib/stacks/nodejs.ts:331:      'RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\',
src/lib/stacks/nodejs.ts:334:      'RUN npm install -g showboat @anthropic-ai/claude-code',
src/modules/verify/dockerfile-generator.ts:37:  sections.push('RUN pipx install semgrep && pipx ensurepath');
```

Node.js 20 via nodesource, showboat + claude-code via npm, Semgrep via pipx in common layer.

## AC 4: Python project — Dockerfile includes Python 3, pip, venv, Semgrep

**Verdict:** PASS

```bash
grep -n 'python3-pip\|python3-venv\|coverage.*pytest' src/lib/stacks/python.ts
```
```output
246:      '    python3-pip python3-venv \\',
248:      'RUN pip install --break-system-packages coverage pytest',
```

python3-pip, python3-venv, coverage, pytest all present. Semgrep in common layer.

## AC 5: Rust without Bevy — toolchain present, Bevy libs absent

**Verdict:** PASS

```bash
grep -n 'hasCargoDep.*bevy' src/lib/stacks/rust.ts
```
```output
213:      if (hasCargoDep(depsSection, 'bevy')) {
```

Bevy libs are conditional on `hasCargoDep(depsSection, 'bevy')`. Without bevy, lines 214-219 are skipped. Test confirms:

```bash
npx vitest run --reporter=verbose src/lib/stacks/__tests__/verify-dockerfile-section.test.ts 2>&1 | grep -i 'bevy\|PASS\|FAIL'
```
```output
 ✓ RustProvider.getVerifyDockerfileSection > includes Bevy system libs when bevy is in Cargo.toml
 ✓ RustProvider.getVerifyDockerfileSection > does NOT include Bevy system libs when bevy is absent
 ✓ RustProvider.getVerifyDockerfileSection > includes Rust toolchain, clippy, tarpaulin
 Test Files  1 passed (1)
 Tests  8 passed (8)
```

## AC 6: StackProvider interface has getVerifyDockerfileSection, all providers implement, TypeScript compiles

**Verdict:** PASS

```bash
grep -n 'getVerifyDockerfileSection' src/lib/stacks/types.ts src/lib/stacks/nodejs.ts src/lib/stacks/python.ts src/lib/stacks/rust.ts
```
```output
src/lib/stacks/types.ts:98:  getVerifyDockerfileSection(projectDir: string): string;
src/lib/stacks/nodejs.ts:328:  getVerifyDockerfileSection(_projectDir: string): string {
src/lib/stacks/python.ts:242:  getVerifyDockerfileSection(_projectDir: string): string {
src/lib/stacks/rust.ts:200:  getVerifyDockerfileSection(projectDir: string): string {
```

Interface declared in types.ts:98, implemented by all three providers. TypeScript compiles with zero errors (see AC 8).

## AC 7: Multi-stack project — Dockerfile includes tooling for ALL detected stacks

**Verdict:** PASS

```bash
grep -n 'detectStacks\|detection\.\|getStackProvider\|getVerifyDockerfileSection' src/modules/verify/dockerfile-generator.ts
```
```output
8:import { detectStacks, getStackProvider } from '../../lib/stacks/index.js';
19:  const detections = detectStacks(projectDir);
42:    const provider = getStackProvider(detection.stack as StackName);
44:    const section = provider.getVerifyDockerfileSection(projectDir);
```

Generator iterates ALL detections from detectStacks() (line 41) and includes each provider's section. Multi-stack test confirms:

```bash
npx vitest run --reporter=verbose src/modules/verify/__tests__/dockerfile-generator.test.ts 2>&1 | grep -i 'multi\|PASS\|FAIL'
```
```output
 ✓ generateVerifyDockerfile > multi-stack project includes sections for all stacks
 Test Files  1 passed (1)
 Tests  12 passed (12)
```

## AC 8: npm run build succeeds with zero errors

**Verdict:** PASS

```bash
npm run build 2>&1 | grep -E 'success|error|fail'
```
```output
ESM ⚡️ Build success in 10ms
ESM ⚡️ Build success in 43ms
DTS ⚡️ Build success in 1503ms
```

Zero errors, three successful build passes (ESM main, ESM observability, DTS).

## AC 9: npm test — all tests pass with zero regressions

**Verdict:** PASS

```bash
npx vitest run 2>&1 | tail -5
```
```output
 Test Files  145 passed (145)
      Tests  3777 passed (3777)
   Start at  10:37:17
   Duration  9.34s
```

All 145 test files pass, 3777 individual tests pass, zero failures.

## AC 10: env.ts ≤ 313 lines, dockerfile-generator.ts < 100 lines

**Verdict:** PASS

```bash
wc -l src/modules/verify/env.ts src/modules/verify/dockerfile-generator.ts
```
```output
     305 src/modules/verify/env.ts
      63 src/modules/verify/dockerfile-generator.ts
     368 total
```

env.ts reduced from 313 to 305 lines (-8). dockerfile-generator.ts at 63 lines (under 100 limit).

---

**Summary:** 10/10 ACs PASS. 0 pending. 0 escalated.
