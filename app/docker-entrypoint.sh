#!/bin/sh
# /app/public/thumbs is bind-mounted from the host (deploy/data/thumbs, or
# /srv/msc-thumbs — see the "Thumbnails 403" note in HANDOFF.md for why it
# moved) so nginx can serve thumbnails directly, without going through the
# app. A bind mount replaces whatever ownership the image baked in with the
# host directory's actual ownership — Docker auto-creates a fresh bind-mount
# source as root, so on a clean checkout the app's derivative writes 500 with
# EACCES until someone hand-fixes it. Fix that here, on every boot, before
# dropping to the unprivileged app user: idempotent, and survives a --fresh
# rebuild (or a host directory relocation) with no manual step beyond moving
# the files themselves.
#
# chmod a+rX (not just chown) matters here too: nginx runs as a different
# user (www-data) than the app container (uid 100), so ownership alone isn't
# enough — the directory tree needs to be world-readable/traversable for
# nginx to serve out of it.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/public/thumbs
  chown -R app:app /app/public/thumbs
  chmod -R a+rX /app/public/thumbs
  # Same bind-mount-arrives-root-owned issue as thumbs above, for the
  # self-update state directory (deploy/data/update, see docker-compose.yml
  # and "Self-update" in HANDOFF.md). Only the app user and the host-side
  # watcher (running as root) ever touch this, so no chmod a+rX needed.
  mkdir -p /app/update-state
  chown -R app:app /app/update-state
  exec su-exec app "$@"
fi
exec "$@"
