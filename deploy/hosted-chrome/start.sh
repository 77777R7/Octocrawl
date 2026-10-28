#!/bin/bash
# The octocrawl-chrome service's start (Dockerfile.hosted-chrome): Xvfb as the display hosted_chrome's headed Chrome opens
# its window on, then the service (packages/mcp/src/hostedChromeCli.ts). tini (PID 1, -g) forwards Cloud Run's SIGTERM to
# both and reaps Chrome's children; the service closes its Chrome and deletes its profile on SIGTERM.
set -euo pipefail
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99
# Xvfb's socket appears within a second on Cloud Run gen2 (G4, 2026-10-21); the service refuses to start without it.
for _ in $(seq 1 100); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
[ -S /tmp/.X11-unix/X99 ] || { echo '{"severity":"ERROR","event":"hosted_chrome_no_display"}'; exit 1; }
exec node packages/mcp/dist/hostedChromeCli.js
