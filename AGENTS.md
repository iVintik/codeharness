# Agent Instructions

## Build & Test

```bash
npm run build          # tsup → dist/
npm run test:unit      # vitest (1650+ tests)
npm run test:coverage  # vitest with c8 coverage
npm test               # bats integration tests
```

## Project Structure

This is both an **npm CLI** (`codeharness`) and a **Claude Code plugin** (`.claude-plugin/`).

```
src/                    # TypeScript source → compiled to dist/
  commands/             # CLI commands (init, run, verify, status, etc.)
  lib/                  # Shared libraries (state, docker, verify-env, retry-state, etc.)
  templates/            # Embedded string templates (prompts, docker-compose, otel config)
commands/               # Plugin slash commands (harness-run.md, harness-init.md, etc.)
hooks/                  # Plugin hooks (session-start, pre-commit, post-write, post-test)
skills/                 # Plugin skills
knowledge/              # Plugin knowledge files
templates/              # Static templates (Dockerfile.verify)
ralph/                  # Autonomous loop (ralph.sh + supporting scripts)
_bmad/                  # BMAD Method workflows and agents
_bmad-output/           # Sprint artifacts (stories, sprint-status.yaml, retros)
verification/           # Showboat proof documents
```

## Key Conventions

- All CLI output uses `[OK]`, `[FAIL]`, `[WARN]`, `[INFO]` prefixes
- All commands support `--json` for machine-readable output
- Exit codes: 0 success, 1 error, 2 invalid usage
- Templates are TypeScript string literals, not external files (except Dockerfile.verify)
- State file: `.claude/codeharness.local.md` (YAML frontmatter)
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Retry state: `ralph/.story_retries` (strict `key=count` format)

## Session Completion

When ending a work session, you MUST:

1. Run quality gates (if code changed) — tests, build
2. Push to remote: `git pull --rebase && git push`
3. Verify `git status` shows "up to date with origin"
4. Never stop before pushing — that leaves work stranded locally
