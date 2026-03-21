# Exec Plan: 4-2 Dockerfile Template & Dev Integration

## Status: complete

## Summary

Implements `generateDockerfileTemplate()` which creates stack-appropriate Dockerfiles (nodejs, python, generic) during `codeharness init`. Generated templates pass all 6 `validateDockerfile()` rule categories by construction.

## Files Changed

- `src/modules/infra/dockerfile-template.ts` — new: template generation logic
- `src/modules/infra/__tests__/dockerfile-template.test.ts` — new: 22 unit tests
- `src/modules/infra/index.ts` — modified: barrel export
- `src/modules/infra/types.ts` — modified: `dockerfile` field on `InitResult`
- `src/modules/infra/init-project.ts` — modified: integrated template generation
- `src/modules/infra/AGENTS.md` — modified: documented new file
- `patches/dev/enforcement.md` — modified: added Dockerfile Maintenance section

## Key Decisions

- Templates use single-line `apt-get install` to satisfy the validator's per-line tool detection
- Generic template uses `npm install -g placeholder` as a stand-in binary install
- Template generation is synchronous (file I/O only, no docker build)
