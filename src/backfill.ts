import { loadConfig, loadProfile } from "./config.js";
import { runSource } from "./sources/index.js";
import { applyFilter } from "./filter.js";
import { DiscordBot } from "./discord/bot.js";
import { Dossier } from "./dossier/client.js";
import { isConnected } from "./dossier/auth.js";
import { Llm } from "./ai/llm.js";
import { scoreOpportunity } from "./ai/scorer.js";
import { announce } from "./announce.js";
import type { Opportunity } from "./types.js";

// One-off: score roles posted in the last N days that modus never showed (e.g. after downtime) and post the good ones.
// Stop the modus task first: two bots on one token would both answer button clicks.

const days = Number(process.argv[2] ?? 2);
const MAX_SCORING_FAILURES = 3;

const postedMs = (opp: Opportunity): number => {
  const n = Number(opp.postedAt);
  return n > 1e12 ? n : n * 1000;
};

async function main(): Promise<void> {
  const cfg = loadConfig();
  const profile = loadProfile();
  if (!profile) throw new Error("No config/profile.md: nothing to score against.");

  const llm = new Llm(cfg.ollamaUrl, cfg.ollamaModel);
  const dossier = isConnected() ? new Dossier(cfg.dossierUrl, cfg.dossierPublicUrl) : null;
  const bot = new DiscordBot(cfg.discordToken, cfg.discordChannelId, cfg.discordUserId, llm, dossier);
  await bot.start();

  const scanned = (await Promise.all(cfg.sources.map((source) => runSource(source)))).flat();
  const cutoff = Date.now() - days * 86_400_000;
  const candidates = applyFilter(scanned, cfg.filter).filter((opp) => postedMs(opp) >= cutoff && !bot.knows(opp.id));
  console.log(`${candidates.length} roles posted in the last ${days} days and not shown yet. Scoring.`);

  const good: Opportunity[] = [];
  let failures = 0;
  for (const [index, opp] of candidates.entries()) {
    if (failures >= MAX_SCORING_FAILURES) throw new Error(`Scoring stopped after ${failures} failures at ${index}/${candidates.length}.`);
    try {
      const { fit, reason, deadline } = await scoreOpportunity(opp, profile, llm);
      failures = 0;
      if (fit >= cfg.scoreThreshold) good.push({ ...opp, fit, reason, deadline });
    } catch (err) {
      failures++;
      console.error(`Scoring failed for ${opp.company} — ${opp.title}: ${(err as Error).message}`);
    }
  }

  console.log(`${good.length} of ${candidates.length} scored ${cfg.scoreThreshold}+.`);
  if (good.length > 0) {
    await bot.postSummary(`catching up: ${good.length} good roles from the last ${days} days that I hadn't shown you.`);
    await announce(bot, good);
  }
  await bot.stop();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`Backfill failed: ${(err as Error).message}`);
    process.exit(1);
  },
);
