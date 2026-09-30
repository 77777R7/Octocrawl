#!/bin/bash
# Claude Code on the web: install dependencies, build, and start W2L's local
# MCP service on 127.0.0.1:8791 so the project .mcp.json server connects.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
mkdir -p .w2l

# npm ci leaves package-lock.json untouched; rerun it only when the lockfile changed.
LOCK_SHA=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -f node_modules/.w2l-lock-sha256 ] || [ "$(cat node_modules/.w2l-lock-sha256)" != "$LOCK_SHA" ]; then
  npm ci --no-audit --no-fund >&2
  echo "$LOCK_SHA" > node_modules/.w2l-lock-sha256
fi
npx tsc --build >&2

# Playwright downloads are usually blocked in cloud sessions. If the Chromium
# revision this Playwright expects is not preinstalled, expose the newest
# preinstalled revision under the expected name.
PW_SOURCE="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
PW_TARGET="$PW_SOURCE"
read -r WANT_CHROMIUM WANT_SHELL < <(node -e '
  const b = require("./node_modules/playwright-core/browsers.json").browsers
  const rev = (name) => b.find((x) => x.name === name).revision
  console.log(rev("chromium"), rev("chromium-headless-shell"))')
if [ ! -d "$PW_SOURCE/chromium-$WANT_CHROMIUM" ] || [ ! -d "$PW_SOURCE/chromium_headless_shell-$WANT_SHELL" ]; then
  HAVE_CHROMIUM=$(ls -d "$PW_SOURCE"/chromium-[0-9]* 2>/dev/null | sort -V | tail -1)
  HAVE_SHELL=$(ls -d "$PW_SOURCE"/chromium_headless_shell-[0-9]* 2>/dev/null | sort -V | tail -1)
  if [ -n "$HAVE_CHROMIUM" ] && [ -n "$HAVE_SHELL" ]; then
    PW_TARGET="$CLAUDE_PROJECT_DIR/.w2l/pw-browsers"
    rm -rf "$PW_TARGET"
    mkdir -p "$PW_TARGET/chromium-$WANT_CHROMIUM" "$PW_TARGET/chromium_headless_shell-$WANT_SHELL/chrome-headless-shell-linux64"
    ln -s "$HAVE_CHROMIUM/chrome-linux" "$PW_TARGET/chromium-$WANT_CHROMIUM/chrome-linux64"
    for f in "$HAVE_SHELL"/chrome-linux/*; do
      ln -s "$f" "$PW_TARGET/chromium_headless_shell-$WANT_SHELL/chrome-headless-shell-linux64/"
    done
    ln -s "$HAVE_SHELL/chrome-linux/headless_shell" \
      "$PW_TARGET/chromium_headless_shell-$WANT_SHELL/chrome-headless-shell-linux64/chrome-headless-shell"
    touch "$PW_TARGET/chromium-$WANT_CHROMIUM/INSTALLATION_COMPLETE" \
      "$PW_TARGET/chromium_headless_shell-$WANT_SHELL/INSTALLATION_COMPLETE"
  fi
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PLAYWRIGHT_BROWSERS_PATH=\"$PW_TARGET\"" >> "$CLAUDE_ENV_FILE"
fi

# The cloud session's egress proxy re-terminates TLS. Node trusts its CA
# through NODE_EXTRA_CA_CERTS; Chromium reads the user NSS store instead, so
# without this the browser lane fails every https site with
# ERR_CERT_AUTHORITY_INVALID. Best effort: a missing tool leaves the http lane.
PROXY_CA=/root/.ccr/agent-proxy-ca.crt
if [ -f "$PROXY_CA" ]; then
  if ! command -v certutil >/dev/null 2>&1; then
    apt-get install -y libnss3-tools >/dev/null 2>&1 \
      || { apt-get update >/dev/null 2>&1 && apt-get install -y libnss3-tools >/dev/null 2>&1; } || true
  fi
  if command -v certutil >/dev/null 2>&1; then
    mkdir -p "$HOME/.pki/nssdb"
    [ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -d "sql:$HOME/.pki/nssdb" -N --empty-password >/dev/null 2>&1 || true
    certutil -d "sql:$HOME/.pki/nssdb" -L -n w2l-session-proxy-ca >/dev/null 2>&1 \
      || certutil -d "sql:$HOME/.pki/nssdb" -A -t "C,," -n w2l-session-proxy-ca -i "$PROXY_CA" >/dev/null 2>&1 || true
  fi
fi

PORT=8791
if ! curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
  PLAYWRIGHT_BROWSERS_PATH="$PW_TARGET" W2L_TASK_ROOT="$CLAUDE_PROJECT_DIR/.w2l/api" \
    nohup setsid node packages/mcp/dist/localHostCli.js >> .w2l/local-mcp.log 2>&1 < /dev/null &
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null && break
    sleep 1
  done
fi

if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
  echo "W2L local MCP service is running at http://127.0.0.1:$PORT/mcp (log: .w2l/local-mcp.log). Which external sites it can reach depends on this environment's network access setting."
else
  echo "W2L local MCP service did not become healthy; see .w2l/local-mcp.log." >&2
fi
