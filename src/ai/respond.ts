import { callClaude } from "./claude.js";
import type { Opportunity } from "../types.js";

export async function respond(
  userMessage: string,
  recentDrops: Map<string, Opportunity>,
  profile: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const dropsList = [...recentDrops.values()]
    .map((o, i) => `${i + 1}. ${o.company} — ${o.title}${o.location ? ` (${o.location})` : ""}\n   ${o.url}`)
    .join("\n");

  const system = `You are modus, a personal job-search assistant running in Discord.

## candidate profile
${profile}

## drops in the current feed
${dropsList || "none posted yet this session"}

## response guide
- apply request → 1-5 match score + one-line reason, 2-3 sentence pitch tailored to the profile, one watch-out, apply URL
- skip → one line acknowledgement
- more like this → confirm the signal you're logging (one line)
- anything else → answer directly

Be concise and direct. No corporate tone.`;

  return callClaude(apiKey, model, system, userMessage, 600);
}
