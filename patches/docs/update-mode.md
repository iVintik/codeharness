## Codeharness Extension: Update Mode

This codeharness addendum adds a fourth "Update" option to the
`document-project` router. When running **Step 3** (existing docs found),
extend the user-facing menu and decision tree as follows:

### Extended Menu for Step 3

When `index.md` already exists, the `<ask>` block in Step 3 MUST present
this menu instead of the default three options:

```
I found existing documentation generated on {{existing_doc_date}}.

What would you like to do?

1. **Update changed files only** — diff-aware refresh. Detect files modified
   since the last scan and only rewrite docs that reference them. Fastest.
   Recommended default for routine doc maintenance.
2. **Re-scan entire project** — full rebuild. Rewrites every generated doc
   from scratch. Use after large refactors or when update mode misses drift.
3. **Deep-dive into specific area** — exhaustive documentation for one
   feature/module/folder. Use when a subsystem needs detailed treatment.
4. **Cancel** — Keep existing documentation as-is.

Your choice [1/2/3/4]:
```

### Update Mode Behavior (new workflow_mode = "update")

When the user selects option 1, run the following sub-workflow INSTEAD of
`full-scan-instructions.md` or `deep-dive-instructions.md`:

1. **Determine baseline timestamp.**
   - Read the `Last Updated` field from `{project_knowledge}/index.md`, or
     fall back to the file's mtime.
   - Store as `{{baseline_timestamp}}`.

2. **Compute changed file set.**
   - If the project is a git repository: run
     `git log --name-only --since="{{baseline_timestamp}}" --pretty=format: \
       | sort -u | grep -v '^$'`
     to list every file touched since the baseline. This is more reliable
     than raw mtimes because it ignores editor touches and includes deletions.
   - If not a git repository: use `find . -type f -newer {project_knowledge}/index.md`
     filtered to the source directories identified by the scan classification.
   - Store the result as `{{changed_files}}`.
   - If `{{changed_files}}` is empty: display
     `"Docs already up-to-date. Nothing changed since {{baseline_timestamp}}."`
     and exit.

3. **Classify changed files.**
   - For each entry in `{{changed_files}}`, decide which generated doc(s)
     it feeds:
     - `src/**`, `lib/**`, package source dirs → `component-inventory.md`,
       `architecture.md`, `source-tree-analysis.md`
     - Config files (pyproject.toml, package.json, Cargo.toml, pom.xml, etc.)
       → `project-overview.md`, `development-guide.md`, README tech stack
     - New/deleted top-level dirs → `source-tree-analysis.md`, `architecture.md`
     - Test files → `development-guide.md` (test commands), coverage notes
     - CI / Docker / Dockerfile → `development-guide.md` deployment section
   - Record a per-doc list: `{ "architecture.md": [changed-files...], ... }`.

4. **Re-read ONLY the changed files.**
   - Do not scan the entire source tree. Do not re-read unchanged files.
   - If a changed file imports from an unchanged file and that context is
     needed, read the unchanged file on-demand — but do not preemptively
     re-read anything outside `{{changed_files}}`.

5. **Update affected docs in place.**
   - For each doc in the per-doc map, read the current doc, update only the
     sections that reference the changed files, and write the updated doc
     back. Preserve everything else — headings, diagrams, cross-references,
     and any codeharness-managed sections (look for `<!-- codeharness:*  -->`
     markers and leave them untouched unless they explicitly own the
     section being updated).
   - Never rewrite a doc top-to-bottom in update mode. The diff is the
     point.

6. **Refresh index.md metadata.**
   - Update `Last Updated` to the current date.
   - If classification changed (e.g. new subsystem added), refresh the
     "Project Structure" and "Key features" sections in index.md.
   - Leave the Quick Reference and other static sections alone unless a
     change directly affects them.

7. **Refresh README.md via the docs-readme-generation rules.**
   - Apply the same "update only changed sections" discipline to README
     managed blocks (between `<!-- codeharness:readme -->` markers).
   - If tech stack, entry points, or key features changed → refresh those
     sections. Otherwise leave README alone.

8. **Report.**
   - Print a summary:
     - Baseline timestamp used.
     - Number of changed files.
     - List of docs updated (doc name + which sections).
     - List of docs skipped (unchanged).
   - Print the update command the user should run next if tests or
     downstream consumers depend on the refreshed docs.

### Decision Tree Overrides

Replace the existing "user selects N" checks in Step 3 with:

- `user selects 1` → set `workflow_mode = "update"`, run the Update Mode
  sub-workflow above. After completion, continue to Step 4.
- `user selects 2` → set `workflow_mode = "full_rescan"`, run
  `full-scan-instructions.md` as before.
- `user selects 3` → set `workflow_mode = "deep_dive"`, run
  `deep-dive-instructions.md` as before.
- `user selects 4` → display `"Keeping existing documentation. Exiting workflow."` and exit.

### Why This Exists

`document-project` previously forced a full re-scan or a narrow deep-dive
for any doc refresh. Neither matched the common case: a user made a
handful of code changes and wants the docs caught up. Update mode covers
that case without re-reading the whole codebase (minutes instead of
10-30m), while staying diff-aware enough to catch real drift. Full
re-scan remains available for large refactors and deep-dive for targeted
deep documentation of a specific subsystem.
