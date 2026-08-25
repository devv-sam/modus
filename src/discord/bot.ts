import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  Partials,
  ChannelType,
  type TextChannel,
  type DMChannel,
  type Interaction,
  type Message,
} from "discord.js";
import type { Opportunity } from "../types.js";
import { respond } from "../ai/respond.js";

export interface AIConfig {
  apiKey: string;
  model: string;
  profile: string;
}

export class DiscordBot {
  private readonly client: Client;
  private channel: TextChannel | null = null;
  private dmChannel: DMChannel | null = null;
  // keyed by opp id so DM triage can resolve the full record
  private readonly posted = new Map<string, Opportunity>();
  private readonly ai: AIConfig | null;

  constructor(
    private readonly token: string,
    private readonly channelId: string,
    private readonly userId: string,
    ai: AIConfig | null,
  ) {
    this.ai = ai;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel, Partials.Message],
    });
    this.client.on(Events.MessageCreate, (m) => void this.onMessage(m));
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

    // open DM channel with the user up front so first notify is instant
    const user = await this.client.users.fetch(this.userId);
    this.dmChannel = await user.createDM();

    console.log(`Discord bot ready as ${this.client.user?.tag}.`);
  }

  async postOpportunity(opp: Opportunity): Promise<void> {
    if (!this.channel) throw new Error("Bot not started.");
    this.posted.set(opp.id, opp);
    const embed = new EmbedBuilder()
      .setTitle(`${opp.company} — ${opp.title}`.slice(0, 256))
      .setURL(opp.url)
      .setDescription([opp.location, `via ${opp.source}`].filter(Boolean).join(" · ") || null)
      .setColor(0x5865f2);
    await this.channel.send({ embeds: [embed] });
  }

  async postSummary(text: string): Promise<void> {
    if (!this.channel) throw new Error("Bot not started.");
    await this.channel.send(text.slice(0, 2000));
  }

  /** DM the user after a scan with new drops. */
  async notifyUser(freshCount: number): Promise<void> {
    if (!this.dmChannel) return;
    await this.dmChannel.send(
      `${freshCount} new drop${freshCount === 1 ? "" : "s"} just posted. tell me which ones you want to act on.`,
    );
  }

  private async onMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (message.channel.type !== ChannelType.DM) return;
    if (message.author.id !== this.userId) return;

    if (!this.ai?.apiKey) {
      await message.reply("no claude api key configured — set CLAUDE_API_KEY on the vps to enable chat.");
      return;
    }

    try {
      const reply = await respond(message.content, this.posted, this.ai.profile, this.ai.apiKey, this.ai.model);
      await message.reply(reply.slice(0, 2000));
    } catch (err) {
      console.error(`DM handler failed: ${(err as Error).message}`);
      await message.reply("something went wrong on my end, try again.");
    }
  }

  getPosted(): Map<string, Opportunity> {
    return this.posted;
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }
}
