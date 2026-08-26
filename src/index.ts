import { loadConfig, loadProfile } from "./config.js";
import { runSource } from "./sources/index.js";
import { applyFilter } from "./filter.js";
import { loadSeen, diff, saveSeen } from "./dedupe.js";
import { DiscordBot } from "./discord/bot.js";
import { queueApply, recordInterest } from "./triage.js";
import { scoreOpportunity } from "./ai/scorer.js";
import type { Opportunity } from "./types.js";

// above this many fresh drops, send a summary instead of individual embeds
const MAX_INDIVIDUAL_POSTS = 10;

async function scanOnce(bot: DiscordBot, cfg: ReturnType<typeof loadConfig>, profile: string): Promise<void> {
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
    // score with Claude if configured, otherwise post all
    let toPost = fresh;
    if (cfg.claudeApiKey && profile) {
      const scored = await Promise.all(
        fresh.map(async (opp) => {
          const result = await scoreOpportunity(opp, profile, cfg.claudeApiKey, cfg.claudeModel);
          return { opp, ...result };
        }),
      );
      toPost = scored.filter((s) => s.score >= cfg.scoreThreshold).map((s) => s.opp);
      const skipped = fresh.length - toPost.length;
      if (skipped > 0) console.log(`Filtered ${skipped} drops below score threshold (${cfg.scoreThreshold}).`);
    }

    for (const opp of toPost) await bot.postOpportunity(opp);
    if (toPost.length > 0) console.log(`Posted ${toPost.length} fresh drops.`);
  }

  saveSeen(seen, relevant); // record everything scanned so seeded roles never re-alert
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const profile = loadProfile();
  if (!profile) console.warn("No config/profile.md found — AI scoring and chat will have no candidate context.");

  const ai = cfg.claudeApiKey ? { apiKey: cfg.claudeApiKey, model: cfg.claudeModel } : null;
  const bot = new DiscordBot(cfg.discordToken, cfg.discordChannelId, cfg.discordUserId, ai, profile);
  await bot.start();

  const intervalMs = cfg.scanIntervalMinutes * 60_000;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return console.log("Scan still running, skipping tick.");
    running = true;
    try {
      await scanOnce(bot, cfg, profile);
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
