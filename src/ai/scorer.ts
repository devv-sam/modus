import type { Llm } from "./llm.js";
import type { Opportunity } from "../types.js";

export interface ScoreResult {
  fit: number; // 1-5
  reason: string;
  deadline: string | null;
}

function validate(v: unknown): ScoreResult | null {
  const o = v as { fit?: unknown; reason?: unknown; deadline?: unknown } | null;
  if (typeof o?.fit !== "number" || !Number.isInteger(o.fit) || o.fit < 1 || o.fit > 5) return null;
  if (typeof o.reason !== "string" || !o.reason.trim()) return null;
  if (o.deadline !== null && typeof o.deadline !== "string") return null;
  return { fit: o.fit, reason: o.reason.trim(), deadline: o.deadline?.trim() || null };
}

export async function scoreOpportunity(opp: Opportunity, profile: string, llm: Llm): Promise<ScoreResult> {
  const system = `You are a strict relevance filter for a job search. Rate how well a role fits the candidate.

## candidate profile
${profile}

## fit scale
- 1-2: obvious mismatch (wrong domain, wrong level, location dealbreaker, role type they want to avoid)
- 3: neutral or unclear
- 4-5: strong match on domain, level, and location

You only see the title, company, and location, not the job description. Judge only what is visible. If the title suggests a domain mismatch (e.g. trading for a SWE candidate), score low.

Reply with a single JSON object and nothing else:
{"fit": <integer 1-5>, "reason": "<one short sentence>", "deadline": <string if a deadline appears in the input, otherwise null>}`;

  const prompt = `Company: ${opp.company}\nRole: ${opp.title}\nLocation: ${opp.location ?? "unknown"}`;
  return llm.json(system, prompt, validate, 120);
}
