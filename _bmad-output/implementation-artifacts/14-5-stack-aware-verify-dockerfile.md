# Story 14-5: Stack-Aware Verification Dockerfile Generation

## Status: backlog

## Story

As a developer verifying a Rust/Bevy project,
I want the verification Dockerfile generated with the correct toolchain and system libs,
So that verification doesn't waste time fixing container issues manually.

## Acceptance Criteria

- [ ] AC1: Given a Rust project with `bevy` in Cargo.toml, when `verify-env build` runs, then the generated Dockerfile includes: correct Rust version, Bevy system libs (wayland, udev, alsa, x11, xkbcommon, fontconfig), clippy, cargo-tarpaulin <!-- verification: cli-verifiable -->
- [ ] AC2: Given `ENV PATH="/root/.cargo/bin:$PATH"` in the generated Dockerfile, when `cargo tarpaulin` is run inside the container, then it works without manual `source "$HOME/.cargo/env"` <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 10 (Stack-Aware Provisioning).** Verification Dockerfile is generated per-project based on detected stacks, not selected from a static template.

The `generateVerifyDockerfile()` function (from architecture-v3.md):

```typescript
// src/modules/verify/env.ts
function generateVerifyDockerfile(stacks: StackDetection[]): string {
  const sections: string[] = [];

  // Base image
  sections.push('FROM ubuntu:22.04');
  sections.push('ENV PATH="/root/.cargo/bin:/usr/local/bin:$PATH"');

  // Common tools
  sections.push('RUN apt-get update && apt-get install -y curl jq git python3 pipx');
  sections.push('RUN pipx install semgrep showboat');

  // Per-stack tooling
  for (const detection of stacks) {
    const provider = getStackProvider(detection.stack);
    sections.push(provider.getVerifyDockerfileSection());
  }

  // OTLP config
  sections.push('ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318');

  return sections.join('\n\n');
}
```

Each `StackProvider` needs a `getVerifyDockerfileSection()` method (add to interface if not present):

**RustProvider:**
```dockerfile
# Install Rust toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
RUN rustup component add clippy
RUN cargo install cargo-tarpaulin

# Bevy system libs (if bevy detected)
RUN apt-get install -y libudev-dev libasound2-dev libwayland-dev libxkbcommon-dev libfontconfig1-dev libx11-dev
```

**NodejsProvider:**
```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs
```

**PythonProvider:**
```dockerfile
RUN apt-get install -y python3-pip python3-venv
RUN pip3 install coverage pytest
```

The current `src/modules/verify/env.ts` already exists. Modify it to use the stack provider pattern instead of hardcoded Dockerfile selection. The Bevy detection should check Cargo.toml `[dependencies]` for `bevy` and conditionally include the system libs.

The `PATH` issue is critical: Rust tools installed via rustup are in `/root/.cargo/bin`. Setting `ENV PATH` in the Dockerfile ensures all subsequent `RUN` and runtime commands find cargo, rustc, clippy, and tarpaulin without sourcing `.cargo/env`.

## Files to Change

- `src/modules/verify/env.ts` — Rewrite `generateVerifyDockerfile()` to iterate stack providers and compose Dockerfile sections
- `src/lib/stacks/types.ts` — Add `getVerifyDockerfileSection()` to `StackProvider` interface (if not already present)
- `src/lib/stacks/rust.ts` — Implement `getVerifyDockerfileSection()` with Rust toolchain, clippy, tarpaulin, and conditional Bevy system libs
- `src/lib/stacks/nodejs.ts` — Implement `getVerifyDockerfileSection()` with Node.js install
- `src/lib/stacks/python.ts` — Implement `getVerifyDockerfileSection()` with Python/pip/coverage install
- `src/commands/verify-env.ts` — Ensure `build` subcommand calls `generateVerifyDockerfile()` with detected stacks
