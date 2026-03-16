# Proof: 12-2-sprint-execution-ownership

*2026-03-15T21:01:35Z by Showboat 0.6.1*
<!-- showboat-id: 18d98ce8-3bd4-4511-8b27-71fb61785fba -->

## Story: 12.2 Sprint Execution Ownership

Acceptance Criteria:
1. Implementation artifacts in _bmad-output/implementation-artifacts/ are trackable by git (not ignored by .gitignore)
2. harness-run commits after story completion with message feat: story {key} -- {short title}
3. Subagents (dev-story, code-review, verifier) do NOT commit or modify sprint-status
4. AGENTS.md staleness checks use content completeness, not mtime
5. Missing file error reporting includes filename in AGENTS.md stale message

```bash
npm run test:unit 2>&1 | grep -E 'Test Files|Tests ' | head -2
```

```output
[2m Test Files [22m [1m[32m45 passed[39m[22m[90m (45)[39m
[2m      Tests [22m [1m[32m1422 passed[39m[22m[90m (1422)[39m
```

## AC 1: Implementation artifacts are trackable by git
Evidence: .gitignore should NOT blanket-ignore _bmad-output/ but should selectively ignore only planning research.

```bash
grep -n '_bmad-output' .gitignore
```

```output
2:_bmad-output/planning-artifacts/research/
```

```bash
git check-ignore _bmad-output/implementation-artifacts/sprint-status.yaml && echo 'IGNORED' || echo 'TRACKABLE'
```

```output
TRACKABLE
```

## AC 2: Harness-run commits after story completion
Evidence: commands/harness-run.md should contain git add, git commit, and feat: story/epic commit message patterns.

```bash
grep -n 'git add\|git commit\|feat: story\|feat: epic' commands/harness-run.md
```

```output
64:  prompt: "Run /create-story for story {story_key}. The sprint-status.yaml is at _bmad-output/implementation-artifacts/sprint-status.yaml. Auto-discover the next backlog story and create it. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
80:  prompt: "Run /bmad-dev-story for the story at _bmad-output/implementation-artifacts/{story_key}.md — implement all tasks, write tests, and mark the story for review. Do NOT ask the user any questions — proceed autonomously through all tasks until complete. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
98:  prompt: "Run /bmad-code-review for the story at _bmad-output/implementation-artifacts/{story_key}.md — perform adversarial review, fix all HIGH and MEDIUM issues found. After fixing, run `codeharness coverage --min-file 80` and ensure all files pass the per-file floor and the overall 90% target. Update the story status to `verified` when all issues are fixed and coverage passes. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
160:Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
187:1. Stage all changes: `git add -A`
188:2. Commit with message: `feat: story {story_key} — {short title from story file}`
190:4. If `git commit` fails (e.g., pre-commit hooks), log the error and continue — do not halt the sprint:
192:   [WARN] git commit failed for story {story_key}: {error message}
215:       prompt: "Run /retrospective for Epic {N}. All stories are complete. Review the epic's work, extract lessons learned, and produce the retrospective document. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
224:3. Commit epic completion: `git add -A && git commit -m "feat: epic {N} complete"`
225:   - If `git commit` fails, log the error and continue:
227:     [WARN] git commit failed for epic {N}: {error message}
```

## AC 3: Subagents do NOT commit or modify sprint-status
Evidence: All subagent prompts in harness-run.md must contain no-commit/no-status instructions.

```bash
grep -n 'Do NOT run git commit\|Do NOT modify sprint-status' commands/harness-run.md
```

```output
64:  prompt: "Run /create-story for story {story_key}. The sprint-status.yaml is at _bmad-output/implementation-artifacts/sprint-status.yaml. Auto-discover the next backlog story and create it. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
80:  prompt: "Run /bmad-dev-story for the story at _bmad-output/implementation-artifacts/{story_key}.md — implement all tasks, write tests, and mark the story for review. Do NOT ask the user any questions — proceed autonomously through all tasks until complete. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
98:  prompt: "Run /bmad-code-review for the story at _bmad-output/implementation-artifacts/{story_key}.md — perform adversarial review, fix all HIGH and MEDIUM issues found. After fixing, run `codeharness coverage --min-file 80` and ensure all files pass the per-file floor and the overall 90% target. Update the story status to `verified` when all issues are fixed and coverage passes. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
160:Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
215:       prompt: "Run /retrospective for Epic {N}. All stories are complete. Review the epic's work, extract lessons learned, and produce the retrospective document. Do NOT ask the user any questions — proceed autonomously. Do NOT run git commit. Do NOT run git add. Do NOT modify sprint-status.yaml."
```

## AC 4: AGENTS.md staleness checks content, not mtime
Evidence: doc-health.ts should have content-based functions: getSourceFilesInModule, getMentionedFilesInAgentsMd, checkAgentsMdCompleteness.

```bash
grep -n 'getSourceFilesInModule\|getMentionedFilesInAgentsMd\|checkAgentsMdCompleteness' src/lib/doc-health.ts
```

```output
199:export function getSourceFilesInModule(modulePath: string): string[] {
248:export function getMentionedFilesInAgentsMd(agentsPath: string): string[] {
277:export function checkAgentsMdCompleteness(
281:  const sourceFiles = getSourceFilesInModule(modulePath);
282:  const mentionedFiles = new Set(getMentionedFilesInAgentsMd(agentsPath));
326:  const { complete, missing } = checkAgentsMdCompleteness(agentsPath, fullModulePath);
396:        const { missing } = checkAgentsMdCompleteness(rootAgentsPath, fullModPath);
```

## AC 5: Missing file error reporting
Evidence: doc-health.ts should report missing filenames in the stale reason message.

```bash
grep -n 'missing:' src/lib/doc-health.ts
```

```output
35:  summary: { fresh: number; stale: number; missing: number; total: number };
280:): { complete: boolean; missing: string[] } {
335:      reason: `AGENTS.md stale for module: ${modulePath} — missing: ${missingList}`,
414:          reason: `AGENTS.md stale for module: ${staleModule} — missing: ${allMissing.join(', ')}`,
525:    missing: documents.filter(d => d.grade === 'missing').length,
629:    missing: documents.filter(d => d.grade === 'missing').length,
```

```bash
npm run test:unit 2>&1 | grep -E 'Test Files|Tests ' | head -2
```

```output
[2m Test Files [22m [1m[32m45 passed[39m[22m[90m (45)[39m
[2m      Tests [22m [1m[32m1422 passed[39m[22m[90m (1422)[39m
```

## Verdict: PASS

- Total ACs: 5
- Verified: 5
- Failed: 0
- Tests: 45 files, 1422 tests passing
- Showboat verify: reproducible
