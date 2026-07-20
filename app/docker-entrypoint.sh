#!/bin/sh
# /app/public/thumbs is bind-mounted from the host (deploy/data/thumbs) so nginx
# can serve thumbnails directly, without going through the app. A bind mount
# replaces whatever ownership the image baked in with the host directory's
# actual ownership — Docker auto-creates a fresh bind-mount source as root, so
# on a clean checkout the app's derivative writes 500 with EACCES until
# someone hand-chowns it. Fix that here, on every boot, before dropping to the
# unprivileged app user: idempotent, and survives a --fresh rebuild with no
# manual step.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/public/thumbs
  chown -R app:app /app/public/thumbs
  exec su-exec app "$@"
fi
exec "$@"
