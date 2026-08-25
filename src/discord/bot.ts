import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  MessageFlags,
  type TextChannel,
  type Interaction,
} from "discord.js";
import type { Opportunity, TriageAction } from "../types.js";

/** Handlers the bot calls when a triage button is pressed. Each returns the line to reply. */
export interface TriageHandlers {
  apply(opp: Opportunity): string;
  skip(opp: Opportunity): string;
  more(opp: Opportunity): string;
}

/**
 * The persistent Discord channel. Holds one gateway connection for the whole process:
 * posts drops with buttons, and receives button presses over the same connection
 * (no public URL, no webhook). Button clicks are INTERACTION_CREATE events, which do
 * NOT require the privileged Message Content intent — only Guilds.
 */
export class DiscordBot {
  private readonly client: Client;
  private channel: TextChannel | null = null;
  /** Opportunities posted this session, so a button press can resolve its full record. */
  private readonly posted = new Map<string, Opportunity>();

  constructor(
    private readonly token: string,
    private readonly channelId: string,
    private readonly handlers: TriageHandlers,
  ) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.client.on(Events.InteractionCreate, (i) => void this.onInteraction(i));
  }

  /** Log in and resolve the target channel. Rejects if the channel isn't a text channel. */
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
    console.log(`Discord bot ready as ${this.client.user?.tag}.`);
  }

  private buttons(id: string): ActionRowBuilder<ButtonBuilder> {
    const mk = (action: TriageAction, label: string, style: ButtonStyle) =>
      new ButtonBuilder().setCustomId(`${action}:${id}`).setLabel(label).setStyle(style);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("apply", "Apply", ButtonStyle.Success),
      mk("skip", "Skip", ButtonStyle.Secondary),
      mk("more", "More like this", ButtonStyle.Primary),
    );
  }

  /** Post one opportunity with an embed and the triage buttons. */
  async postOpportunity(opp: Opportunity): Promise<void> {
    if (!this.channel) throw new Error("Bot not started.");
    this.posted.set(opp.id, opp);
    const embed = new EmbedBuilder()
      .setTitle(`${opp.company} — ${opp.title}`.slice(0, 256))
      .setURL(opp.url)
      .setDescription([opp.location, `via ${opp.source}`].filter(Boolean).join(" · ") || null)
      .setColor(0x5865f2);
    await this.channel.send({ embeds: [embed], components: [this.buttons(opp.id)] });
  }

  /** Post a plain roll-up message (cold start, or when a scan finds too many drops to list). */
  async postSummary(text: string): Promise<void> {
    if (!this.channel) throw new Error("Bot not started.");
    await this.channel.send(text.slice(0, 2000));
  }

  private async onInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    const [action, id] = interaction.customId.split(":") as [TriageAction, string];
    const opp = this.posted.get(id);
    if (!opp) {
      await interaction.reply({
        content: "This drop expired after a restart. It's still in your feed, just re-scan.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let reply: string;
    if (action === "apply") reply = this.handlers.apply(opp);
    else if (action === "skip") reply = this.handlers.skip(opp);
    else reply = this.handlers.more(opp);

    // Ack, then disable the buttons on the original message so a decision is final and visible.
    await interaction.update({ components: [] });
    await interaction.followUp({ content: reply, flags: MessageFlags.Ephemeral });
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }
}
