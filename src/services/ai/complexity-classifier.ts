/**
 * Complexity Classifier — Zero-Latency Heuristic Router
 *
 * Classifies user messages by complexity to pick the right model tier.
 * Pure regex + word count — no AI call, runs in <1ms.
 *
 * simple  → Gemini Flash  ($0.15/1M) — greetings, yes/no, quick lookups
 * medium  → Kimi K2.5     ($0.60/1M) — scheduling, summaries, standard queries
 * complex → DeepSeek V3.2 ($0.28/1M) — analysis, multi-step planning, reasoning
 */

import type { AgentRole } from '../../config/modelTiers';

export type ComplexityLevel = 'simple' | 'medium' | 'complex';

const SIMPLE_PATTERNS = [
  /^(hi|hey|hello|good morning|good evening|good night|thanks|thank you|thx|ok|okay|yes|no|sure|got it|cool|nice|great|perfect|sounds good|yep|nope|bye|goodbye)/i,
  /^what('s| is) (the )?(time|date|day)/i,
  /^(how are you|what's up|how's it going|how's everything)/i,
  /^(remind me|set a reminder|what's next|what's today)/i,
  /^(show me|list|what are my) (tasks|habits|events|meetings)/i,
];

const COMPLEX_PATTERNS = [
  /\b(analyze|analysis|compare|evaluate|strategy|strategic|plan|breakdown|deep dive|assess)\b/i,
  /\b(why should|what if|trade.?off|pros? and cons?|recommend|advise on)\b/i,
  /\b(multi.?step|step.?by.?step|create a plan|build a|design a|architect)\b/i,
  /\b(prioritize|optimize|forecast|project|model|scenario)\b/i,
  /\b(review|audit|investigate|research|explore options)\b/i,
  /\b(write a|draft a|compose a|prepare a).{20,}/i,
];

/**
 * Classify message complexity using pure heuristics.
 * Returns simple/medium/complex in <1ms with no external calls.
 */
export function classifyComplexity(message: string): ComplexityLevel {
  const trimmed = message.trim();

  // Very short messages are almost always simple
  if (trimmed.length < 15) return 'simple';

  // Check simple patterns first (cheap to match)
  if (SIMPLE_PATTERNS.some((p) => p.test(trimmed))) return 'simple';

  // Check complex patterns
  if (COMPLEX_PATTERNS.some((p) => p.test(trimmed))) return 'complex';

  // Word count heuristic
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 8) return 'simple';
  if (wordCount >= 40) return 'complex';

  // Default to medium — same model as current behavior (no regression)
  return 'medium';
}

/**
 * Map complexity level to the appropriate model tier role.
 */
export function complexityToRole(complexity: ComplexityLevel): AgentRole {
  switch (complexity) {
    case 'simple':
      return 'fast';
    case 'medium':
      return 'ea';
    case 'complex':
      return 'reasoner';
  }
}
