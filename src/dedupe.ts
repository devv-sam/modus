import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Opportunity } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "..", "data");
const SEEN_PATH = resolve(DATA_DIR, "seen.json");

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

const TRACKING_PARAM = /^(utm_|ref$|source$|src$|gh_src$|lever-)/i;

/** The same role listed by two sources has different ids but the same link once tracking is stripped. */
export function linkKey(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function diff(all: Opportunity[], seen: Set<string>): DedupeResult {
  const firstRun = seen.size === 0;
  const fresh: Opportunity[] = [];
  const batch = new Set<string>();
  // seen ids carry no links, so a role already seen under one source's id blocks its twin under another's
  const seenLinks = new Set(all.filter((opp) => seen.has(opp.id)).map((opp) => linkKey(opp.url)));
  for (const opp of all) {
    const link = linkKey(opp.url);
    if (seen.has(opp.id) || batch.has(opp.id) || seenLinks.has(link) || batch.has(link)) continue;
    batch.add(opp.id);
    batch.add(link);
    fresh.push(opp);
  }
  return { fresh, firstRun, seenCount: seen.size };
}

export function saveSeen(seen: Set<string>, all: Opportunity[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const merged = new Set(seen);
  for (const opp of all) merged.add(opp.id);
  const state: SeenState = { ids: [...merged].sort(), updatedAt: new Date().toISOString() };
  writeFileSync(SEEN_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}
