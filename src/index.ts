import { loadConfig } from "./config.js";
import { runSource } from "./sources/index.js";
import { applyFilter } from "./filter.js";
import { loadSeen, diff, saveSeen } from "./dedupe.js";
import { DiscordBot } from "./discord/bot.js";
import { queueApply, skip, recordInterest } from "./triage.js";
import type { Opportunity } from "./types.js";

// above this many fresh drops, post a summary instead of individual cards
const MAX_INDIVIDUAL_POSTS = 10;

async function scanOnce(bot: DiscordBot, cfg: ReturnType<typeof loadConfig>): Promise<void> {
  const scanned: Opportunity[] = [];
  for (const source of cfg.sources) {
    const opps = await runSource(source);
    console.log(`${source.name}: ${opps.length} listings`);
    scanned.push(...opps);
  }

  const relevant = applyFilter(scanned, cfg.filter);
  const seen = loadSeen();
  const { fresh, firstRun } = diff(relevant, seen);

  if (firstRun) {
    await bot.postSummary(
      `Modus is live. Tracking ${relevant.length} open roles. New drops will post here with Apply / Skip / More like this buttons.`,
    );
    console.log("First run: seeded state, sent one confirmation.");
  } else if (fresh.length === 0) {
    console.log("No new drops.");
  } else if (fresh.length > MAX_INDIVIDUAL_POSTS) {
    const preview = fresh.slice(0, 5).map((o) => `• ${o.company} — ${o.title}`).join("\n");
    await bot.postSummary(`${fresh.length} new roles just dropped:\n${preview}\n…open the feed to triage.`);
    console.log(`Posted summary for ${fresh.length} fresh drops.`);
  } else {
    for (const opp of fresh) await bot.postOpportunity(opp);
    console.log(`Posted ${fresh.length} fresh drops.`);
  }

  saveSeen(seen, relevant); // record everything scanned so seeded roles never re-alert
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const bot = new DiscordBot(cfg.discordToken, cfg.discordChannelId, {
    apply: queueApply,
    skip,
    more: recordInterest,
  });
  await bot.start();

  const intervalMs = cfg.scanIntervalMinutes * 60_000;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return console.log("Scan still running, skipping tick.");
    running = true;
    try {
      await scanOnce(bot, cfg);
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
