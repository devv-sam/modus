import { callClaude } from "./claude.js";
import type { Opportunity } from "../types.js";

export interface ScoreResult {
  score: number; // 1-5
  reason: string;
}

export async function scoreOpportunity(
  opp: Opportunity,
  profile: string,
  apiKey: string,
  model: string,
): Promise<ScoreResult> {
  const system = `You are a strict relevance filter for a job search. Score how well this role matches the candidate.

## candidate profile
${profile}

## scoring rules
- Score 1-2: obvious mismatch (wrong domain, wrong level, location dealbreaker, role type they explicitly want to avoid)
- Score 3: neutral / unclear fit
- Score 4-5: strong match on domain, level, and location preferences

Note: you only see the role title, company, and location — NOT the full job description. Be strict based on what you can see. If the title suggests a domain mismatch (e.g. trading/finance for a SWE candidate, pure ops for an engineering candidate), score low.

Respond with valid JSON only: {"score": <1-5 integer>, "reason": "<one short sentence>"}`;

  const prompt = `Company: ${opp.company}\nRole: ${opp.title}\nLocation: ${opp.location ?? "unknown"}`;

  try {
    const raw = await callClaude(apiKey, model, system, prompt, 80);
    const parsed = JSON.parse(raw) as { score: number; reason: string };
    return { score: Math.round(Math.min(5, Math.max(1, parsed.score))), reason: parsed.reason ?? "" };
  } catch {
    return { score: 3, reason: "scoring unavailable" };
  }
}
