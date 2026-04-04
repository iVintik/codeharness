/** Proof quality validation and black-box enforcement. */
import { existsSync, readFileSync } from 'node:fs';
import type { ProofQuality, ClassifiedCommand, EvidenceCommandType, BlackBoxEnforcementResult } from './types.js';

/** Extracts commands from ```bash/```shell blocks and classifies each. */
export function classifyEvidenceCommands(proofContent: string): ClassifiedCommand[] {
  const results: ClassifiedCommand[] = [];

  const codeBlockPattern = /```(?:bash|shell)\n([\s\S]*?)```/g;
  for (const match of proofContent.matchAll(codeBlockPattern)) {
    const block = match[1].trim();
    const lines = block.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cmd = line.trim();
      if (!cmd) continue;
      results.push({ command: cmd, type: classifyCommand(cmd) });
    }
  }

  return results;
}

function classifyCommand(cmd: string): EvidenceCommandType {
  if (/docker\s+exec\b/.test(cmd)) {
    return 'docker-exec';
  }

  if (/docker\s+(ps|logs|inspect|stats|top|port)\b/.test(cmd)) {
    return 'docker-host';
  }

  if (/curl\b/.test(cmd) && /localhost:(9428|8428|16686)\b/.test(cmd)) {
    return 'observability';
  }

  if (/\bgrep\b/.test(cmd) && /\bsrc\//.test(cmd)) {
    return 'grep-src';
  }

  return 'other';
}

/** Checks black-box enforcement: rejects >50% grep src/ or missing docker exec per AC. */
export function checkBlackBoxEnforcement(proofContent: string): BlackBoxEnforcementResult {
  const commands = classifyEvidenceCommands(proofContent);

  const grepSrcCount = commands.filter(c => c.type === 'grep-src').length;
  const dockerExecCount = commands.filter(c => c.type === 'docker-exec').length;
  const observabilityCount = commands.filter(c => c.type === 'observability').length;
  const otherCount = commands.filter(c => c.type === 'other').length;
  const totalCommands = commands.length;

  const grepRatio = totalCommands > 0 ? grepSrcCount / totalCommands : 0;

  // Check per-AC docker exec presence
  const acsMissingDockerExec: number[] = [];
  const acHeaderPattern = /^## AC ?(\d+):/gm;
  const acMatches = [...proofContent.matchAll(acHeaderPattern)];

  if (acMatches.length > 0) {
    for (let i = 0; i < acMatches.length; i++) {
      const acNum = parseInt(acMatches[i][1], 10);
      const start = acMatches[i].index!;
      const end = i + 1 < acMatches.length ? acMatches[i + 1].index! : proofContent.length;
      const section = proofContent.slice(start, end);

      // Skip escalated ACs
      if (section.includes('[ESCALATE]')) continue;

      const sectionCommands = classifyEvidenceCommands(section);
      const hasBlackBoxEvidence = sectionCommands.some(c =>
        c.type === 'docker-exec' || c.type === 'docker-host' || c.type === 'observability'
      );
      if (!hasBlackBoxEvidence) {
        acsMissingDockerExec.push(acNum);
      }
    }
  }

  const grepTooHigh = grepRatio > 0.5;
  const missingDockerExec = acsMissingDockerExec.length > 0;
  const hasExtractableCommands = totalCommands > 0;

  return {
    blackBoxPass: !hasExtractableCommands || (!grepTooHigh && !missingDockerExec),
    grepSrcCount,
    dockerExecCount,
    observabilityCount,
    otherCount,
    grepRatio,
    acsMissingDockerExec,
  };
}

/** Checks if [FAIL] appears outside code blocks and inline code. */
function hasFailVerdict(section: string): boolean {
  return section.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '').includes('[FAIL]');
}

/** Validates proof quality. `passed` is true when `pending === 0 && verified > 0`. */
export function validateProofQuality(proofPath: string): ProofQuality {
  const emptyResult: ProofQuality = {
    verified: 0, pending: 0, escalated: 0, total: 0, passed: false,
    grepSrcCount: 0, dockerExecCount: 0, observabilityCount: 0, otherCount: 0,
    blackBoxPass: false,
  };

  if (!existsSync(proofPath)) {
    return emptyResult;
  }

  const content = readFileSync(proofPath, 'utf-8');

  // Compute black-box enforcement metrics once
  const bbEnforcement = checkBlackBoxEnforcement(content);

  /** Helper: merge base counts with black-box metrics */
  function buildResult(base: {
    verified: number; pending: number; escalated: number; total: number;
  }): ProofQuality {
    const basePassed = base.pending === 0 && base.verified > 0;
    return {
      ...base,
      passed: basePassed && bbEnforcement.blackBoxPass,
      grepSrcCount: bbEnforcement.grepSrcCount,
      dockerExecCount: bbEnforcement.dockerExecCount,
      observabilityCount: bbEnforcement.observabilityCount,
      otherCount: bbEnforcement.otherCount,
      blackBoxPass: bbEnforcement.blackBoxPass,
    };
  }

  // Format 1: ## AC N: section headers
  const acHeaderPattern = /^## AC ?(\d+):/gm;
  const matches = [...content.matchAll(acHeaderPattern)];

  // Find all ## headings that are NOT AC headers (e.g. ## Summary, ## Test Evidence)
  // These bound the last AC section so it doesn't bleed into trailing sections
  const nonAcHeadingPattern = /^## (?!AC ?\d+:)/gm;
  const nonAcHeadings = [...content.matchAll(nonAcHeadingPattern)].map(m => m.index!);

  let verified = 0;
  let pending = 0;
  let escalated = 0;

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      // End at the next ## AC header or any non-AC ## heading (e.g. ## Summary), whichever comes first
      const nextAcEnd = i + 1 < matches.length ? matches[i + 1].index! : content.length;
      const nextNonAcHeading = nonAcHeadings.find(h => h > start);
      const end = nextNonAcHeading !== undefined && nextNonAcHeading < nextAcEnd
        ? nextNonAcHeading
        : nextAcEnd;
      const section = content.slice(start, end);

      if (section.includes('[ESCALATE]')) {
        escalated++;
        continue;
      }

      if (hasFailVerdict(section)) {
        pending++;
        continue;
      }

      const hasEvidence =
        section.includes('<!-- /showboat exec -->') ||
        section.includes('<!-- showboat image:') ||
        /```(?:bash|shell)\n[\s\S]*?```\n+```output\n/m.test(section);

      if (hasEvidence) {
        verified++;
      } else {
        pending++;
      }
    }
  } else {
    // Format 2: showboat native — inline --- ACN: markers
    const inlineAcPattern = /--- AC ?(\d+):/g;
    const inlineMatches = [...content.matchAll(inlineAcPattern)];
    const acNumbers = new Set(inlineMatches.map(m => m[1]));

    if (acNumbers.size === 0) {
      // Format 3: narrative proofs with === AC N: markers
      const narrativeAcPattern = /=== AC ?(\d+):/g;
      const narrativeMatches = [...content.matchAll(narrativeAcPattern)];
      const narrativeAcNumbers = new Set(narrativeMatches.map(m => m[1]));

      if (narrativeAcNumbers.size === 0) {
        // Format 4: bullet-list AC summaries
        const bulletAcPattern = /^- AC ?(\d+)[^:\n]*:/gm;
        const bulletMatches = [...content.matchAll(bulletAcPattern)];
        const bulletAcNumbers = new Set(bulletMatches.map(m => m[1]));

        if (bulletAcNumbers.size === 0) {
          return buildResult({ verified: 0, pending: 0, escalated: 0, total: 0 });
        }

        let bVerified = 0;
        let bPending = 0;
        let bEscalated = 0;

        for (const acNum of bulletAcNumbers) {
          const bulletPattern = new RegExp(`^- AC ?${acNum}[^:\\n]*:(.*)$`, 'm');
          const bulletMatch = content.match(bulletPattern);
          if (!bulletMatch) { bPending++; continue; }

          const bulletText = bulletMatch[1].toLowerCase();
          if (bulletText.includes('n/a') || bulletText.includes('escalat') || bulletText.includes('superseded')) {
            bEscalated++;
          } else if (bulletText.includes('fail')) {
            bPending++;
          } else {
            bVerified++;
          }
        }

        const hasAnyEvidence = /```output\n/m.test(content);
        if (!hasAnyEvidence) {
          bPending += bVerified;
          bVerified = 0;
        }

        const bTotal = bVerified + bPending + bEscalated;
        return buildResult({
          verified: bVerified,
          pending: bPending,
          escalated: bEscalated,
          total: bTotal,
        });
      }

      // Sort AC markers by position for region-based analysis
      const sortedAcs = narrativeMatches
        .map(m => ({ num: m[1], idx: m.index! }))
        .filter((v, i, a) => a.findIndex(x => x.num === v.num) === i)
        .sort((a, b) => a.idx - b.idx);

      for (let i = 0; i < sortedAcs.length; i++) {
        const regionStart = i > 0 ? sortedAcs[i - 1].idx : 0;
        const regionEnd = i + 1 < sortedAcs.length ? sortedAcs[i + 1].idx : content.length;
        const section = content.slice(regionStart, regionEnd);

        if (section.includes('[ESCALATE]')) {
          escalated++;
        } else if (hasFailVerdict(section)) {
          pending++;
        } else if (/```output/m.test(section)) {
          verified++;
        } else {
          pending++;
        }
      }

      const narrativeTotal = verified + pending + escalated;
      return buildResult({
        verified,
        pending,
        escalated,
        total: narrativeTotal,
      });
    }

    for (const acNum of acNumbers) {
      const acPattern2 = new RegExp(`--- AC ?${acNum}:`, 'g');
      const acIdx = content.search(acPattern2);
      if (acIdx === -1) { pending++; continue; }

      const nextAcPattern = new RegExp(`--- AC ?(?!${acNum})\\d+:`, 'g');
      nextAcPattern.lastIndex = acIdx + 1;
      const nextMatch = nextAcPattern.exec(content);
      const section = content.slice(acIdx, nextMatch ? nextMatch.index : content.length);

      if (section.includes('[ESCALATE]')) {
        escalated++;
      } else if (hasFailVerdict(section)) {
        pending++;
      } else if (/```output\n/m.test(section)) {
        verified++;
      } else {
        pending++;
      }
    }
  }

  const total = verified + pending + escalated;
  return buildResult({ verified, pending, escalated, total });
}

/** @deprecated Use `validateProofQuality()` instead. */
export function proofHasContent(proofPath: string): boolean {
  return validateProofQuality(proofPath).passed;
}
