import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package root directory — works for both dev (src/) and installed (dist/) layouts. */
export function getPackageRoot(): string {
  // __dirname is src/lib/ in dev or dist/ in installed package
  // Walk up to find the directory containing package.json
  return resolve(__dirname, '..', '..');
}

export function generateFile(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf-8');
}

/**
 * Interpolates `{{VAR}}` placeholders in a template string.
 * Unmatched placeholders are left as-is.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

/**
 * Reads a template file relative to the package root and interpolates `{{VAR}}` placeholders.
 * @param templatePath - Path relative to package root, e.g. 'templates/dockerfiles/Dockerfile.nodejs'
 * @param vars - Key/value pairs for placeholder interpolation
 * @returns The rendered template content
 */
export function renderTemplateFile(templatePath: string, vars: Record<string, string> = {}): string {
  const fullPath = resolve(getPackageRoot(), templatePath);
  const content = readFileSync(fullPath, 'utf-8');
  if (Object.keys(vars).length === 0) return content;
  return renderTemplate(content, vars);
}
