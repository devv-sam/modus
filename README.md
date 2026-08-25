# Modus

Modus watches internship and hackathon sources and pushes new drops to your phone the moment they appear. Open source, bring-your-own everything, no always-on hardware.

v1 is a one-way alerter: it scans, dedupes, and pushes. You decide what to do with each ping. No auto-apply, by design.

## How it runs

A GitHub Actions cron job runs Modus every 15 minutes in the cloud. No server, no Raspberry Pi, no Mac. Fork the repo, set two things, done. Notifications arrive via [ntfy](https://ntfy.sh) as real push notifications, no account required.

## Setup (about 3 minutes)

1. **Fork this repo** (keep it public so scheduled Actions stay free and unlimited).
2. **Pick an ntfy topic.** Any hard-to-guess string, e.g. `modus-a7f3k9`. Install the ntfy app (iOS/Android) and subscribe to that topic.
3. **Add the topic as a repo secret:** Settings → Secrets and variables → Actions → New repository secret → name `NTFY_TOPIC`, value your topic.
4. **Enable Actions** on the Actions tab, then run the `modus scan` workflow once via "Run workflow". The first run seeds state and sends a single "Modus is live" confirmation.

## Configure what you watch

Edit `config/sources.json`:
- `filter.include` / `filter.exclude` — case-insensitive substrings matched against `title` and `company`.
- `sources` — each is a machine-readable listings feed plus a field map. Add any GitHub internship list that publishes a `listings.json`.

## Local run

```bash
npm install
npm run build
NTFY_TOPIC=your-topic npm start
```

## Roadmap (not in v1)

- Two-way triage (Telegram bot with Apply / Skip buttons)
- Apply handoff to [career-ops](https://github.com/santifer/career-ops): queue a role, tailor a CV locally, human submits
- More source kinds (Devpost/MLH hackathons, Greenhouse/Ashby/Lever boards)

MIT.
