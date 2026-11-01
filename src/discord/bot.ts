import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  Events,
  Partials,
  ChannelType,
  type TextChannel,
  type DMChannel,
  type Message,
  type ButtonInteraction,
} from "discord.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Opportunity } from "../types.js";
import { respond } from "../ai/respond.js";
import type { Llm } from "../ai/llm.js";
import { loadProfile, PROFILE_PATH } from "../config.js";
import type { Dossier } from "../dossier/client.js";
import { loadSent, saveSent } from "../dossier/sent.js";
import { loadChat, recent, remember } from "./history.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const RECENT_PATH = resolve(DATA_DIR, "recent.json");
const MAX_RECENT = 50;

export class DiscordBot {
  private readonly client: Client;
  private channel: TextChannel | null = null;
  private dmChannel: DMChannel | null = null;
  // keyed by opp id so DM triage can resolve the full record; persisted across restarts
  private readonly posted = new Map<string, Opportunity>();
  private readonly sent = loadSent();
  private chat = loadChat();
  // one draft at a time: the local model is the bottleneck
  private drafting: Promise<void> = Promise.resolve();

  constructor(
    private readonly token: string,
    private readonly channelId: string,
    private readonly userId: string,
    private readonly llm: Llm,
    private readonly dossier: Dossier | null,
  ) {
    this.loadRecent();
    // a draft interrupted by a restart never finished, so let it be sent again
    for (const [id, record] of Object.entries(this.sent)) if (record.status === "drafting") delete this.sent[id];
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel, Partials.Message],
    });
    this.client.on(Events.MessageCreate, (m) => void this.onMessage(m));
    this.client.on(Events.InteractionCreate, (i) => {
      if (i.isButton()) void this.onButton(i);
    });
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
    const components = this.dossier
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`send:${opp.id}`).setLabel("Send to Dossier").setStyle(ButtonStyle.Primary),
          ),
        ]
      : [];
    await this.channel.send({ embeds: [embed], components });
    await this.dmChannel?.send({ embeds: [embed], components });
  }

  private async onButton(interaction: ButtonInteraction): Promise<void> {
    if (interaction.user.id !== this.userId) return void (await interaction.deferUpdate());
    const sep = interaction.customId.indexOf(":");
    const action = interaction.customId.slice(0, sep);
    const id = interaction.customId.slice(sep + 1);

    if (!this.dossier) {
      await interaction.reply("dossier isn't connected. run `npm run connect-dossier` on the laptop.");
      return;
    }

    if (action === "send") {
      const opp = this.posted.get(id);
      const existing = this.sent[id];
      if (existing) {
        const where = existing.link ? ` ${existing.link}` : "";
        await interaction.reply(existing.status === "drafting" ? "already drafting that one, i'll ping you." : `already in dossier.${where}`);
        return;
      }
      if (!opp) {
        await interaction.reply("i don't have that role anymore.");
        return;
      }
      this.sent[id] = { status: "drafting" };
      saveSent(this.sent);
      await interaction.reply(`sending ${opp.company} to dossier. drafting takes a few minutes, i'll ping you when it's ready.`);
      this.drafting = this.drafting.then(() => this.runDraft(opp));
    } else if (action === "applied") {
      const record = this.sent[id];
      if (!record?.applicationId) {
        await interaction.reply("i can't find that application in dossier.");
        return;
      }
      try {
        await this.dossier.markApplied(record.applicationId);
        record.status = "applied";
        saveSent(this.sent);
        await interaction.reply("marked as sent in dossier. good luck.");
      } catch (err) {
        console.error(`Marking applied failed: ${(err as Error).message}`);
        await interaction.reply("couldn't update dossier, try again in a bit.");
      }
    }
  }

  private async runDraft(opp: Opportunity): Promise<void> {
    if (!this.dossier || !this.dmChannel) return;
    try {
      const { applicationId, link } = await this.dossier.draft(opp);
      this.sent[opp.id] = { status: "drafted", applicationId, link };
      saveSent(this.sent);

      const files = await this.documentFiles(applicationId, opp.company);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`applied:${opp.id}`).setLabel("I applied").setStyle(ButtonStyle.Success),
      );
      const remote = this.dossier.reachableLink(applicationId);
      await this.dmChannel.send({
        content: [
          `draft ready for **${opp.company} — ${opp.title}**`,
          remote ? `edit it in dossier: ${remote}` : "",
          `apply here: ${opp.url}`,
        ]
          .filter(Boolean)
          .join("\n"),
        files,
        components: [row],
      });
    } catch (err) {
      delete this.sent[opp.id];
      saveSent(this.sent);
      console.error(`Dossier draft failed for ${opp.company}: ${(err as Error).message}`);
      await this.dmChannel.send(`dossier couldn't draft ${opp.company} — ${opp.title}: ${(err as Error).message.slice(0, 300)}`);
    }
  }

  /** Dossier's own PDFs, or the plain text when its connector can't render them. */
  private async documentFiles(applicationId: string, company: string): Promise<AttachmentBuilder[]> {
    const dossier = this.dossier!;
    const pdfs = await Promise.allSettled([dossier.pdf(applicationId, "resume"), dossier.pdf(applicationId, "letter")]);
    const files = pdfs.flatMap((r) => (r.status === "fulfilled" ? [new AttachmentBuilder(r.value.data, { name: r.value.fileName })] : []));
    if (files.length > 0) return files;

    console.warn(`PDF unavailable (${(pdfs[0] as PromiseRejectedResult).reason}), sending text instead.`);
    const text = await dossier.read(applicationId);
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "role";
    return [
      text.resume && new AttachmentBuilder(Buffer.from(text.resume, "utf8"), { name: `resume-${slug}.md` }),
      text.coverLetter && new AttachmentBuilder(Buffer.from(text.coverLetter, "utf8"), { name: `cover-letter-${slug}.md` }),
    ].filter((f): f is AttachmentBuilder => Boolean(f));
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
      const result = await respond(message.content, this.posted, loadProfile(), this.llm, recent(this.chat));
      await message.channel.send(result.reply.slice(0, 2000));
      this.chat = remember(this.chat, message.content, result.reply);
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
