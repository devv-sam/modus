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
  const discordUserId = process.env.DISCORD_USER_ID ?? raw.discordUserId ?? "";
  if (!discordToken) throw new Error("No Discord token. Set DISCORD_TOKEN env var.");
  if (!discordChannelId) throw new Error("No channel id. Set DISCORD_CHANNEL_ID env var.");
  if (!discordUserId) throw new Error("No Discord user id. Set DISCORD_USER_ID env var.");
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new Error("config/sources.json has no sources.");
  }

  return {
    discordToken,
    discordChannelId,
    discordUserId,
    scanIntervalMinutes: Math.max(1, Number(process.env.SCAN_INTERVAL_MINUTES ?? raw.scanIntervalMinutes ?? 15)),
    filter: { include: raw.filter?.include ?? [], exclude: raw.filter?.exclude ?? [] },
    sources: raw.sources,
    claudeApiKey: process.env.CLAUDE_API_KEY ?? raw.claudeApiKey ?? "",
    claudeModel: process.env.CLAUDE_MODEL ?? raw.claudeModel ?? "claude-haiku-4-5-20251001",
    scoreThreshold: Number(process.env.SCORE_THRESHOLD ?? raw.scoreThreshold ?? 3),
  };
}

/** Load profile markdown from config/profile.md. Returns empty string if not found. */
export function loadProfile(): string {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "config", "profile.md");
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
