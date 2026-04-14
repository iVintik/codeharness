## Codeharness Documentation Targets (README + docs/index.md)

### README.md Generation

After the project scan is complete, produce or update `{project-root}/README.md`
alongside `{project_knowledge}/index.md`. The README is the project's public
entry point — treat it as a first-class deliverable of this workflow.

**Contents (required sections):**

1. **Project name + one-line description** — derived from package.json / pyproject.toml / Cargo.toml or basename.
2. **Overview** — 2-4 sentences on what the project does and why it exists. Sourced from scan classification.
3. **Tech stack** — concise list of primary languages, frameworks, and runtimes.
4. **Getting started** — prerequisites, install, build, test commands. Use the exact commands from the scan's detected tool (npm/pip/cargo/etc.).
5. **Project structure** — brief annotated tree of top-level directories, pulled from `source-tree-analysis.md`.
6. **Documentation** — bullet list pointing at `docs/index.md` plus key generated docs.
7. **Contributing / License** — preserve any existing section if the README already had one.

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

- [ ] `README.md` exists at project root with all required sections above.
- [ ] `README.md` contains `<!-- codeharness:readme -->` markers if any managed content was written.
- [ ] `docs/index.md` links to `../README.md`.
- [ ] Detected tech stack in README matches the scan's primary_language and tech_stack_summary.
- [ ] Getting-started commands are copy-pasteable and reference real files in the project.
- [ ] No placeholder `{{variable}}` or `_(To be generated)_` strings remain in README.

### WHY

Codeharness init scaffolds `docs/index.md` as a placeholder and intentionally
does not create `README.md` — README authorship belongs to this workflow,
which has actual scan data to work from. Previous init implementations dumped
self-referential boilerplate into user project READMEs (mentioning codeharness
CLI, hardcoding `src/` layout) and the onboard scanner correctly flagged them
as stale. Centralizing README generation here ensures the README reflects the
real project every time `document-project` runs.
