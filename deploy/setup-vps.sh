#!/usr/bin/env bash
# One-time Modus setup on a fresh Ubuntu LTS droplet.
# Run as a non-root sudo user:  ./setup-vps.sh <git-repo-url> <discord-token> <discord-channel-id>
set -euo pipefail

REPO_URL="${1:-}"; TOKEN="${2:-}"; CHANNEL="${3:-}"
if [[ -z "$REPO_URL" || -z "$TOKEN" || -z "$CHANNEL" ]]; then
  echo "Usage: ./setup-vps.sh <git-repo-url> <discord-token> <discord-channel-id>"; exit 1
fi
APP_DIR="/opt/modus"; RUN_USER="$(whoami)"

# 1. Light hardening
sudo apt-get update -y
sudo apt-get install -y ufw unattended-upgrades git curl
sudo ufw allow OpenSSH && sudo ufw --force enable

# 2. Node 20 LTS
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 3. Clone + build
sudo mkdir -p "$APP_DIR"; sudo chown "$RUN_USER":"$RUN_USER" "$APP_DIR"
git clone "$REPO_URL" "$APP_DIR" 2>/dev/null || (cd "$APP_DIR" && git pull)
cd "$APP_DIR"; npm ci; npm run build

# 4. Secrets (env overrides config, stays out of git)
{ echo "DISCORD_TOKEN=$TOKEN"; echo "DISCORD_CHANNEL_ID=$CHANNEL"; } | sudo tee /etc/modus.env >/dev/null
sudo chmod 600 /etc/modus.env

# 5. Install + start the persistent service
sudo cp deploy/modus.service /etc/systemd/system/modus.service
sudo sed -i "s|^User=.*|User=$RUN_USER|; s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/modus.service
sudo systemctl daemon-reload
sudo systemctl enable --now modus.service

echo; echo "Done. Logs: journalctl -u modus.service -f"
