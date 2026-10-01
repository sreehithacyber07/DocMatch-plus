// Pure TypeScript — no React imports.
// Same inputs always produce the same outputs (no side effects).

import { decisionNodes, specialistRules } from '../data/decisionTree.ts';
import type { DecisionNode, RoutingResult } from '../types/index.ts';

// ─── Node lookup ──────────────────────────────────────────────────────────────

export function getNodeById(id: string): DecisionNode | undefined {
  return decisionNodes.find((n) => n.id === id);
}

// ─── Keyword matching ─────────────────────────────────────────────────────────
// A keyword matches if it appears as a substring of `questionId` or `answerValue`,
// OR if `questionId` or `answerValue` appears as a substring of the keyword
// (bidirectional, case-insensitive). This handles e.g. 'breathlessness' matching
// the question id 'breathless'.

function keywordMatches(keyword: string, questionId: string, answerValue: string): boolean {
  const k = keyword.toLowerCase();
  const q = questionId.toLowerCase();
  const a = answerValue.toLowerCase();
  return q.includes(k) || a.includes(k) || k.includes(q) || k.includes(a);
}

// ─── getQuestionSequence ──────────────────────────────────────────────────────
// Traverses the decision tree from the region-appropriate start node, following
// getNextNode (dynamic) or options[0].nextNodeId (default static branch) to build
// an ordered list of up to 8 question IDs to ask.
// At least one emergency-category node is always guaranteed in the result.

export function getQuestionSequence(
  regionIds: string[],
  answers: Record<string, string>
): string[] {
  const sequence: string[] = [];
  const visited = new Set<string>();

  // All flows start at pain_character. Region context shapes branches via
  // getNextNode on the severity node (and others that inspect regionIds).
  let currentId: string | null = 'pain_character';

  while (currentId !== null && sequence.length < 8) {
    if (visited.has(currentId)) break;

    const node = getNodeById(currentId);
    if (!node) break;

    sequence.push(currentId);
    visited.add(currentId);

    // Resolve next node -------------------------------------------------------
    if (node.getNextNode) {
      currentId = node.getNextNode(answers, regionIds);
    } else {
      // Static: use the matching option's nextNodeId, or the first option as
      // the default path when the question hasn't been answered yet.
      const answerValue = answers[currentId];
      const matchedOption = answerValue
        ? node.options?.find((o) => o.value === answerValue)
        : undefined;
      const nextId = (matchedOption ?? node.options?.[0])?.nextNodeId ?? null;
      // nextNodeId is typed as string but tree uses null for terminal nodes;
      // treat empty string as null too.
      currentId = nextId && nextId.length > 0 ? nextId : null;
    }
  }

  // Guarantee at least one emergency-category node ---------------------------
  const hasEmergency = sequence.some(
    (id) => getNodeById(id)?.category === 'emergency'
  );
  if (!hasEmergency) {
    if (sequence.length < 8) {
      sequence.push('emergency_screening');
    } else {
      // Replace the last non-answered question with the emergency screen
      sequence[sequence.length - 1] = 'emergency_screening';
    }
  }

  return sequence.slice(0, 8);
}

// ─── calculateRouting ────────────────────────────────────────────────────────
// Scores each specialist rule against the provided answers and regions, then
// normalises to a 0–100 confidence value for the top match.
//
// Scoring:
//   • keyword match → rule.weight × node.severityWeight × severityBoost
//   • region match  → rule.weight × REGION_BASE (30)
//
// severityBoost = 2.5 if severity≥8, 1.5 if ≥5, else 1.0  (amplifies
// the signal when the patient is in significant pain).
//
// If the top raw score < 40 we defer to General Physician (low confidence).

const REGION_BASE = 30;

export function calculateRouting(
  answers: Record<string, string>,
  regions: string[]
): RoutingResult {
  const severityRaw = parseInt(answers['severity'] ?? '0', 10);
  const severityBoost =
    severityRaw >= 8 ? 2.5 : severityRaw >= 5 ? 1.5 : 1.0;

  const rawScores: Record<string, number> = {};

  for (const rule of specialistRules) {
    let score = 0;

    // ── Keyword matching ─────────────────────────────────────────────────────
    for (const keyword of rule.keywords) {
      // Find the FIRST answer that matches this keyword (count each keyword once)
      for (const [qId, qValue] of Object.entries(answers)) {
        if (qId === 'severity') continue; // severity is a modifier, not a keyword match
        if (keywordMatches(keyword, qId, qValue)) {
          const node = getNodeById(qId);
          score += rule.weight * (node?.severityWeight ?? 5) * severityBoost;
          break;
        }
      }
    }

    // ── Region matching ──────────────────────────────────────────────────────
    for (const regionId of rule.regions) {
      if (regions.includes(regionId)) {
        score += rule.weight * REGION_BASE;
      }
    }

    rawScores[rule.specialist] = score;
  }

  // Sort highest-to-lowest
  const sorted = Object.entries(rawScores).sort((a, b) => b[1] - a[1]);
  const [[topSpecialist, topScore], ...rest] = sorted;
  const alternatives = rest.slice(0, 2).map(([s]) => s);
  const confidence = Math.min(100, Math.round(topScore));

  // Low-confidence fallback
  if (confidence < 40) {
    return {
      recommendedSpecialist: 'General Physician',
      confidence,
      alternatives: [topSpecialist, ...alternatives.slice(0, 1)],
    };
  }

  return { recommendedSpecialist: topSpecialist, confidence, alternatives };
}
