## Codeharness Documentation Targets (README + docs/index.md)

### README.md Generation

After the project scan is complete, produce or update `{project-root}/README.md`
alongside `{project_knowledge}/index.md`. The README is the project's public
entry point — treat it as a first-class deliverable of this workflow.

**Contents (required sections, in this order):**

1. **Project name + one-line description** — derived from package.json / pyproject.toml / Cargo.toml or basename.

2. **What it does** — 3-6 sentences describing the product concretely. Answer:
   - What problem does it solve?
   - Who is it for? (downstream consumers, end users, other services)
   - What is the primary capability? (e.g. "agent SDK", "CLI for X", "FastAPI
     service that Y")
   - Any non-obvious constraints or assumptions (runtime, platform, required
     external services).
   Sourced from scan classification + top-level module purpose analysis.
   This is the executive summary — a reader who only reads this section must
   understand whether the project is relevant to them.

3. **Key features** — bullet list of 4-8 concrete capabilities the project
   exposes. Each bullet is a short noun phrase followed by a one-line
   explanation. Pulled from the scan's component inventory: every bullet must
   correspond to a real subpackage / module / entry point in the code, not
   aspirational roadmap items.

4. **Tech stack** — concise list of primary languages, frameworks, runtimes,
   and optional extras. Flag anything the user must install separately
   (database, Docker, system libraries).

5. **Getting started** — ONE happy-path scenario from zero to first
   successful run. This is not a command reference; it is a narrative the
   reader can copy-paste in order and see something work. Structure:

   ```markdown
   ### Getting started

   1. **Install**

      ```bash
      <single install command — the most common one, not every variant>
      ```

   2. **Run the simplest possible example**

      ```bash
      <one command or ≤5-line code snippet that produces visible output>
      ```

      Expected output:

      ```
      <what the user will actually see>
      ```

   3. **Next step**

      See [Usage](#usage) for common workflows or [docs/index.md](./docs/index.md) for the full documentation.
   ```

   Rules for this section:
   - Exactly ONE install command, ONE run command, ONE expected-output block.
   - No "and/or" forks, no "if you want X then Y" branches.
   - Pick the scenario that works for the most users with the fewest
     prerequisites. Skip optional extras here.
   - If the project is a library with no runnable entry point, use the
     smallest possible import-and-call snippet instead of a shell command.

6. **Usage** — everyday recipes for the top 3-6 real-world scenarios the
   project supports. Each recipe is:
   - A short heading ("Run as a service", "Use as a library", "Process a
     batch of X", etc.)
   - A 1-2 sentence description of when you'd use it.
   - A minimal code or command snippet.
   Derived from the scan's detected entry points (CLI subcommands, exported
   classes, runner modules, job templates) and test fixtures. Recipes must
   reference real symbols and commands — do not invent feature names.

7. **Project structure** — brief annotated tree of top-level directories,
   pulled from `source-tree-analysis.md`. Keep it tight — one line per
   top-level entry, no deep recursion.

8. **Documentation** — bullet list pointing at `docs/index.md` plus key
   generated docs (architecture, component inventory, development guide).

9. **Contributing / License** — preserve any existing section if the README
   already had one. If absent and the scan detected a `LICENSE` file, link
   to it; otherwise skip.

**Non-destructive update mode:**

- If `README.md` already exists, detect the marker `<!-- codeharness:readme -->`.
- If the marker is present, replace only the content between `<!-- codeharness:readme -->` and `<!-- /codeharness:readme -->`.
- If the marker is absent, prepend a managed section (wrapped in markers) at the top of the file, keeping the original README body intact below.
- On an initial write (no existing README.md), emit the full managed block directly.

**Forbidden content:**

- Never embed CLI help output from unrelated tools.
- Never reference codeharness commands unless the project IS codeharness itself.
- Never hardcode project structure — always use the actual directory layout from the scan.

### docs/index.md Alignment

The `docs/index.md` index produced by this workflow must:

- Live at `{project-root}/docs/index.md` (matches `project_knowledge` config — do not write to a different path).
- Cross-reference the README via a `[Project README](../README.md)` link in the "Quick Reference" section.
- Leave any pre-existing manually-curated sections untouched when running in update mode; only refresh sections this workflow owns.

### Quality Checklist Before Marking Done

- [ ] `README.md` exists at project root with all 9 required sections in order.
- [ ] "What it does" answers problem + audience + primary capability in 3-6 sentences.
- [ ] "Key features" has 4-8 bullets, each traceable to a real scanned subpackage.
- [ ] "Getting started" is exactly ONE install + ONE run + ONE expected-output block, no forks or alternatives.
- [ ] "Usage" has 3-6 recipes using only real entry points and symbols from the scan.
- [ ] `README.md` contains `<!-- codeharness:readme -->` markers if any managed content was written.
- [ ] `docs/index.md` links to `../README.md`.
- [ ] Detected tech stack in README matches the scan's `primary_language` and `tech_stack_summary`.
- [ ] Getting-started and usage commands are copy-pasteable and reference real files in the project.
- [ ] No placeholder `{{variable}}` or `_(To be generated)_` strings remain in README.
- [ ] No invented features, fake APIs, or aspirational roadmap items.

### WHY

Codeharness init scaffolds `docs/index.md` as a placeholder and intentionally
does not create `README.md` — README authorship belongs to this workflow,
which has actual scan data to work from. Previous init implementations dumped
self-referential boilerplate into user project READMEs (mentioning codeharness
CLI, hardcoding `src/` layout) and the onboard scanner correctly flagged them
as stale. Centralizing README generation here ensures the README reflects the
real project every time `document-project` runs.
