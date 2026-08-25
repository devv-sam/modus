export interface Opportunity {
  // stable id from source, or hashed fallback
  id: string;
  company: string;
  title: string;
  url: string;
  location?: string;
  postedAt?: string;
  source: string;
}

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
  discordToken: string;    // overridden by DISCORD_TOKEN env var
  discordChannelId: string; // overridden by DISCORD_CHANNEL_ID env var
  scanIntervalMinutes: number;
  filter: Filter;
  sources: Source[];
}

// encoded into button custom ids as <action>:<opportunityId>
export type TriageAction = "apply" | "skip" | "more";
