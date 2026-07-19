#!/usr/bin/env bash
# Pull latest code and redeploy. Run on the server from /root/pr-gallery.
#   ./deploy/update.sh          normal
#   ./deploy/update.sh --fresh  force a no-cache rebuild (use if a change won't take)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "→ pulling latest…"; git pull
cd deploy
if [[ "${1:-}" == "--fresh" ]]; then
  echo "→ rebuilding (no cache)…"; docker compose build --no-cache app worker
else
  echo "→ building…"; docker compose build app worker
fi
echo "→ starting…"; docker compose up -d
echo "→ status:"; docker compose ps
echo "✓ done. Logs: docker compose logs app --tail 50"
