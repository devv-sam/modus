import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Opportunity } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");
const QUEUE_PATH = resolve(dataDir, "queue.json");
const INTERESTS_PATH = resolve(dataDir, "interests.json");

function readList(path: string): Opportunity[] {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Opportunity[];
  } catch {
    return [];
  }
}

function writeList(path: string, items: Opportunity[]): void {
  writeFileSync(path, JSON.stringify(items, null, 2) + "\n", "utf8");
}

export function queueApply(opp: Opportunity): string {
  const queue = readList(QUEUE_PATH);
  if (queue.some((q) => q.id === opp.id)) return `Already queued: ${opp.company} — ${opp.title}`;
  queue.push(opp);
  writeList(QUEUE_PATH, queue);
  return `Queued for apply: ${opp.company} — ${opp.title}`;
}

export function skip(opp: Opportunity): string {
  return `Skipped: ${opp.company} — ${opp.title}`;
}

export function recordInterest(opp: Opportunity): string {
  const interests = readList(INTERESTS_PATH);
  if (!interests.some((i) => i.id === opp.id)) {
    interests.push(opp);
    writeList(INTERESTS_PATH, interests);
  }
  return `Noted. I'll favour more like ${opp.company} — ${opp.title}`;
}
