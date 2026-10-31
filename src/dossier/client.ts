import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getAccessToken } from "./auth.js";
import type { Opportunity } from "../types.js";

const POLL_MS = 15_000;
const DRAFT_TIMEOUT_MS = 40 * 60_000;

export interface DraftResult {
  applicationId: string;
  link: string;
}

export interface ApplicationText {
  title: string;
  resume: string;
  coverLetter: string;
}

export class Dossier {
  constructor(
    private readonly baseUrl: string,
    private readonly publicUrl: string,
  ) {}

  linkTo(applicationId: string): string {
    return `${this.publicUrl}/applications/${applicationId}`;
  }

  private async call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const token = await getAccessToken(this.baseUrl);
    const client = new Client({ name: "modus", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${this.baseUrl}/api/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    try {
      const result = (await client.callTool({ name: tool, arguments: args })) as {
        isError?: boolean;
        content: Array<{ type: string; text?: string }>;
      };
      const text = result.content.find((c) => c.type === "text")?.text ?? "";
      if (result.isError) throw new Error(text);
      return JSON.parse(text) as T;
    } finally {
      await client.close();
    }
  }

  async draft(opp: Opportunity): Promise<DraftResult> {
    const note = `Found by modus via ${opp.source}.`;
    let started: { draft_id: string };
    try {
      started = await this.call("draft_application", { posting_url: opp.url, note });
    } catch {
      // Dossier could not fetch the page, so give it what modus has
      const text = [`${opp.title} at ${opp.company}`, opp.location ? `Location: ${opp.location}` : "", `Posting: ${opp.url}`]
        .filter(Boolean)
        .join("\n");
      started = await this.call("draft_application", { posting_text: text, note });
    }

    const deadline = Date.now() + DRAFT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const state = await this.call<{ status: string; application_id?: string }>("check_draft", { draft_id: started.draft_id });
      if (state.status === "done" && state.application_id) {
        return { applicationId: state.application_id, link: this.linkTo(state.application_id) };
      }
    }
    throw new Error("Dossier took too long to draft this one.");
  }

  async read(applicationId: string): Promise<ApplicationText> {
    const app = await this.call<{ title: string; resume?: string; cover_letter?: string }>("get_application", { id: applicationId });
    return { title: app.title, resume: app.resume ?? "", coverLetter: app.cover_letter ?? "" };
  }

  /** The PDF as Dossier renders it; needs the devv-sam fork, whose connector has get_application_pdf. */
  async pdf(applicationId: string, doc: "resume" | "letter"): Promise<{ fileName: string; data: Buffer }> {
    const out = await this.call<{ file_name: string; pdf_base64: string }>("get_application_pdf", { id: applicationId, doc });
    const fileName = out.file_name.toLowerCase().endsWith(".pdf") ? out.file_name : `${out.file_name}.pdf`;
    return { fileName, data: Buffer.from(out.pdf_base64, "base64") };
  }

  /** A link worth sending: one that opens away from this computer. */
  reachableLink(applicationId: string): string | null {
    const { hostname } = new URL(this.publicUrl);
    return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ? null : this.linkTo(applicationId);
  }

  async markApplied(applicationId: string): Promise<void> {
    await this.call("set_application_status", { id: applicationId, status: "SENT" });
  }
}
