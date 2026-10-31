import { loadConfig, loadProfile } from "./config.js";
import { runSource } from "./sources/index.js";
import { applyFilter } from "./filter.js";
import { loadSeen, diff, saveSeen } from "./dedupe.js";
import { DiscordBot } from "./discord/bot.js";
import { queueApply, recordInterest } from "./triage.js";
import { Llm } from "./ai/llm.js";
import { scoreOpportunity } from "./ai/scorer.js";
import type { Opportunity } from "./types.js";

// above this many fresh drops, send a summary instead of individual embeds
const MAX_INDIVIDUAL_POSTS = 10;

async function scanOnce(bot: DiscordBot, cfg: ReturnType<typeof loadConfig>, profile: string, llm: Llm): Promise<void> {
  const scanned: Opportunity[] = [];
  for (const source of cfg.sources) {
    const opps = await runSource(source);
    console.log(`${source.name}: ${opps.length} listings`);
    scanned.push(...opps);
  }

  const relevant = applyFilter(scanned, cfg.filter);
  const seen = loadSeen();
  const { fresh, firstRun } = diff(relevant, seen);
  const unscored = new Set<string>();

  if (firstRun) {
    await bot.postSummary(
      `modus is live. tracking ${relevant.length} open roles. new drops will appear here — DM me to triage them.`,
    );
    console.log("First run: seeded state, sent one confirmation.");
  } else if (fresh.length === 0) {
    console.log("No new drops.");
  } else if (fresh.length > MAX_INDIVIDUAL_POSTS) {
    const preview = fresh.slice(0, 5).map((o) => `• ${o.company} — ${o.title}`).join("\n");
    await bot.postSummary(`${fresh.length} new roles just dropped:\n${preview}\n…DM me to dig in.`);
    console.log(`Posted summary for ${fresh.length} fresh drops.`);
  } else {
    // score against the profile if there is one, otherwise post all
    let toPost = fresh;
    if (profile) {
      toPost = [];
      for (const opp of fresh) {
        try {
          const { fit, reason, deadline } = await scoreOpportunity(opp, profile, llm);
          if (fit >= cfg.scoreThreshold) toPost.push({ ...opp, fit, reason, deadline });
        } catch (err) {
          // leave it out of the seen set so the next tick retries
          unscored.add(opp.id);
          console.error(`Scoring failed for ${opp.company} — ${opp.title}: ${(err as Error).message}`);
        }
      }
      const skipped = fresh.length - toPost.length - unscored.size;
      if (skipped > 0) console.log(`Filtered ${skipped} drops below fit ${cfg.scoreThreshold}.`);
    }

    for (const opp of toPost) await bot.postOpportunity(opp);
    if (toPost.length > 0) console.log(`Posted ${toPost.length} fresh drops.`);
  }

  saveSeen(seen, relevant.filter((o) => !unscored.has(o.id))); // record everything scanned so seeded roles never re-alert
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!loadProfile()) console.warn("No config/profile.md found — drops will post unscored and chat has no candidate context.");

  const llm = new Llm(cfg.ollamaUrl, cfg.ollamaModel);
  const bot = new DiscordBot(cfg.discordToken, cfg.discordChannelId, cfg.discordUserId, llm);
  await bot.start();

  const intervalMs = cfg.scanIntervalMinutes * 60_000;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return console.log("Scan still running, skipping tick.");
    running = true;
    try {
      await scanOnce(bot, cfg, loadProfile(), llm);
    } catch (err) {
      console.error(`Scan tick failed: ${(err as Error).message}`); // never kill the daemon
    } finally {
      running = false;
    }
  };

  console.log(`Modus up. Scanning now, then every ${cfg.scanIntervalMinutes} min.`);
  await tick();
  setInterval(() => void tick(), intervalMs);

  const shutdown = async (sig: string): Promise<void> => {
    console.log(`${sig}, shutting down.`);
    await bot.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(`Modus failed to start: ${(err as Error).message}`);
  process.exit(1);
});
