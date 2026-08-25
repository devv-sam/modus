import type { Opportunity, Source } from "../types.js";
import { fetchGitHubList } from "./github-list.js";

/** Run one source, returning [] on failure so one broken feed never kills the whole scan. */
export async function runSource(source: Source): Promise<Opportunity[]> {
  try {
    switch (source.kind) {
      case "github-list":
        return await fetchGitHubList(source);
      default:
        console.error(`Unknown source kind: ${(source as { kind: string }).kind}`);
        return [];
    }
  } catch (err) {
    console.error(`Source "${source.name}" failed: ${(err as Error).message}`);
    return [];
  }
}
