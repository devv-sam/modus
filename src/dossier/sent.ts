import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const SENT_PATH = resolve(DATA_DIR, "dossier-sent.json");

export interface SentRecord {
  status: "drafting" | "drafted" | "applied";
  applicationId?: string;
  link?: string;
}

export function loadSent(): Record<string, SentRecord> {
  if (!existsSync(SENT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SENT_PATH, "utf8")) as Record<string, SentRecord>;
  } catch {
    return {};
  }
}

export function saveSent(sent: Record<string, SentRecord>): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2) + "\n", "utf8");
}
