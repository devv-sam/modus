import type { DiscordBot } from "./discord/bot.js";
import type { Opportunity } from "./types.js";

// above this many good roles, the best get an embed each and the rest one summary
export const MAX_INDIVIDUAL_POSTS = 10;

export async function announce(bot: DiscordBot, toPost: Opportunity[]): Promise<void> {
  const ranked = [...toPost].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
  for (const opp of ranked.slice(0, MAX_INDIVIDUAL_POSTS)) await bot.postOpportunity(opp);

  const rest = ranked.slice(MAX_INDIVIDUAL_POSTS);
  if (rest.length === 0) return;
  const lines = rest.slice(0, 10).map((o) => `• ${o.company} — ${o.title} (fit ${o.fit ?? "?"}/5)\n  ${o.url}`).join("\n");
  await bot.postSummary(`${rest.length} more good roles:\n${lines}${rest.length > 10 ? `\n…and ${rest.length - 10} more` : ""}`);
}
