# modus

watches internship and hackathon feeds and posts new drops to a private Discord channel with **Apply / Skip / More like this** buttons. self-hosted, no always-on hardware beyond a $6 VPS.

## setup

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot → copy the token. under OAuth2 → URL Generator, select `bot` + Send Messages + Embed Links + View Channels, invite it to a private server.
2. In Discord (Developer Mode on): right-click your drops channel → Copy Channel ID.
3. On a fresh Ubuntu VPS:
   ```bash
   git clone https://github.com/devv-sam/modus /opt/modus
   cd /opt/modus
   ./deploy/setup-vps.sh https://github.com/devv-sam/modus.git <token> <channel-id>
   ```
   Then: `journalctl -u modus.service -f` — confirm "modus is live" lands in the channel.

## configure

edit `config/sources.json`:
- `filter.include` / `filter.exclude` — substrings matched against title and company (case-insensitive).
- `scanIntervalMinutes` — how often to scan (default 15).
- `sources` — add any GitHub internship list that publishes a `listings.json`.

## local run

```bash
npm install && npm run build
DISCORD_TOKEN=... DISCORD_CHANNEL_ID=... npm start
```

## roadmap

- apply handoff to career-ops: queue → tailor CV → human submits
- more sources (Devpost/MLH, Greenhouse/Ashby/Lever)
- natural-language triage

MIT.
