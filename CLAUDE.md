# Codeharness

This is a **Claude Code plugin** (`.claude-plugin/plugin.json`) AND an **npm package** (`codeharness`). It has two distribution channels.

## Release Process

### Two distribution channels

1. **Claude Code plugin** — installed via `claude plugin install`. Source: git repo. Users get `commands/`, `hooks/`, `knowledge/`, `skills/`.
2. **npm package** — installed via `npm install -g codeharness`. Source: npm registry. Users get `dist/`, `templates/`, `ralph/`.

### How to release

1. Run `/plugin-ops:release` — this bumps `package.json` version, commits, pushes, and creates a git tag.
2. **npm publish happens automatically via GitHub Actions CI/CD pipeline** — the git tag push triggers the `publish` workflow which runs `npm publish`.
3. Do NOT run `npm publish` manually. The pipeline handles it.

### Pipeline details (`.github/workflows/release.yml`)

- **Trigger:** GitHub Release `published` event OR manual `workflow_dispatch` with tag input
- **After `/plugin-ops:release`** pushes the tag, create a GitHub Release from that tag to trigger the pipeline: `gh release create v{version} --generate-notes`
- **Jobs:**
  1. `test` — npm ci → verify version sync (package.json ↔ plugin.json) → build → unit tests → BATS integration tests
  2. `publish-npm` (needs test) — npm publish with OIDC provenance (no NPM_TOKEN needed — uses GitHub OIDC)
  3. `marketplace` (needs test) — dispatches update to private-claude-marketplace repo
- If the pipeline fails, check GitHub Actions. Do NOT re-tag or force-push — fix the issue and create a new patch release.

### Version convention

- **Patch** (0.x.Y): bug fixes, test improvements, doc updates
- **Minor** (0.X.0): new features, new CLI commands, behavioral changes
- **Major** (X.0.0): breaking changes (not yet — still pre-1.0)

Use `plugin-ops` skills for releases, audits, diagnostics — not manual git tags.

## BMAD-METHOD Integration

Use `/bmad-help` to discover all commands. Use `/harness-status` for a quick overview. See `_bmad/COMMANDS.md` for a full command reference.

### Phases

| Phase | Focus | Key Commands |
|-------|-------|-------------|
| 1. Analysis | Understand the problem | `/create-brief`, `/brainstorm-project`, `/market-research` |
| 2. Planning | Define the solution | `/create-prd`, `/create-ux` |
| 3. Solutioning | Design the architecture | `/create-architecture`, `/create-epics-stories`, `/implementation-readiness` |
| 4. Implementation | Build it | `/sprint-planning`, `/create-story`, then `/harness-run` |

### Workflow

1. Work through Phases 1-3 using BMAD agents and workflows (interactive, command-driven)
2. Run `/harness-run` to start autonomous execution

### Available Agents

| Command | Agent | Role |
|---------|-------|------|
| `/analyst` | Analyst | Research, briefs, discovery |
| `/architect` | Architect | Technical design, architecture |
| `/pm` | Product Manager | PRDs, epics, stories |
| `/sm` | Scrum Master | Sprint planning, status, coordination |
| `/dev` | Developer | Implementation, coding |
| `/ux-designer` | UX Designer | User experience, wireframes |
| `/qa` | QA Engineer | Test automation, quality assurance |
