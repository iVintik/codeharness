---
description: Generate or update project documentation — docs/ tree + README.md — using the BMAD tech-writer with codeharness post-processing.
---

# Harness Docs

The canonical documentation command for a codeharness-initialized project.
Runs a scan-driven documentation pass and guarantees that README.md and
docs/index.md both end up in sync with the real codebase. This wraps the
BMAD tech-writer's `document-project` workflow so you get its scan power,
then enforces codeharness rules that BMAD alone does not:

- **README.md is always produced** — BMAD writes `docs/`, codeharness
  writes `README.md` from the generated docs.
- **Diff-aware update mode** — when docs already exist and only some
  source files changed, rewrite only the affected sections instead of a
  full re-scan.
- **Non-destructive** — managed content lives between
  `<!-- codeharness:readme -->` markers; anything outside stays intact.
- **Self-contained** — no BMAD file patches, no brittle cross-skill
  injection. If BMAD's internal layout changes again, this skill still
  works.

## Step 1: Pick a mode

Look at `{project-root}/docs/index.md`:

- **No `docs/index.md`** or it still contains `_(To be generated)_`
  markers: run `MODE=initial`.
- **`docs/index.md` exists and populated**: ask the user which mode:

  ```
  What do you want to do with the docs?

  1. Update changed files only — diff-aware refresh (default, fastest)
  2. Full re-scan — rebuild docs/ from scratch
  3. Deep-dive on a specific area — detailed coverage of one module
  4. Cancel

  [1/2/3/4]:
  ```

  If the user picks 2 or 3, delegate to `/bmad-bmm-document-project` and
  pick the matching option there, then return here for Step 3 (README
  generation). If the user picks 1, run `MODE=update`. If they pick 4,
  exit.

## Step 2: Run the scan

### `MODE=initial`
- Delegate to `/bmad-bmm-document-project`. When the tech-writer prompts
  for scan level, pick **Deep** unless the user explicitly asked for
  Quick or Exhaustive.
- After the tech-writer writes `docs/index.md`, `docs/project-overview.md`,
  `docs/architecture.md`, `docs/source-tree-analysis.md`,
  `docs/component-inventory.md`, `docs/development-guide.md`, proceed to
  Step 3.

### `MODE=update`
- Compute the changed file set since the last doc refresh:
  - If the project is a git repo: read `Last Updated` from
    `docs/index.md` (or use `docs/index.md` mtime as fallback) and run:
    ```bash
    git log --name-only --since="<baseline>" --pretty=format: -- <source dirs> | sort -u | grep -v '^$'
    ```
  - Otherwise: `find <source dirs> -type f -newer docs/index.md`.
- If the changed set is empty: print `"Docs already up-to-date since <baseline>."` and exit.
- For each changed file, classify which generated docs it affects:
  - `src/**`, package source dirs → `architecture.md`, `component-inventory.md`, `source-tree-analysis.md`
  - `pyproject.toml`, `package.json`, `Cargo.toml`, `pom.xml`, `go.mod` → `project-overview.md`, `development-guide.md`, README tech stack
  - New/deleted top-level dirs → `source-tree-analysis.md`, `architecture.md`
  - Test files → `development-guide.md`
  - CI / Docker / Dockerfile → `development-guide.md` deployment section
- Read ONLY the changed files (read-on-demand for unchanged files that
  the changed ones import from).
- Update the affected docs in place — read the current doc, rewrite only
  the sections that reference changed files, preserve everything else.
  **Never rewrite a doc top-to-bottom in update mode.** The diff is the
  point.
- Refresh `docs/index.md` `Last Updated` and any structural summary
  sections that actually changed.

## Step 3: Write / update README.md (always)

After the scan finishes, produce or update `{project-root}/README.md`
per the codeharness README spec below. This runs for all modes — initial,
update, full re-scan, and deep-dive.

### Required sections (in order)

1. **Project name + one-line description** — from package.json,
   pyproject.toml, Cargo.toml, or directory basename.
2. **What it does** — 3-6 sentences answering:
   - What problem does it solve?
   - Who is it for? (downstream consumers, end users, other services)
   - What is the primary capability?
   - Any non-obvious constraints (runtime, platform, required services)
   A reader who only reads this section must know whether the project is
   relevant to them.
3. **Key features** — 4-8 bullets. Each bullet = a short noun phrase +
   one-line explanation. Every bullet must correspond to a real
   subpackage, module, or entry point found in the scan. No
   aspirational roadmap items.
4. **Tech stack** — concise list of primary languages, frameworks,
   runtimes, and optional extras. Flag anything the user must install
   separately (database, Docker, system libraries).
5. **Getting started** — exactly ONE happy-path scenario. Structure:
   ```markdown
   ### Getting started

   1. **Install**
      ```bash
      <single install command — the most common one, not every variant>
      ```

   2. **Run the simplest possible example**
      ```bash
      <one command or ≤5-line snippet that produces visible output>
      ```
      Expected output:
      ```
      <what the user will actually see>
      ```

   3. **Next step**
      See [Usage](#usage) for common workflows or [docs/index.md](./docs/index.md) for full docs.
   ```
   Rules:
   - One install command, one run command, one expected-output block.
   - No "and/or", no "if you want X then Y".
   - Pick the scenario that works for the most users with the fewest
     prerequisites.
   - For libraries with no runnable entry point, use a minimal
     import-and-call snippet instead of a shell command.
6. **Usage** — 3-6 everyday recipes for real-world scenarios. Each
   recipe:
   - Short heading ("Run as a service", "Use as a library",
     "Process a batch of X").
   - 1-2 sentence description of when you'd use it.
   - Minimal code or command snippet.
   All symbols and commands must come from the scan — never invent APIs.
7. **Project structure** — brief annotated tree of top-level directories,
   pulled from `docs/source-tree-analysis.md`. One line per entry, no
   deep recursion.
8. **Documentation** — bullet list pointing at `docs/index.md` plus key
   generated docs (`docs/architecture.md`, `docs/component-inventory.md`,
   `docs/development-guide.md`).
9. **Contributing / License** — preserve any existing section if the
   README already had one. If absent and the scan detected a `LICENSE`
   file, link to it; otherwise skip.

### Non-destructive update mode

- If `README.md` already exists, detect `<!-- codeharness:readme -->`.
- If the marker is present, replace only the content between
  `<!-- codeharness:readme -->` and `<!-- /codeharness:readme -->`.
- If the marker is absent, **prepend** a managed section wrapped in
  markers at the top of the file. Keep the original README body intact
  below, separated by a horizontal rule.
- On an initial write (no existing README.md), emit the full managed
  block directly — no markers needed, the whole file is managed.

### Forbidden content

- Never embed CLI help output from unrelated tools.
- Never reference codeharness commands (unless the project IS
  codeharness itself).
- Never hardcode project structure — always use real scan data.
- Never invent features, fake APIs, or aspirational roadmap items.

## Step 4: Cross-link docs/index.md → README.md

Make sure `docs/index.md` has a `[Project README](../README.md)` link in
its "Quick Reference" section. If the link is already there, leave the
rest of index.md alone.

## Step 5: Report

Print a summary:

```
Harness Docs — {MODE}

Scan: {deep|quick|diff-aware since <timestamp>}
Generated:
  - docs/index.md               ({written|updated|unchanged})
  - docs/project-overview.md    ({written|updated|unchanged})
  - docs/architecture.md        ({written|updated|unchanged})
  - docs/component-inventory.md ({written|updated|unchanged})
  - docs/source-tree-analysis.md ({written|updated|unchanged})
  - docs/development-guide.md   ({written|updated|unchanged})
  - README.md                    ({written|updated|unchanged})

Next: commit the docs, then /codeharness:harness-run to start autonomous execution.
```

## Critical Rules

1. **README.md is non-negotiable** — every successful run of this skill
   must leave a valid, up-to-date `README.md` at the project root.
2. **Do not invent content** — every claim in the docs and README must
   trace back to a real file, symbol, or command observed during the scan.
3. **Respect managed markers** — never overwrite content outside
   `<!-- codeharness:readme -->` markers.
4. **Diff mode is the diff** — in update mode, do not rewrite unchanged
   sections. That defeats the purpose.
5. **Do not delegate README to BMAD** — BMAD's tech-writer writes `docs/`.
   README writing lives here, where codeharness's spec is authoritative.
