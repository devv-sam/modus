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

  const dossierUrl = (process.env.DOSSIER_URL ?? raw.dossierUrl ?? "http://localhost:3000").replace(/\/+$/, "");

  return {
    discordToken,
    discordChannelId,
    discordUserId,
    scanIntervalMinutes: Math.max(1, Number(process.env.SCAN_INTERVAL_MINUTES ?? raw.scanIntervalMinutes ?? 15)),
    filter: { include: raw.filter?.include ?? [], exclude: raw.filter?.exclude ?? [] },
    sources: raw.sources,
    ollamaUrl: process.env.OLLAMA_URL ?? raw.ollamaUrl ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? raw.ollamaModel ?? "qwen2.5:7b",
    dossierUrl,
    dossierPublicUrl: (process.env.DOSSIER_PUBLIC_URL ?? raw.dossierPublicUrl ?? dossierUrl).replace(/\/+$/, ""),
    scoreThreshold: Number(process.env.SCORE_THRESHOLD ?? raw.scoreThreshold ?? 4),
  };
}

export const PROFILE_PATH = resolve(here, "..", "config", "profile.md");

/** Load profile markdown from config/profile.md. Returns empty string if not found. */
export function loadProfile(): string {
  try {
    return readFileSync(PROFILE_PATH, "utf8");
  } catch {
    return "";
  }
}
