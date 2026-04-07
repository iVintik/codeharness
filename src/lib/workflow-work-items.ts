/**
 * Work item loading — reads sprint-status.yaml and issues.yaml
 * to build the ordered list of work items for workflow execution.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { warn } from './output.js';
import type { WorkItem } from './workflow-types.js';

export function loadWorkItems(sprintStatusPath: string, issuesPath?: string): WorkItem[] {
  const items: WorkItem[] = [];
  if (existsSync(sprintStatusPath)) {
    let raw: string;
    try { raw = readFileSync(sprintStatusPath, 'utf-8'); }
    catch { // IGNORE: file read failure, warn and return empty list
      warn(`workflow-machine: could not read sprint-status.yaml at ${sprintStatusPath}`); return items;
    }
    let parsed: unknown;
    try { parsed = parse(raw); }
    catch { // IGNORE: YAML parse failure, warn and return empty list
      warn(`workflow-machine: invalid YAML in sprint-status.yaml at ${sprintStatusPath}`); return items;
    }
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const devStatus = data.development_status as Record<string, unknown> | undefined;
      if (devStatus && typeof devStatus === 'object') {
        for (const [key, status] of Object.entries(devStatus)) {
          if (key.startsWith('epic-')) continue;
          if (key.endsWith('-retrospective')) continue;
          if (status === 'backlog' || status === 'ready-for-dev' || status === 'in-progress')
            items.push({ key, source: 'sprint' });
        }
      }
    }
  }
  if (issuesPath && existsSync(issuesPath)) {
    let raw: string;
    try { raw = readFileSync(issuesPath, 'utf-8'); }
    catch { // IGNORE: file read failure, warn and return items collected so far
      warn(`workflow-machine: could not read issues.yaml at ${issuesPath}`); return items;
    }
    let parsed: unknown;
    try { parsed = parse(raw); }
    catch { // IGNORE: YAML parse failure, warn and return items collected so far
      warn(`workflow-machine: invalid YAML in issues.yaml at ${issuesPath}`); return items;
    }
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const issuesList = data.issues as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(issuesList)) {
        for (const issue of issuesList) {
          if (issue && typeof issue === 'object') {
            const status = issue.status as string | undefined;
            if (status === 'backlog' || status === 'ready-for-dev' || status === 'in-progress')
              items.push({ key: issue.id as string, title: issue.title as string | undefined, source: 'issues' });
          }
        }
      }
    }
  }
  return items;
}
