import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Opportunity } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const SEEN_PATH = resolve(here, "..", "data", "seen.json");

interface SeenState {
  ids: string[];
  updatedAt: string;
}

export interface DedupeResult {
  fresh: Opportunity[];
  firstRun: boolean;
  seenCount: number;
}

export function loadSeen(): Set<string> {
  if (!existsSync(SEEN_PATH)) return new Set();
  try {
    const state = JSON.parse(readFileSync(SEEN_PATH, "utf8")) as SeenState;
    return new Set(state.ids ?? []);
  } catch {
    return new Set();
  }
}

/** Split incoming opportunities into never-seen vs already-seen, deduping within this batch too. */
export function diff(all: Opportunity[], seen: Set<string>): DedupeResult {
  const firstRun = seen.size === 0;
  const fresh: Opportunity[] = [];
  const batch = new Set<string>();
  for (const opp of all) {
    if (seen.has(opp.id) || batch.has(opp.id)) continue;
    batch.add(opp.id);
    fresh.push(opp);
  }
  return { fresh, firstRun, seenCount: seen.size };
}

/** Persist the union of previously-seen ids and everything scanned this run. */
export function saveSeen(seen: Set<string>, all: Opportunity[]): void {
  const merged = new Set(seen);
  for (const opp of all) merged.add(opp.id);
  const state: SeenState = { ids: [...merged].sort(), updatedAt: new Date().toISOString() };
  writeFileSync(SEEN_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}
