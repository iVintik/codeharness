# Story 15-2: ESLint no-empty-catch + Boundary Tests

## Status: backlog

## Story

As a developer,
I want automated enforcement of error handling and module boundaries,
So that architectural rules aren't just documented but enforced.

## Acceptance Criteria

- [ ] AC1: Given ESLint runs, when a catch block is empty (no `// IGNORE:` comment), then it reports an error <!-- verification: cli-verifiable -->
- [ ] AC2: Given a boundary test scans `src/`, when it finds `stack === 'nodejs'` outside `src/lib/stacks/`, then the test fails <!-- verification: cli-verifiable -->
- [ ] AC3: Given a boundary test scans module imports, when a module imports from another module's internal file (not index.ts), then the test fails <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 7 (Error Handling)** and **NFR3/NFR4/NFR6** enforcement.

### ESLint no-empty-catch (AC1)

ESLint's built-in `no-empty` rule catches empty blocks but doesn't require `// IGNORE:` comments. Options:

1. **Use `no-empty` rule** with `allowEmptyCatch: false` (default). This catches `catch {}` but doesn't enforce the comment.
2. **Custom ESLint rule** that allows catch blocks with `// IGNORE:` comments but fails on truly empty catches or catches with only a comment that doesn't start with `// IGNORE:`.

Recommended: Option 2. Create a local ESLint rule or use `eslint-plugin-local-rules`:

```javascript
// In eslint config
rules: {
  'no-empty': ['error', { allowEmptyCatch: false }],
  // Plus a custom check that catch blocks either rethrow, return Result.fail(), or have // IGNORE: comment
}
```

The 53 existing bare `catch {}` blocks need to be audited. Each must either:
- Add an `// IGNORE: reason` comment explaining why the error is non-fatal
- Be converted to `Result.fail()` returns
- Rethrow the error

### Stack Conditional Boundary Test (AC2)

Create `src/lib/stacks/__tests__/boundary.test.ts` (also referenced in story 10-5):

```typescript
test('no stack conditionals outside src/lib/stacks/', () => {
  const srcFiles = glob.sync('src/**/*.ts', { ignore: ['src/lib/stacks/**'] });
  const violations = srcFiles.filter(file => {
    const content = readFileSync(file, 'utf-8');
    return /stack\s*===\s*['"](?:nodejs|python|rust)['"]/.test(content);
  });
  expect(violations).toEqual([]);
});
```

### Module Import Boundary Test (AC3)

Create `src/__tests__/boundaries.test.ts`:

```typescript
test('no cross-module internal imports', () => {
  // Modules: src/modules/*, src/lib/coverage/, src/lib/docker/, etc.
  // Rule: external consumers import from index.ts only
  const violations = findCrossModuleInternalImports();
  expect(violations).toEqual([]);
});
```

Check that imports from domain directories use the barrel export (`src/lib/coverage/index.ts`) not internal files (`src/lib/coverage/parser.ts`).

### NFR enforcement mapping

| NFR | Enforcement | Location |
|-----|-------------|----------|
| NFR3 | ESLint no-empty-catch | `.eslintrc` or `eslint.config.js` |
| NFR4 | Boundary test | `src/lib/stacks/__tests__/boundary.test.ts` |
| NFR6 | Boundary test | `src/__tests__/boundaries.test.ts` |

## Files to Change

- `.eslintrc.json` or `eslint.config.js` — Add/configure `no-empty` rule with `allowEmptyCatch: false`. Add custom rule if using local rules plugin
- `src/lib/stacks/__tests__/boundary.test.ts` — Create. Test that no stack conditionals exist outside `src/lib/stacks/`
- `src/__tests__/boundaries.test.ts` — Create. Test that module imports only go through index.ts facades
- All files with bare `catch {}` blocks — Audit and add `// IGNORE:` comments or convert to proper error handling (53 locations)
