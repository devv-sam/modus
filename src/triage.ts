import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Opportunity } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "..", "data");
const QUEUE_PATH = resolve(DATA_DIR, "queue.json");
const INTERESTS_PATH = resolve(DATA_DIR, "interests.json");

function readList(path: string): Opportunity[] {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Opportunity[];
  } catch {
    return [];
  }
}

function writeList(path: string, items: Opportunity[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(items, null, 2) + "\n", "utf8");
}

export function queueApply(opp: Opportunity): void {
  const queue = readList(QUEUE_PATH);
  if (!queue.some((q) => q.id === opp.id)) {
    queue.push(opp);
    writeList(QUEUE_PATH, queue);
  }
}

export function recordInterest(opp: Opportunity): void {
  const interests = readList(INTERESTS_PATH);
  if (!interests.some((i) => i.id === opp.id)) {
    interests.push(opp);
    writeList(INTERESTS_PATH, interests);
  }
}
