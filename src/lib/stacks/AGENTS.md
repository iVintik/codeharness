# src/lib/stacks — Stack Provider System

Encapsulates per-language logic behind the `StackProvider` interface. Each provider implements detection, coverage, OTLP instrumentation, Dockerfile generation, and test parsing for one technology stack.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| types.ts | Canonical type definitions — `StackProvider` interface (including `getVerifyDockerfileSection` for verification Dockerfile generation), `StackName`, `AppType`, coverage/OTLP/test types | `StackProvider`, `StackName`, `AppType`, `CoverageToolName`, `CoverageToolInfo`, `OtlpResult`, `TestCounts` |
| registry.ts | Provider registry — registration, lookup, marker-based stack detection | `registerProvider`, `getStackProvider`, `detectStacks`, `detectStack`, `StackDetection`, `_resetRegistry` |
| nodejs.ts | Node.js provider — app type detection, coverage (c8/vitest/jest), OTLP packages, Dockerfile (node:22-slim), test output parsing, verification Dockerfile section (Node.js 20 + showboat + claude-code) | `NodejsProvider` |
| python.ts | Python provider — app type detection, coverage (pytest-cov), OTLP packages, Dockerfile, test output parsing, verification Dockerfile section (pip + venv + coverage + pytest) | `PythonProvider` |
| rust.ts | Rust provider — Cargo.toml parsing, coverage (tarpaulin), OTLP packages, multi-stage Dockerfile (rust:1.82-slim), workspace test aggregation, verification Dockerfile section (rustup + clippy + tarpaulin + Bevy system libs detection) | `RustProvider` |
| utils.ts | Shared helpers for providers — safe JSON/text reading, Node.js/Python/Cargo dependency extraction | `readJsonSafe`, `readTextSafe`, `getNodeDeps`, `getPythonDepsContent`, `hasPythonDep`, `getCargoDepsSection`, `hasCargoDep` |
| index.ts | Barrel re-exports + auto-registers NodejsProvider, PythonProvider, RustProvider on import | all public API from types.ts and registry.ts |

## Architecture

- `StackProvider` interface in `types.ts` defines the contract (16 methods, 1 optional)
- Each stack gets its own file (`nodejs.ts`, `python.ts`, `rust.ts`)
- `registry.ts` stores providers in a module-level `Map<StackName, StackProvider>`
- `index.ts` triggers auto-registration on import
- `utils.ts` provides shared filesystem helpers used across providers
