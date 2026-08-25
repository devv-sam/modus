import { createHash } from "node:crypto";
import type { GitHubListSource, Opportunity } from "../types.js";

function pick(row: Record<string, unknown>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const v = row[key];
  if (v == null) return undefined;
  return String(v);
}

function isActive(row: Record<string, unknown>, activeKey?: string): boolean {
  if (!activeKey) return true;
  const v = row[activeKey];
  if (typeof v === "boolean") return v;
  if (v == null) return true;
  const s = String(v).toLowerCase();
  return !(s === "false" || s === "0" || s === "closed" || s === "no");
}

function stableId(source: string, company: string, title: string, url: string): string {
  return createHash("sha1").update(`${source}|${company}|${title}|${url}`).digest("hex").slice(0, 16);
}

// feed may be a bare array or nested under listings / data / jobs
export async function fetchGitHubList(source: GitHubListSource): Promise<Opportunity[]> {
  const res = await fetch(source.jsonUrl, { headers: { "User-Agent": "modus-scanner" } });
  if (!res.ok) {
    throw new Error(`${source.name}: HTTP ${res.status} fetching ${source.jsonUrl}`);
  }
  const body = (await res.json()) as unknown;

  const rows: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : ((body as Record<string, unknown>)?.listings ??
       (body as Record<string, unknown>)?.data ??
       (body as Record<string, unknown>)?.jobs ??
       []) as Record<string, unknown>[];

  const out: Opportunity[] = [];
  for (const row of rows) {
    if (!isActive(row, source.fields.active)) continue;
    const company = pick(row, source.fields.company) ?? "Unknown";
    const title = pick(row, source.fields.title) ?? "Untitled role";
    const url = pick(row, source.fields.url) ?? "";
    if (!url) continue;
    const id = pick(row, source.fields.id) ?? stableId(source.name, company, title, url);
    out.push({
      id,
      company,
      title,
      url,
      location: pick(row, source.fields.location),
      postedAt: pick(row, source.fields.postedAt),
      source: source.name,
    });
  }
  return out;
}
