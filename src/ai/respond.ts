import { callClaude } from "./claude.js";
import type { Opportunity } from "../types.js";

export interface RespondResult {
  reply: string;
  profileUpdate?: string; // set when the user gave new preferences to persist
}

export async function respond(
  userMessage: string,
  recentDrops: Map<string, Opportunity>,
  profile: string,
  apiKey: string,
  model: string,
): Promise<RespondResult> {
  const dropsList = [...recentDrops.values()]
    .map((o, i) => `${i + 1}. ${o.company} — ${o.title}${o.location ? ` (${o.location})` : ""}\n   ${o.url}`)
    .join("\n");

  const system = `You are modus, a personal job-search assistant in Discord. You help one specific user manage their internship search.

## candidate profile
${profile || "(no profile yet)"}

## drops currently in the feed (what you've posted recently)
${dropsList || "none posted yet"}

## how to interpret messages
- If the user is telling you their preferences, criteria, or corrections (e.g. "only send me X", "filter out Y", "I'm class of 2029", "my stack is...") → treat it as a profile update, not a request to vet specific items. Update the profile accordingly.
- If the user is asking about a specific role or asking you to evaluate something → do that.
- If the user asks what you've posted or what's relevant → summarize from the feed above.
- General questions → answer directly.

## important: what you can and cannot see
You only have the role title, company, and location from the feed — NOT the full job description. You cannot see class year requirements or comp details unless they appear in the title. Say so when relevant instead of guessing.

## response format
Respond ONLY with valid JSON — no text outside it:
{
  "reply": "<your response, markdown ok, be concise>",
  "profileUpdate": "<only if the user gave new preferences to remember — write a concise summary of what changed to append to their profile. omit this field entirely if no profile update.>"
}`;

  const raw = await callClaude(apiKey, model, system, userMessage, 700);

  try {
    const parsed = JSON.parse(raw) as { reply?: string; profileUpdate?: string };
    return {
      reply: parsed.reply?.trim() ?? raw.trim(),
      profileUpdate: parsed.profileUpdate?.trim() || undefined,
    };
  } catch {
    // model didn't return valid JSON — just use the raw text
    return { reply: raw.trim() };
  }
}
