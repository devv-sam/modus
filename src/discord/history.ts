import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatTurn } from "../ai/llm.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const CHAT_PATH = resolve(DATA_DIR, "chat.json");
const MAX_MESSAGES = 12;
const MAX_AGE_MS = 6 * 60 * 60_000;

export function recent(turns: ChatTurn[], now = Date.now()): ChatTurn[] {
  return turns.filter((t) => now - t.at < MAX_AGE_MS).slice(-MAX_MESSAGES);
}

export function loadChat(): ChatTurn[] {
  if (!existsSync(CHAT_PATH)) return [];
  try {
    return recent(JSON.parse(readFileSync(CHAT_PATH, "utf8")) as ChatTurn[]);
  } catch {
    return [];
  }
}

/** Adds one exchange and returns the history to keep: the last few messages from the last few hours. */
export function remember(turns: ChatTurn[], user: string, reply: string): ChatTurn[] {
  const at = Date.now();
  const kept = recent([...turns, { role: "user", content: user, at }, { role: "assistant", content: JSON.stringify({ reply }), at }]);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CHAT_PATH, JSON.stringify(kept, null, 2) + "\n", "utf8");
  return kept;
}

