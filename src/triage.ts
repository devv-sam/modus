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

/**
 * Apply: queue the role for the (later) career-ops handoff. v1 just records it;
 * invoking career-ops happens laptop-side and is out of scope here.
 * Returns the short line to reply in Discord.
 */
export function queueApply(opp: Opportunity): string {
  const queue = readList(QUEUE_PATH);
  if (queue.some((q) => q.id === opp.id)) return `Already queued: ${opp.company} — ${opp.title}`;
  queue.push(opp);
  writeList(QUEUE_PATH, queue);
  return `Queued for apply: ${opp.company} — ${opp.title}`;
}

/** Skip: nothing to persist (the role is already in seen.json so it won't re-alert). */
export function skip(opp: Opportunity): string {
  return `Skipped: ${opp.company} — ${opp.title}`;
}

/** More like this: record a positive signal for future filter/ranking tuning. */
export function recordInterest(opp: Opportunity): string {
  const interests = readList(INTERESTS_PATH);
  if (!interests.some((i) => i.id === opp.id)) {
    interests.push(opp);
    writeList(INTERESTS_PATH, interests);
  }
  return `Noted. I'll favour more like ${opp.company} — ${opp.title}`;
}
