#!/bin/bash
# The local side of a G4 round on Howard's Mac: round.sh with the Mac's exit for the arm, the API on 8797 and the
# forwarder on 8796 (8787 and 8791 belong to other work here), both stopped when the round ends.
#   direct    the forwarder sends everything to Clash (127.0.0.1:7890): this Mac reaches few of the sites without it, so
#             the local "direct" arm leaves through Clash's data-centre exit, not the Mac's own line (K3's arm A).
#   webshare  the forwarder sends everything to the Webshare gateway in RESIDENTIAL_PROXY (.w2l/access/competitors.env)
#             addressed by G4_WEBSHARE_IP, because this Mac's DNS forges p.webshare.io (K3 notes); the login stays
#             inside the forwarder's environment and is never printed.
# Usage: G4_WEBSHARE_IP=<gateway address> bash research/access/g4-cloudrun/local.sh direct|webshare
set -u
arm=${1:?direct or webshare}
export G4_WHERE=local G4_ARM=$arm API_PORT=8797 FORWARD_PORT=8796
export W2L_ACCESS_GRANT=${W2L_ACCESS_GRANT:-$HOME/Code/w2l/.w2l/access/installed-chrome-grant.json}
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy NO_PROXY no_proxy ALL_PROXY all_proxy
case $arm in
  direct) export UPSTREAM_PROXY=http://127.0.0.1:7890 ;;
  webshare)
    : "${G4_WEBSHARE_IP:?the gateway address}"
    UPSTREAM_PROXY=$(G4_ENV="$HOME/Code/w2l/.w2l/access/competitors.env" node -e '
      const line = require("fs").readFileSync(process.env.G4_ENV, "utf8").split("\n").find((l) => l.startsWith("RESIDENTIAL_PROXY="))
      const url = new URL(line.slice("RESIDENTIAL_PROXY=".length).trim().replace(/^["\x27]|["\x27]$/g, ""))
      url.hostname = process.env.G4_WEBSHARE_IP
      process.stdout.write(url.href)')
    export UPSTREAM_PROXY ;;
  *) echo "unknown arm $arm" >&2; exit 2 ;;
esac
exec bash "$(dirname "$0")/round.sh"
