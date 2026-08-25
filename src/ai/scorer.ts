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
  const system = `You evaluate job opportunities for a candidate. Profile:\n\n${profile}\n\nRespond with valid JSON only: {"score": <1-5 integer>, "reason": "<one short sentence>"}`;
  const prompt = `Company: ${opp.company}\nRole: ${opp.title}\nLocation: ${opp.location ?? "unknown"}`;
  try {
    const raw = await callClaude(apiKey, model, system, prompt, 80);
    const parsed = JSON.parse(raw) as { score: number; reason: string };
    return { score: Math.round(Math.min(5, Math.max(1, parsed.score))), reason: parsed.reason ?? "" };
  } catch {
    return { score: 3, reason: "scoring unavailable" };
  }
}
