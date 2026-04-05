/**
 * Documentation health report formatting and exec-plan lifecycle.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ok, fail as failFmt, info as infoFmt } from '../output.js';
import type { DocHealthReport } from './types.js';

// ─── Output Formatting ──────────────────────────────────────────────────────

export function formatDocHealthOutput(report: DocHealthReport): string[] {
  const lines: string[] = [];

  for (const doc of report.documents) {
    switch (doc.grade) {
      case 'fresh':
        lines.push(`[OK] ${doc.path}: fresh`);
        break;
      case 'stale':
        lines.push(`[FAIL] ${doc.reason}`);
        break;
      case 'missing':
        lines.push(`[FAIL] ${doc.reason}`);
        break;
    }
  }

  lines.push(
    `[INFO] Doc health: ${report.summary.fresh} fresh, ${report.summary.stale} stale, ${report.summary.missing} missing`,
  );

  return lines;
}

export function printDocHealthOutput(report: DocHealthReport): void {
  for (const doc of report.documents) {
    switch (doc.grade) {
      case 'fresh':
        ok(`${doc.path}: fresh`);
        break;
      case 'stale':
        failFmt(doc.reason);
        break;
      case 'missing':
        failFmt(doc.reason);
        break;
    }
  }

  infoFmt(
    `Doc health: ${report.summary.fresh} fresh, ${report.summary.stale} stale, ${report.summary.missing} missing`,
  );
}

// ─── Exec-Plan Lifecycle ────────────────────────────────────────────────────

export function createExecPlan(storyId: string, dir?: string): string {
  const root = dir ?? process.cwd();
  const activeDir = join(root, 'docs', 'exec-plans', 'active');
  mkdirSync(activeDir, { recursive: true });

  const execPlanPath = join(activeDir, `${storyId}.md`);

  const storyDir = join(root, '_bmad-output', 'implementation-artifacts');
  const storyPath = join(storyDir, `${storyId}.md`);

  let _storyTitle = storyId;
  let acSection = '';
  let taskSection = '';

  if (existsSync(storyPath)) {
    const content = readFileSync(storyPath, 'utf-8');

    const titleMatch = /^#\s+(.+)$/m.exec(content);
    if (titleMatch) {
      _storyTitle = titleMatch[1];
    }

    const acMatch = /## Acceptance Criteria\n([\s\S]*?)(?=\n## |\n<!-- |$)/i.exec(content);
    if (acMatch) {
      acSection = acMatch[1].trim();
    }

    const taskMatch = /## Tasks \/ Subtasks\n([\s\S]*?)(?=\n## |\n<!-- |$)/i.exec(content);
    if (taskMatch) {
      taskSection = taskMatch[1].trim();
    }
  }

  const timestamp = new Date().toISOString();
  const execPlanContent = [
    '<!-- DO NOT EDIT MANUALLY — managed by codeharness -->',
    `# Exec Plan: ${storyId}`,
    '',
    'Status: active',
    `Created: ${timestamp}`,
    '',
    '## Acceptance Criteria',
    '',
    acSection || '_No acceptance criteria extracted_',
    '',
    '## Task Checklist',
    '',
    taskSection || '_No tasks extracted_',
    '',
  ].join('\n');

  writeFileSync(execPlanPath, execPlanContent, 'utf-8');
  return execPlanPath;
}

export function completeExecPlan(storyId: string, dir?: string): string | null {
  const root = dir ?? process.cwd();
  const activePath = join(root, 'docs', 'exec-plans', 'active', `${storyId}.md`);

  if (!existsSync(activePath)) {
    return null;
  }

  let content = readFileSync(activePath, 'utf-8');

  content = content.replace(/^Status:\s*active$/m, 'Status: completed');

  const timestamp = new Date().toISOString();
  content = content.replace(
    /^(Created:\s*.+)$/m,
    `$1\nCompleted: ${timestamp}`,
  );

  const completedDir = join(root, 'docs', 'exec-plans', 'completed');
  mkdirSync(completedDir, { recursive: true });

  const completedPath = join(completedDir, `${storyId}.md`);
  writeFileSync(completedPath, content, 'utf-8');

  try {
    unlinkSync(activePath);
  } catch {
    // IGNORE: best-effort removal of active exec-plan
  }

  return completedPath;
}

export function getExecPlanStatus(
  storyId: string,
  dir?: string,
): 'active' | 'completed' | 'missing' {
  const root = dir ?? process.cwd();

  if (existsSync(join(root, 'docs', 'exec-plans', 'active', `${storyId}.md`))) {
    return 'active';
  }
  if (existsSync(join(root, 'docs', 'exec-plans', 'completed', `${storyId}.md`))) {
    return 'completed';
  }
  return 'missing';
}
