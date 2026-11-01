import { createHash } from "node:crypto";
import { linkKey } from "../dedupe.js";
import type { Opportunity } from "../types.js";

const MAX_LINKS = 3;
const ASKS_FOR_DOSSIER = /\b(dossier|send|draft|tailor|resume|cv|apply|application)\b/i;

/** The links in a DM when it's a request to send them to Dossier: a bare link, or one with words like "send this to dossier". */
export function linksToSend(text: string): string[] {
  const found = (text.match(/https?:\/\/[^\s<>]+/g) ?? []).map((link) => link.replace(/[.,;:!?)\]]+$/, ""));
  if (found.length === 0) return [];
  const words = text.replace(/https?:\/\/[^\s<>]+/g, "").replace(/[<>]/g, "").trim();
  return words === "" || ASKS_FOR_DOSSIER.test(words) ? [...new Set(found)].slice(0, MAX_LINKS) : [];
}

/** A role known only by its link: Dossier reads the page for the company and title. */
export function pastedOpportunity(url: string): Opportunity {
  const id = `link:${createHash("sha1").update(linkKey(url)).digest("hex").slice(0, 12)}`;
  return { id, company: "", title: "", url, source: "pasted link" };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
