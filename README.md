# modus

watches internship feeds, scores new roles against your profile with a local model, and posts the good ones to discord. tap a button to have [dossier](https://github.com/AienTech/dossier) draft a tailored resume and cover letter, and get the PDFs back in the same dm. everything runs on your own machine, with no hosted ai.

## what you need

- Node 20+
- [Ollama](https://ollama.com) with a model pulled: `ollama pull qwen2.5:7b`
- a Discord bot (below)
- optional: Dossier running locally, for the draft button

## setup

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot → copy the token. under OAuth2 → URL Generator, select `bot` + Send Messages + Embed Links + View Channels, invite it to a private server.
2. In Discord (Developer Mode on): copy your drops channel id and your own user id.
3. install and build:
   ```bash
   git clone https://github.com/devv-sam/modus
   cd modus
   npm install && npm run build
   cp .env.example .env
   ```
4. fill in `.env`: `DISCORD_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_USER_ID`. `.env` is gitignored.
5. copy `config/profile.md.example` to `config/profile.md` and fill it in. modus reads it on every scan, so edits apply without a restart. without one, every new role is posted unscored.
6. run it: `npm start`. "modus is live" lands in the channel on the first scan.

## scoring

each new role gets one local-model call that returns `{fit 1-5, reason, deadline}` as JSON, checked and retried once. only fit 4 or 5 is posted (`SCORE_THRESHOLD`). if the model is down, the role isn't marked seen, so the next scan retries it. a role listed twice under the same link is only posted once.

## keep it running (windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1
Start-ScheduledTask -TaskName modus
```

registers a Task Scheduler job that starts at logon, restarts if it fails, and logs to `logs\modus.log`. remove it with `scripts\uninstall-task.ps1`. for always-on use, turn off sleep when plugged in and keep Ollama (`OLLAMA_KEEP_ALIVE=24h` keeps the model loaded) and Docker Desktop set to start at login.

## dossier

modus talks to Dossier through its MCP connector, so the resume layout is Dossier's. the stock Dossier can draft and track applications. the [devv-sam fork](https://github.com/devv-sam/dossier) also returns the finished PDFs, one-page resume with education first, which modus attaches to the dm; with stock Dossier modus sends plain-text files instead.

1. run Dossier and fill in your profile. in its Settings, set the AI provider to Local model (`http://host.docker.internal:11434` from Docker) and turn on MCP connector → Let apps connect.
2. set `DOSSIER_URL` in `.env` (default `http://localhost:3000`).
3. sign modus in once: `npm run connect-dossier`, open the address it prints, press Allow. the token is kept in `data/dossier-auth.json` and refreshes itself; signing in again is only needed after changing Dossier's password or secret.
4. each drop now has a **Send to Dossier** button. the draft arrives in your dm with the PDFs and an **I applied** button that marks it Sent in Dossier. modus never applies for you.
5. for a role modus didn't post, dm it the posting link (up to 3 at a time), alone or with words like "send this to dossier" or "draft this". dossier reads the page for the company and title. if the site needs a browser or a login, dossier can't read it and modus says so.

to get an edit link in those dms from your phone, publish Dossier on a private [Tailscale](https://tailscale.com) address (`tailscale serve --bg 3000`) and set `DOSSIER_PUBLIC_URL` to it. without it, no link is sent.

## configure

edit `config/sources.json`:
- `filter.include` / `filter.exclude` — substrings matched against title and company (case-insensitive).
- `scanIntervalMinutes` — how often to scan (default 15).
- `sources` — add any GitHub internship list that publishes a `listings.json`.

environment variables (see `.env.example`): `OLLAMA_URL`, `OLLAMA_MODEL`, `SCORE_THRESHOLD`, `SCAN_INTERVAL_MINUTES`, `DOSSIER_URL`, `DOSSIER_PUBLIC_URL`.

MIT.
