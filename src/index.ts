import { loadConfig, loadProfile } from "./config.js";
import { runSource } from "./sources/index.js";
import { applyFilter } from "./filter.js";
import { loadSeen, diff, saveSeen } from "./dedupe.js";
import { DiscordBot } from "./discord/bot.js";
import { queueApply, recordInterest } from "./triage.js";
import { Dossier } from "./dossier/client.js";
import { isConnected } from "./dossier/auth.js";
import { Llm } from "./ai/llm.js";
import { scoreOpportunity } from "./ai/scorer.js";
import type { Opportunity } from "./types.js";

// above this many good drops, the best get an embed each and the rest one summary
const MAX_INDIVIDUAL_POSTS = 10;
const MAX_SCORING_FAILURES = 3;

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
  } else if (!profile && fresh.length > MAX_INDIVIDUAL_POSTS) {
    const preview = fresh.slice(0, 5).map((o) => `• ${o.company} — ${o.title}`).join("\n");
    await bot.postSummary(`${fresh.length} new roles just dropped:\n${preview}`);
    console.log(`No profile: posted a summary for ${fresh.length} fresh drops.`);
  } else {
    let toPost = fresh;
    if (profile) {
      toPost = [];
      let failures = 0;
      for (const [index, opp] of fresh.entries()) {
        // a model that is down or hung would take the whole backlog with it
        if (failures >= MAX_SCORING_FAILURES) {
          for (const rest of fresh.slice(index)) unscored.add(rest.id);
          console.error(`Scoring stopped after ${failures} failures; ${fresh.length - index} roles will be retried next scan.`);
          break;
        }
        try {
          const { fit, reason, deadline } = await scoreOpportunity(opp, profile, llm);
          failures = 0;
          if (fit >= cfg.scoreThreshold) toPost.push({ ...opp, fit, reason, deadline });
        } catch (err) {
          // leave it out of the seen set so the next scan retries
          failures++;
          unscored.add(opp.id);
          console.error(`Scoring failed for ${opp.company} — ${opp.title}: ${(err as Error).message}`);
        }
      }
      const skipped = fresh.length - toPost.length - unscored.size;
      if (skipped > 0) console.log(`Scored ${fresh.length - unscored.size}, filtered ${skipped} below fit ${cfg.scoreThreshold}.`);
      toPost.sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
    }

    for (const opp of toPost.slice(0, MAX_INDIVIDUAL_POSTS)) await bot.postOpportunity(opp);
    const rest = toPost.slice(MAX_INDIVIDUAL_POSTS);
    if (rest.length > 0) {
      const lines = rest.slice(0, 10).map((o) => `• ${o.company} — ${o.title} (fit ${o.fit ?? "?"}/5)\n  ${o.url}`).join("\n");
      await bot.postSummary(`${rest.length} more good roles:\n${lines}${rest.length > 10 ? `\n…and ${rest.length - 10} more` : ""}`);
    }
    if (toPost.length > 0) console.log(`Posted ${toPost.length} fresh drops.`);
  }

  saveSeen(seen, relevant.filter((o) => !unscored.has(o.id))); // record everything scanned so seeded roles never re-alert
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!loadProfile()) console.warn("No config/profile.md found — drops will post unscored and chat has no candidate context.");

  const llm = new Llm(cfg.ollamaUrl, cfg.ollamaModel);
  const dossier = isConnected() ? new Dossier(cfg.dossierUrl, cfg.dossierPublicUrl) : null;
  if (!dossier) console.warn("Dossier isn't connected: drops post without the Send to Dossier button. Run: npm run connect-dossier");
  const bot = new DiscordBot(cfg.discordToken, cfg.discordChannelId, cfg.discordUserId, llm, dossier);
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
