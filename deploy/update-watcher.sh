#!/usr/bin/env bash
# Self-update watcher — the host-side half of the admin panel's "Update now"
# button. Run continuously on the HOST (outside Docker) via the systemd unit
# in this directory, never inside a container.
#
# Security model: the `app` container is bind-mounted read-write into
# deploy/data/update/ (see docker-compose.yml) and can only ever create an
# empty `request` file there — it has no git, no Docker CLI, no socket
# access, and runs as an unprivileged user. This script is the ONLY thing
# that ever turns that file's existence into `git pull && docker compose
# build && docker compose up -d`. If the app container were ever
# compromised, the blast radius is "can flip one file," not "controls the
# host's Docker daemon." See "Self-update" in HANDOFF.md for the full
# rationale and one-time install steps.
#
# Every 30s: fetch, report how far behind origin the checkout is, and — only
# if the admin panel dropped a `request` file — pull and redeploy.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root (this script lives in deploy/)

STATE_DIR="deploy/data/update"
STATUS="$STATE_DIR/status.json"
REQUEST="$STATE_DIR/request"
LOG="$STATE_DIR/update.log"
mkdir -p "$STATE_DIR"

LAST_RESULT=""
LAST_ERROR=""

write_status() {
  local updating="$1" latest="$2" behind="$3"
  cat > "$STATUS" <<JSON
{"checked_at":"$(date -u +%FT%TZ)","updating":$updating,"latest_sha":"$latest","behind_by":$behind,"last_result":"$LAST_RESULT","last_error":"$LAST_ERROR"}
JSON
}

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

while true; do
  git fetch --quiet origin "$BRANCH" >>"$LOG" 2>&1 || true
  LATEST="$(git rev-parse --short "origin/$BRANCH" 2>/dev/null || echo unknown)"
  BEHIND="$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)"

  if [ -f "$REQUEST" ]; then
    rm -f "$REQUEST"
    write_status true "$LATEST" "$BEHIND"
    echo "=== update started $(date -u +%FT%TZ) ===" >> "$LOG"
    if git pull >>"$LOG" 2>&1 \
      && GIT_SHA="$(git rev-parse --short HEAD)" \
      && ( cd deploy && docker compose build --build-arg GIT_SHA="$GIT_SHA" app worker ) >>"$LOG" 2>&1 \
      && ( cd deploy && docker compose up -d ) >>"$LOG" 2>&1; then
      echo "=== update finished ok $(date -u +%FT%TZ) ===" >> "$LOG"
      LAST_RESULT="success"; LAST_ERROR=""
      BEHIND=0
    else
      echo "=== update FAILED $(date -u +%FT%TZ) ===" >> "$LOG"
      LAST_RESULT="error"; LAST_ERROR="Update failed — check update.log on the server (deploy/data/update/update.log)."
    fi
    write_status false "$LATEST" "$BEHIND"
  else
    write_status false "$LATEST" "$BEHIND"
  fi
  sleep 30
done
