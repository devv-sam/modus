import type { Filter, Opportunity } from "./types.js";

export function applyFilter(opps: Opportunity[], filter: Filter): Opportunity[] {
  const inc = filter.include.map((s) => s.toLowerCase());
  const exc = filter.exclude.map((s) => s.toLowerCase());
  return opps.filter((o) => {
    const hay = `${o.title} ${o.company}`.toLowerCase();
    if (exc.some((t) => hay.includes(t))) return false;
    if (inc.length === 0) return true;
    return inc.some((t) => hay.includes(t));
  });
}
