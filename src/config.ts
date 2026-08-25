import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Config } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

export function loadConfig(): Config {
  const path = resolve(here, "..", "config", "sources.json");
  let raw: Partial<Config>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
  } catch (err) {
    throw new Error(`Could not read config at ${path}: ${(err as Error).message}`);
  }

  const discordToken = process.env.DISCORD_TOKEN ?? raw.discordToken ?? "";
  const discordChannelId = process.env.DISCORD_CHANNEL_ID ?? raw.discordChannelId ?? "";
  if (!discordToken) throw new Error("No Discord token. Set DISCORD_TOKEN env var.");
  if (!discordChannelId) throw new Error("No channel id. Set DISCORD_CHANNEL_ID env var.");
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new Error("config/sources.json has no sources.");
  }

  const interval = Number(process.env.SCAN_INTERVAL_MINUTES ?? raw.scanIntervalMinutes ?? 15);

  return {
    discordToken,
    discordChannelId,
    scanIntervalMinutes: Math.max(1, interval),
    filter: {
      include: raw.filter?.include ?? [],
      exclude: raw.filter?.exclude ?? [],
    },
    sources: raw.sources,
  };
}
