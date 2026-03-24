# Story 15-3: Template Migration -- All Templates to Static Files

## Status: backlog

## Story

As a developer,
I want all templates in `templates/` as static files (not generated in TypeScript),
So that there's one template system.

## Acceptance Criteria

- [ ] AC1: Given `templates/dockerfiles/`, `templates/prompts/`, `templates/docs/` directories, when inspected, then they contain all Dockerfile templates, prompt templates, and doc templates that were previously in `src/templates/*.ts` <!-- verification: cli-verifiable -->
- [ ] AC2: Given `src/templates/` TypeScript generators, when migration completes, then they're replaced with `renderTemplate()` calls reading from `templates/` <!-- verification: cli-verifiable -->
- [ ] AC3: Given `renderTemplate('templates/dockerfiles/Dockerfile.nodejs', { TARBALL: 'package.tgz' })`, when called, then it returns the same Dockerfile content as the current `nodejsTemplate()` function <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 9 (Template Unification).** Two parallel template systems -> one.

### Target Template Structure (from architecture-v3.md)

```
templates/
  dockerfiles/
    Dockerfile.nodejs           # Was nodejsTemplate() in src/templates/*.ts
    Dockerfile.python
    Dockerfile.rust
    Dockerfile.generic
    Dockerfile.verify           # Node.js verification
    Dockerfile.verify.rust
    Dockerfile.multi-stage.tmpl # Template with {{STAGES}} and {{COPIES}} placeholders
  otlp/
    nodejs.md
    python.md
    rust.md
  compose/
    victoria.yml
    elk.yml
    otel-collector-config.yaml
  prompts/
    ralph-prompt.md             # Was src/templates/ralph-prompt.ts
    verify-prompt.md            # Was src/templates/verify-prompt.ts
    showboat-template.md        # Was src/templates/showboat-template.ts
  docs/
    readme.md.tmpl              # Was src/templates/readme.ts
    agents.md.tmpl              # Was generateAgentsMdContent()
```

### renderTemplate() Function

From architecture-v3.md, in `src/lib/templates.ts`:

```typescript
function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let content = readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}
```

Simple `{{var}}` interpolation. No template engine dependency. No complex logic in templates -- callers compute values and pass them.

### Migration Steps

For each file in `src/templates/`:
1. Extract the template string from the TypeScript function
2. Replace dynamic parts with `{{VARIABLE_NAME}}` placeholders
3. Write as static file in `templates/`
4. Replace the TS function with a `renderTemplate()` call
5. Write a comparison test that verifies identical output

Current TypeScript template files to migrate:
- `src/templates/docker-compose.ts` -> `templates/compose/`
- `src/templates/otel-config.ts` -> `templates/compose/otel-collector-config.yaml`
- `src/templates/ralph-prompt.ts` -> `templates/prompts/ralph-prompt.md`
- `src/templates/verify-prompt.ts` -> `templates/prompts/verify-prompt.md`
- `src/templates/showboat-template.ts` -> `templates/prompts/showboat-template.md`
- `src/templates/readme.ts` -> `templates/docs/readme.md.tmpl`
- `src/templates/bmad-patches.ts` -> evaluate if this is truly a template or code generation

`src/lib/templates.ts` already exists at 50 lines. Add `renderTemplate()` there.

### Multi-stage Dockerfile

`Dockerfile.multi-stage.tmpl` uses `{{BUILD_STAGES}}` and `{{COPY_DIRECTIVES}}` placeholders. The caller composes build stages from per-stack templates:

```typescript
const stages = stacks.map(s => getStackProvider(s).getDockerBuildStage()).join('\n\n');
const copies = stacks.map(s => getStackProvider(s).getRuntimeCopyDirectives()).join('\n');
const dockerfile = renderTemplate('templates/dockerfiles/Dockerfile.multi-stage.tmpl', {
  BUILD_STAGES: stages,
  COPY_DIRECTIVES: copies,
});
```

## Files to Change

- `src/lib/templates.ts` — Add `renderTemplate(path, vars)` function
- `templates/dockerfiles/Dockerfile.nodejs` — Create. Extract from TypeScript template
- `templates/dockerfiles/Dockerfile.python` — Create. Extract from TypeScript template
- `templates/dockerfiles/Dockerfile.rust` — Create. Extract from TypeScript template
- `templates/dockerfiles/Dockerfile.multi-stage.tmpl` — Create. With `{{BUILD_STAGES}}` and `{{COPY_DIRECTIVES}}`
- `templates/prompts/ralph-prompt.md` — Create. Extract from `src/templates/ralph-prompt.ts`
- `templates/prompts/verify-prompt.md` — Create. Extract from `src/templates/verify-prompt.ts`
- `templates/prompts/showboat-template.md` — Create. Extract from `src/templates/showboat-template.ts`
- `templates/docs/readme.md.tmpl` — Create. Extract from `src/templates/readme.ts`
- `templates/compose/victoria.yml` — Create or move from existing location
- `templates/compose/elk.yml` — Create. ELK stack compose
- `templates/compose/otel-collector-config.yaml` — Create. Extract from `src/templates/otel-config.ts`
- `src/templates/ralph-prompt.ts` — Replace with `renderTemplate()` call
- `src/templates/verify-prompt.ts` — Replace with `renderTemplate()` call
- `src/templates/readme.ts` — Replace with `renderTemplate()` call
- `src/templates/showboat-template.ts` — Replace with `renderTemplate()` call
- `src/templates/docker-compose.ts` — Replace with `renderTemplate()` call
- `src/templates/otel-config.ts` — Replace with `renderTemplate()` call
