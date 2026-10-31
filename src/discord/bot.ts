import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  Partials,
  ChannelType,
  type TextChannel,
  type DMChannel,
  type Message,
} from "discord.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Opportunity } from "../types.js";
import { respond } from "../ai/respond.js";
import type { Llm } from "../ai/llm.js";
import { loadProfile, PROFILE_PATH } from "../config.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const RECENT_PATH = resolve(DATA_DIR, "recent.json");
const MAX_RECENT = 50;

export class DiscordBot {
  private readonly client: Client;
  private channel: TextChannel | null = null;
  private dmChannel: DMChannel | null = null;
  // keyed by opp id so DM triage can resolve the full record; persisted across restarts
  private readonly posted = new Map<string, Opportunity>();

  constructor(
    private readonly token: string,
    private readonly channelId: string,
    private readonly userId: string,
    private readonly llm: Llm,
  ) {
    this.loadRecent();
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel, Partials.Message],
    });
    this.client.on(Events.MessageCreate, (m) => void this.onMessage(m));
  }

  private loadRecent(): void {
    if (!existsSync(RECENT_PATH)) return;
    try {
      const opps = JSON.parse(readFileSync(RECENT_PATH, "utf8")) as Opportunity[];
      for (const opp of opps) this.posted.set(opp.id, opp);
    } catch {
      // corrupt file — start fresh
    }
  }

  private saveRecent(): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const opps = [...this.posted.values()].slice(-MAX_RECENT);
    writeFileSync(RECENT_PATH, JSON.stringify(opps, null, 2) + "\n", "utf8");
  }

  async start(): Promise<void> {
    await new Promise<void>((res, rej) => {
      this.client.once(Events.ClientReady, () => res());
      this.client.once(Events.Error, rej);
      this.client.login(this.token).catch(rej);
    });

    const ch = await this.client.channels.fetch(this.channelId);
    if (!ch || !ch.isTextBased() || !("send" in ch)) {
      throw new Error(`Channel ${this.channelId} is not a text channel the bot can post to.`);
    }
    this.channel = ch as TextChannel;

    const user = await this.client.users.fetch(this.userId);
    this.dmChannel = await user.createDM();

    console.log(`Discord bot ready as ${this.client.user?.tag}. Loaded ${this.posted.size} recent drops from disk.`);
  }

  async postOpportunity(opp: Opportunity): Promise<void> {
    if (!this.channel) throw new Error("Bot not started.");
    this.posted.set(opp.id, opp);
    this.saveRecent();
    const embed = new EmbedBuilder()
      .setTitle(`${opp.company} — ${opp.title}`.slice(0, 256))
      .setURL(opp.url)
      .setDescription(
        [
          opp.fit ? `fit ${opp.fit}/5 — ${opp.reason}` : null,
          opp.deadline ? `deadline ${opp.deadline}` : null,
          [opp.location, `via ${opp.source}`].filter(Boolean).join(" · "),
        ]
          .filter(Boolean)
          .join("\n") || null,
      )
      .setColor(0x5865f2);
    await this.channel.send({ embeds: [embed] });
    await this.dmChannel?.send({ embeds: [embed] });
  }

  async postSummary(text: string): Promise<void> {
    if (!this.channel) throw new Error("Bot not started.");
    await this.channel.send(text.slice(0, 2000));
  }

  private async onMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;
    if (message.author.id !== this.userId) return;

    try {
      const result = await respond(message.content, this.posted, loadProfile(), this.llm);
      await message.channel.send(result.reply.slice(0, 2000));
      if (result.profileUpdate) {
        appendFileSync(PROFILE_PATH, `\n## preference update (${new Date().toISOString().slice(0, 10)})\n${result.profileUpdate}\n`);
        console.log("Profile updated from chat.");
      }
    } catch (err) {
      console.error(`DM handler failed: ${(err as Error).message}`);
      await message.channel.send("something went wrong on my end, try again.");
    }
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }
}
