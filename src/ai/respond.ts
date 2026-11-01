import type { ChatTurn, Llm } from "./llm.js";
import type { Opportunity } from "../types.js";

export interface RespondResult {
  reply: string;
}

export async function respond(
  userMessage: string,
  recentDrops: Map<string, Opportunity>,
  profile: string,
  llm: Llm,
  history: ChatTurn[] = [],
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
- If the user states a preference, criterion, or correction (e.g. "only send me X", "filter out Y", "I'm class of 2029", "my stack is...") → you cannot act on it. Say so plainly, e.g. "i can't change that from here. edit config/profile.md on the laptop and it takes effect on the next scan."
- If the user is asking about a specific role or asking you to evaluate something → do that.
- If the user asks what you've posted or what's relevant → summarize from the feed above.
- General questions → answer directly.

## what you cannot do
You can only reply with text. You cannot change the profile, the filters, the scoring, or what gets posted, and you cannot send anything to Dossier. Never say you updated, saved, changed, or will do any of those things.

## important: what you can and cannot see
You only have the role title, company, and location from the feed — NOT the full job description. You cannot see class year requirements or comp details unless they appear in the title. Say so when relevant instead of guessing.

## response format
Respond ONLY with valid JSON — no text outside it:
{
  "reply": "<your response, markdown ok, be concise>"
}`;

  return llm.json(
    system,
    userMessage,
    (v) => {
      const o = v as { reply?: unknown } | null;
      return typeof o?.reply === "string" && o.reply.trim() ? { reply: o.reply.trim() } : null;
    },
    700,
    history,
  );
}
