// Core domain types for Modus.

/** A single opportunity surfaced by a source (one internship, one hackathon). */
export interface Opportunity {
  /** Stable unique id. Comes from the source if it exposes one, otherwise hashed. */
  id: string;
  company: string;
  title: string;
  url: string;
  location?: string;
  postedAt?: string;
  source: string;
}

/** Field mapping so one GitHub-list source handler can read many differently-shaped JSON feeds. */
export interface FieldMap {
  id?: string;
  company: string;
  title: string;
  url: string;
  location?: string;
  postedAt?: string;
  active?: string;
}

export interface GitHubListSource {
  kind: "github-list";
  name: string;
  jsonUrl: string;
  fields: FieldMap;
}

export type Source = GitHubListSource;

export interface Filter {
  include: string[];
  exclude: string[];
}

export interface Config {
  /** Discord bot token. Overridden by DISCORD_TOKEN env var. */
  discordToken: string;
  /** Channel id to post drops into. Overridden by DISCORD_CHANNEL_ID env var. */
  discordChannelId: string;
  /** Minutes between scans. The bot process schedules this internally. */
  scanIntervalMinutes: number;
  filter: Filter;
  sources: Source[];
}

/** The three triage actions, encoded into button custom ids as `<action>:<opportunityId>`. */
export type TriageAction = "apply" | "skip" | "more";
